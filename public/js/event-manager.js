// event-manager.js

import { Utils } from "./utils.js";

export class EventManager {
  constructor(state, domManager, uiController, tradingManager, chartManager) {
    this.state = state;
    this.dom = domManager;
    this.ui = uiController;
    this.trading = tradingManager;
    this.chart = chartManager;
  }

  setupAllEventListeners() {
    this.setupOrderbookEvents();
    this.setupChartEvents();
    this.setupTradingEvents();
    this.setupInputEvents();
    this.setupButtonEvents();
    this.setupTradeHistoryTabEvents();
    this.setupOrderListButtonEvents();
  }

  setupTradeHistoryTabEvents() {
    this.dom.elements.pendingOrdersTab?.addEventListener("click", () => {
      this.dom.elements.pendingOrdersTab.classList.add("active");
      this.dom.elements.filledOrdersTab.classList.remove("active");
      this.dom.elements.pendingOrdersSection.classList.remove("hidden");
      this.dom.elements.filledOrdersSection.classList.add("hidden");
      this.ui.showPendingOrders();
    });

    this.dom.elements.filledOrdersTab?.addEventListener("click", () => {
      this.dom.elements.filledOrdersTab.classList.add("active");
      this.dom.elements.pendingOrdersTab.classList.remove("active");
      this.dom.elements.pendingOrdersSection.classList.add("hidden");
      this.dom.elements.filledOrdersSection.classList.remove("hidden");
      this.ui.showFilledOrders();
    });
  }

  setupOrderListButtonEvents() {
    this.dom.elements.refreshPendingOrders?.addEventListener("click", () => {
      this.trading.fetchPendingOrders();
    });

    this.dom.elements.refreshFilledOrders?.addEventListener("click", () => {
      this.trading.fetchFilledOrders();
    });

    this.dom.elements.pendingOrdersList?.addEventListener(
      "click",
      async (e) => {
        const cancelBtn = e.target.closest(".cancel-btn");
        if (cancelBtn) {
          const orderId = cancelBtn.dataset.orderId;
          if (orderId) {
            await this.trading.cancelOrder(orderId);

            // 취소 후 대기주문과 체결내역 새로고침
            const pendingOrders = await this.trading.fetchPendingOrders();
            this.ui.updatePendingOrdersList(pendingOrders);

            const filledOrders = await this.trading.fetchFilledOrders();
            this.ui.updateFilledOrdersList(filledOrders);
          }
        }
      }
    );
  }

  setupOrderbookEvents() {
    this.dom.elements.toggleGeneral?.addEventListener("click", () => {
      this.state.activeOrderbookType = "general";
      this.dom.elements.toggleGeneral.classList.add("active");
      this.dom.elements.toggleGrouped.classList.remove("active");
      this.dom.elements.generalOrderbookContainer.classList.remove("hidden");
      this.dom.elements.groupedOrderbookContainer.classList.add("hidden");
      this.ui.updateOrderbook(
        this.state.latestOrderbookData[this.state.activeCoin]?.general,
        this.dom.elements.generalAskList,
        this.dom.elements.generalBidList
      );
    });

    this.dom.elements.toggleGrouped?.addEventListener("click", () => {
      this.state.activeOrderbookType = "grouped";
      this.dom.elements.toggleGeneral.classList.remove("active");
      this.dom.elements.toggleGrouped.classList.add("active");
      this.dom.elements.generalOrderbookContainer.classList.add("hidden");
      this.dom.elements.groupedOrderbookContainer.classList.remove("hidden");
      this.ui.updateOrderbook(
        this.state.latestOrderbookData[this.state.activeCoin]?.grouped,
        this.dom.elements.groupedAskList,
        this.dom.elements.groupedBidList
      );
    });
  }

  setupChartEvents() {
    this.dom.elements.timeTabs?.addEventListener("click", (e) => {
      const btn = e.target.closest(".time-tab");
      if (btn) {
        this.dom.elements.timeTabs
          .querySelectorAll(".time-tab")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.state.activeUnit = btn.dataset.unit;
        this.chart.fetchAndRender();
      }
    });
  }

  setupTradingEvents() {
    this.dom.elements.tradingTabs?.addEventListener("click", (e) => {
      const tab = e.target.closest(".trading-tab");
      if (tab) {
        this.dom.elements.tradingTabs
          .querySelectorAll(".trading-tab")
          .forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        this.state.activeTradingSide = tab.dataset.side;
        this.ui.updateTradingPanel();
        this.trading.fetchUserBalance();
      }
    });

    this.dom.elements.tradingTypeBtns?.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.classList.contains("disabled")) return;

        this.dom.elements.tradingTypeBtns.forEach((b) =>
          b.classList.remove("active")
        );
        btn.classList.add("active");

        this.state.activeTradingType = btn.dataset.type;
        this.ui.updateTradingPanel();
      });
    });

    this.dom.elements.tradeButtons?.forEach((btn) => {
      btn.addEventListener("click", () => {
        const side = btn.classList.contains("bid-button") ? "bid" : "ask";
        this.trading.sendOrder(side);
      });
    });
  }

  setupInputEvents() {
    this.dom.elements.orderPriceInput?.addEventListener("input", (e) => {
      const value = Utils.parseNumber(e.target.value);
      e.target.value = Utils.formatKRW(value);
      this.ui.updateOrderTotal();
    });

    this.dom.elements.orderQuantityInput?.addEventListener("input", () => {
      this.ui.updateOrderTotal();
    });

    this.dom.elements.orderTotalMarketInput?.addEventListener("input", (e) => {
      const value = Utils.parseNumber(e.target.value);
      e.target.value = Utils.formatKRW(value);
      this.ui.updateMarketQuantity();
    });

    this.dom.elements.pricePercentageDropdown?.addEventListener(
      "change",
      (e) => {
        const currentPrice =
          this.state.latestTickerData[this.state.activeCoin]?.trade_price || 0;
        const percent = parseInt(e.target.value) / 100;
        const newPrice = Math.floor(currentPrice * (1 + percent));

        if (this.dom.elements.orderPrice) {
          this.dom.elements.orderPrice.value = Utils.formatKRW(newPrice);
          this.ui.updateOrderTotal();
        }
      }
    );
  }

  setupButtonEvents() {
    this.dom.elements.priceBtns?.forEach((btn) => {
      btn.addEventListener("click", () => {
        const direction = btn.classList.contains("minus") ? "down" : "up";
        this.trading.adjustPrice(direction);
      });
    });

    this.dom.elements.quantityBtns?.forEach((btn) => {
      btn.addEventListener("click", () => {
        const percent = parseInt(btn.dataset.percent);
        this.trading.calculatePercentageAmount(percent);
        this.ui.updateOrderTotal();
      });
    });
  }
}
