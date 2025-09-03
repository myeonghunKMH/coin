// src/services/trading-service.js
const KRWUtils = require("../utils/krw-utils");
const CONFIG = require("../config");

class TradingService {
  constructor(dbManager, wsManager) {
    this.db = dbManager;
    this.ws = wsManager;
  }

  calculateTradeAmounts(
    market,
    side,
    type,
    normalizedPrice,
    normalizedQuantity
  ) {
    let finalPrice, finalQuantity, totalAmount;

    if (type === "market") {
      const currentPrice = this.ws.getCurrentPrice(market);
      if (!currentPrice) {
        throw new Error("현재 시장가를 가져올 수 없습니다.");
      }

      if (side === "bid") {
        // 시장가 매수: 총액 기준
        totalAmount = KRWUtils.toInteger(normalizedPrice);
        finalPrice = KRWUtils.toInteger(currentPrice);
        finalQuantity = totalAmount / finalPrice;
      } else {
        // 시장가 매도: 수량 기준
        finalQuantity = normalizedQuantity;
        finalPrice = KRWUtils.toInteger(currentPrice);
        totalAmount = KRWUtils.calculateTotal(finalPrice, finalQuantity);
      }
    } else {
      // 지정가 주문
      finalPrice = KRWUtils.toInteger(normalizedPrice);
      finalQuantity = normalizedQuantity;
      totalAmount = KRWUtils.calculateTotal(finalPrice, finalQuantity);

      console.log(
        `📝 지정가 주문 접수: ${market} ${side} - 가격: ${finalPrice.toLocaleString()}, 수량: ${finalQuantity}, 총액: ${totalAmount.toLocaleString()}`
      );
    }

    return { finalPrice, finalQuantity, totalAmount };
  }

  async executeOrder(market, side, type, normalizedPrice, normalizedQuantity) {
    const userId = await this.db.getUserById(CONFIG.DEFAULT_USER);
    if (!userId) {
      throw new Error("사용자를 찾을 수 없습니다.");
    }

    const { finalPrice, finalQuantity, totalAmount } =
      this.calculateTradeAmounts(
        market,
        side,
        type,
        normalizedPrice,
        normalizedQuantity
      );

    // 👇 이 부분이 핵심 수정
    if (type === "limit") {
      console.log("지정가 주문 처리 중:", type);
      // 지정가 주문은 대기 주문으로 처리
      return await this.db.createPendingOrder(
        userId,
        market,
        side,
        finalPrice,
        finalQuantity,
        totalAmount,
        type
      );
    } else {
      console.log("시장가 주문 처리 중:", type);
      // 시장가 주문은 즉시 체결
      await this.db.executeTradeTransaction(
        userId,
        market,
        side,
        finalPrice,
        finalQuantity,
        totalAmount,
        type
      );

      return {
        market,
        side,
        type,
        price: KRWUtils.toInteger(finalPrice),
        quantity: finalQuantity,
        totalAmount: KRWUtils.toInteger(totalAmount),
      };
    }
  }
}
module.exports = TradingService;
