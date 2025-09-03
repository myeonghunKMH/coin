// DOMManager.js

import { Utils } from "./utils.js";

export class DOMManager {
  constructor() {
    this.elements = this.getElements();
  }

  getElements() {
    return {
      pendingOrdersTab: document.getElementById("pending-orders-tab"),
      filledOrdersTab: document.getElementById("filled-orders-tab"),
      pendingOrdersSection: document.getElementById("pending-orders-section"),
      filledOrdersSection: document.getElementById("filled-orders-section"),
      refreshPendingOrders: document.getElementById("refresh-pending-orders"),
      refreshFilledOrders: document.getElementById("refresh-filled-orders"),

      availableAmount: document.getElementById("available-amount"),
      orderPrice: document.getElementById("order-price"),
      orderQuantity: document.getElementById("order-quantity"),
      orderTotal: document.getElementById("order-total"),
      orderTotalMarket: document.getElementById("order-total-market"),
      pricePercentageDropdown: document.getElementById(
        "price-percentage-dropdown"
      ),

      // 이벤트 리스너용 추가
      orderPriceInput: document.getElementById("order-price"),
      orderQuantityInput: document.getElementById("order-quantity"),
      orderTotalMarketInput: document.getElementById("order-total-market"),

      coinTabs: document.getElementById("coin-tabs"),
      coinSummary: document.getElementById("coin-summary"),
      chartCanvas: document.getElementById("coinChart"),

      generalAskList: document.getElementById("general-ask-list"),
      generalBidList: document.getElementById("general-bid-list"),
      groupedAskList: document.getElementById("grouped-ask-list"),
      groupedBidList: document.getElementById("grouped-bid-list"),

      pendingOrdersList: document.getElementById("pending-orders-list"),
      filledOrdersList: document.getElementById("filled-orders-list"),

      tradingTabs: document.querySelector(".trading-tabs"),
      tradingTypeBtns: document.querySelectorAll(".trading-type-btn"),
      tradeButtons: document.querySelectorAll(".trade-button"),
      timeTabs: document.getElementById("time-tabs"),
      toggleGeneral: document.getElementById("toggle-general"),
      toggleGrouped: document.getElementById("toggle-grouped"),
      generalOrderbookContainer: document.getElementById(
        "general-orderbook-container"
      ),
      groupedOrderbookContainer: document.getElementById(
        "grouped-orderbook-container"
      ),
      priceBtns: document.querySelectorAll(".price-btn"),
      quantityBtns: document.querySelectorAll(".quantity-btns button"),
    };
  }

  updateAvailableAmount(amount, unit = "KRW") {
    if (this.elements.availableAmount) {
      if (unit === "KRW") {
        this.elements.availableAmount.textContent = `${Utils.formatKRW(
          amount
        )} KRW`;
      } else {
        this.elements.availableAmount.textContent = `${Utils.formatCoinAmount(
          amount
        )} ${unit}`;
      }
    }
  }

  setOrderPrice(price) {
    if (this.elements.orderPrice) {
      this.elements.orderPrice.value = Utils.formatKRW(price);
    }
  }

  setOrderQuantity(quantity) {
    if (this.elements.orderQuantity) {
      this.elements.orderQuantity.value = Utils.formatCoinAmount(quantity);
    }
  }

  setOrderTotalMarket(total) {
    if (this.elements.orderTotalMarket) {
      this.elements.orderTotalMarket.value = Utils.formatKRW(total);
    }
  }

  showOrderResult(message, isSuccess = true) {
    const toast = document.createElement("div");
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${isSuccess ? "#00C851" : "#C84A31"};
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => (toast.style.opacity = "1"), 10);

    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
  }
}
