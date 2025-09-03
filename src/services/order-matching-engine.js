// src/services/order-matching-engine.js
const KRWUtils = require("../utils/krw-utils");

class OrderMatchingEngine {
  constructor(dbManager) {
    this.db = dbManager;
    this.isProcessing = false;
  }

  /**
   * 호가창 데이터를 받아서 대기 주문과 매칭 처리
   */
  async processOrderbook(market, orderbookData) {
    if (this.isProcessing || !orderbookData?.orderbook_units) {
      return;
    }

    this.isProcessing = true;

    try {
      // 해당 마켓의 대기 주문들을 가져옴
      const pendingOrders = await this.db.getMarketPendingOrders(market);

      if (pendingOrders.length === 0) {
        return;
      }

      // 매수/매도 주문 분리
      const buyOrders = pendingOrders.filter((order) => order.side === "bid");
      const sellOrders = pendingOrders.filter((order) => order.side === "ask");

      // 호가창에서 매도호가(asks)와 매수호가(bids) 추출
      const asks = orderbookData.orderbook_units
        .map((unit) => ({
          price: KRWUtils.toInteger(unit.ask_price),
          size: unit.ask_size,
        }))
        .filter((ask) => ask.price > 0);

      const bids = orderbookData.orderbook_units
        .map((unit) => ({
          price: KRWUtils.toInteger(unit.bid_price),
          size: unit.bid_size,
        }))
        .filter((bid) => bid.price > 0);

      // 매수 주문 체결 처리 (호가창의 매도호가와 매칭)
      for (const buyOrder of buyOrders) {
        await this.matchBuyOrder(buyOrder, asks);
      }

      // 매도 주문 체결 처리 (호가창의 매수호가와 매칭)
      for (const sellOrder of sellOrders) {
        await this.matchSellOrder(sellOrder, bids);
      }
    } catch (error) {
      console.error(`❌ 주문 매칭 처리 오류 (${market}):`, error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 매수 주문과 호가창의 매도호가 매칭
   */
  async matchBuyOrder(buyOrder, asks) {
    const orderPrice = KRWUtils.toInteger(buyOrder.price);

    // 주문 가격 이하의 매도호가 찾기 (가격 오름차순 정렬)
    const matchableAsks = asks
      .filter((ask) => ask.price <= orderPrice)
      .sort((a, b) => a.price - b.price);

    if (matchableAsks.length === 0) {
      return; // 체결 가능한 가격 없음
    }

    let remainingQuantity = buyOrder.remaining_quantity;

    for (const ask of matchableAsks) {
      if (remainingQuantity <= 0) break;

      const executableQuantity = Math.min(remainingQuantity, ask.size);
      const executionPrice = ask.price;

      if (executableQuantity > 0) {
        console.log(
          `💰 매수 체결: ${
            buyOrder.market
          } - 가격: ${executionPrice.toLocaleString()}, 수량: ${executableQuantity}`
        );

        await this.executeTrade(
          buyOrder,
          executionPrice,
          executableQuantity,
          remainingQuantity - executableQuantity
        );

        remainingQuantity -= executableQuantity;
        ask.size -= executableQuantity; // 호가창 물량 차감
      }
    }
  }

  /**
   * 매도 주문과 호가창의 매수호가 매칭
   */
  async matchSellOrder(sellOrder, bids) {
    const orderPrice = KRWUtils.toInteger(sellOrder.price);

    // 주문 가격 이상의 매수호가 찾기 (가격 내림차순 정렬)
    const matchableBids = bids
      .filter((bid) => bid.price >= orderPrice)
      .sort((a, b) => b.price - a.price);

    if (matchableBids.length === 0) {
      return; // 체결 가능한 가격 없음
    }

    let remainingQuantity = sellOrder.remaining_quantity;

    for (const bid of matchableBids) {
      if (remainingQuantity <= 0) break;

      const executableQuantity = Math.min(remainingQuantity, bid.size);
      const executionPrice = bid.price;

      if (executableQuantity > 0) {
        console.log(
          `💸 매도 체결: ${
            sellOrder.market
          } - 가격: ${executionPrice.toLocaleString()}, 수량: ${executableQuantity}`
        );

        await this.executeTrade(
          sellOrder,
          executionPrice,
          executableQuantity,
          remainingQuantity - executableQuantity
        );

        remainingQuantity -= executableQuantity;
        bid.size -= executableQuantity; // 호가창 물량 차감
      }
    }
  }

  /**
   * 실제 거래 체결 처리
   */
  async executeTrade(
    order,
    executionPrice,
    executedQuantity,
    remainingQuantity
  ) {
    const totalAmount = KRWUtils.calculateTotal(
      executionPrice,
      executedQuantity
    );

    try {
      // 트랜잭션 시작
      await this.db.executeOrderFillTransaction(
        order.user_id,
        order.id,
        order.market,
        order.side,
        executionPrice,
        executedQuantity,
        totalAmount,
        remainingQuantity
      );

      console.log(
        `✅ 체결 완료 - 주문ID: ${
          order.id
        }, 체결가: ${executionPrice.toLocaleString()}, 체결량: ${executedQuantity}, 잔여량: ${remainingQuantity}`
      );
    } catch (error) {
      console.error(`❌ 거래 체결 처리 실패 (주문ID: ${order.id}):`, error);
      throw error;
    }
  }
}

module.exports = OrderMatchingEngine;
