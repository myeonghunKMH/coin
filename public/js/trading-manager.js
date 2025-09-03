// TradingManager.js

import { Utils } from "./utils.js";

export class TradingManager {
  constructor(state, domManager) {
    this.state = state;
    this.dom = domManager;
  }

  async cancelOrder(orderId) {
    if (!orderId) {
      this.dom.showOrderResult("주문 ID가 없습니다.", false);
      return;
    }

    if (!confirm("정말로 이 주문을 취소하시겠습니까?")) {
      return;
    }

    try {
      const response = await fetch(`/api/pending-orders/${orderId}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (response.ok) {
        this.dom.showOrderResult(result.message, true);
        await this.fetchPendingOrders();
        await this.fetchUserBalance();
      } else {
        this.dom.showOrderResult(
          result.error || "주문 취소에 실패했습니다.",
          false
        );
      }
    } catch (error) {
      console.error("주문 취소 오류:", error);
      this.dom.showOrderResult("주문 취소 중 오류가 발생했습니다.", false);
    }
  }

  async sendOrder(side) {
    const orderData = {
      market: this.state.activeCoin,
      side: side,
      type: this.state.activeTradingType,
    };

    if (this.state.activeTradingType === "limit") {
      const price = Utils.parseNumber(this.dom.elements.orderPrice?.value);
      const quantity = Utils.parseNumber(
        this.dom.elements.orderQuantity?.value
      );

      if (!this.validateLimitOrder(price, quantity)) return;
      orderData.price = price;
      orderData.quantity = quantity;
    } else if (this.state.activeTradingType === "market") {
      if (side === "bid") {
        const totalAmount = Utils.parseNumber(
          this.dom.elements.orderTotalMarket?.value
        );
        if (!this.validateMarketBuyOrder(totalAmount)) return;
        orderData.price = totalAmount;
        orderData.quantity = 0;
      } else {
        const quantity = Utils.parseNumber(
          this.dom.elements.orderQuantity?.value
        );
        if (!this.validateMarketSellOrder(quantity)) return;
        orderData.quantity = quantity;
        orderData.price = 0;
      }
    }

    try {
      const response = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });

      const result = await response.json();

      if (response.ok) {
        this.dom.showOrderResult(result.message, true);

        if (result.orderDetails?.status === "pending") {
          this.dom.showOrderResult(
            `지정가 주문이 대기열에 추가되었습니다. (주문ID: ${result.orderDetails.orderId})`,
            true
          );
        }

        // 주문 성공 후 필요한 데이터들을 새로고침하고 반환
        await this.fetchUserBalance();
        const pendingOrders = await this.fetchPendingOrders();
        const filledOrders = await this.fetchFilledOrders();

        this.clearOrderInputs();

        return { pendingOrders, filledOrders };
      } else {
        this.dom.showOrderResult(
          result.error || "주문 처리 중 오류가 발생했습니다.",
          false
        );
      }
    } catch (error) {
      console.error("주문 요청 오류:", error);
      this.dom.showOrderResult("주문 요청 중 오류가 발생했습니다.", false);
    }

    return null;
  }

  clearOrderInputs() {
    if (this.state.activeTradingType === "limit") {
      if (this.dom.elements.orderQuantity) {
        this.dom.elements.orderQuantity.value = "";
      }
      if (this.dom.elements.orderTotal) {
        this.dom.elements.orderTotal.value = "";
      }
    } else if (this.state.activeTradingType === "market") {
      if (this.state.activeTradingSide === "bid") {
        if (this.dom.elements.orderTotalMarket) {
          this.dom.elements.orderTotalMarket.value = "";
        }
      } else {
        if (this.dom.elements.orderQuantity) {
          this.dom.elements.orderQuantity.value = "";
        }
      }
    }
  }

  validateLimitOrder(price, quantity) {
    if (!price || !quantity || price <= 0 || quantity <= 0) {
      this.dom.showOrderResult(
        "주문 가격과 수량을 올바르게 입력해주세요.",
        false
      );
      return false;
    }
    return true;
  }

  validateMarketBuyOrder(totalAmount) {
    if (!totalAmount || totalAmount <= 0) {
      this.dom.showOrderResult("주문 총액을 올바르게 입력해주세요.", false);
      return false;
    }
    return true;
  }

  validateMarketSellOrder(quantity) {
    if (!quantity || quantity <= 0) {
      this.dom.showOrderResult("주문 수량을 올바르게 입력해주세요.", false);
      return false;
    }
    return true;
  }

  async fetchUserBalance() {
    try {
      const response = await fetch("/api/balance");
      if (!response.ok) {
        throw new Error("잔고 정보를 가져오는 데 실패했습니다.");
      }

      const data = await response.json();
      this.state.userKRWBalance = Math.floor(data.krw_balance || 0);
      this.state.userCoinBalance = {
        "KRW-BTC": data.btc_balance || 0,
        "KRW-ETH": data.eth_balance || 0,
        "KRW-XRP": data.xrp_balance || 0,
      };
    } catch (error) {
      console.error("잔고 데이터 로딩 오류:", error);
    }
  }

  async fetchFilledOrders() {
    try {
      const response = await fetch("/api/transactions");
      if (!response.ok) {
        throw new Error("거래 내역을 가져오는 데 실패했습니다.");
      }

      const data = await response.json();
      this.state.filledOrders = data || [];

      return this.state.filledOrders;
    } catch (error) {
      console.error("체결 내역 조회 오류:", error);
      this.state.filledOrders = [];
      return [];
    }
  }

  async fetchPendingOrders() {
    try {
      const response = await fetch("/api/pending-orders");
      if (!response.ok) {
        throw new Error("대기 주문을 가져오는 데 실패했습니다.");
      }

      const data = await response.json();
      this.state.pendingOrders = data || [];

      return this.state.pendingOrders;
    } catch (error) {
      console.error("대기 주문 조회 오류:", error);
      this.state.pendingOrders = [];
      return [];
    }
  }

  calculatePercentageAmount(percent) {
    const percentage = percent / 100;

    if (this.state.activeTradingType === "limit") {
      if (this.state.activeTradingSide === "bid") {
        const orderPrice = Utils.parseNumber(
          this.dom.elements.orderPrice?.value
        );
        if (orderPrice > 0) {
          const quantity =
            (this.state.userKRWBalance * percentage) / orderPrice;
          this.dom.setOrderQuantity(quantity);
        }
      } else {
        const quantity =
          this.state.userCoinBalance[this.state.activeCoin] * percentage;
        this.dom.setOrderQuantity(quantity);
      }
    } else if (this.state.activeTradingType === "market") {
      if (this.state.activeTradingSide === "bid") {
        const totalAmount = Math.floor(this.state.userKRWBalance * percentage);
        this.dom.setOrderTotalMarket(totalAmount);
      } else {
        const quantity =
          this.state.userCoinBalance[this.state.activeCoin] * percentage;
        this.dom.setOrderQuantity(quantity);
      }
    }
  }

  adjustPrice(direction) {
    const currentPrice =
      Utils.parseNumber(this.dom.elements.orderPrice?.value) || 0;
    const step = Utils.getPriceStep(currentPrice);
    const newPrice =
      direction === "up"
        ? currentPrice + step
        : Math.max(0, currentPrice - step);

    this.dom.setOrderPrice(newPrice);
  }
}
