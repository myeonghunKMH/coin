// event-manager.js - 최종 수정된 버전

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
    // 🔄 전체 새로고침 버튼만 유지
    this.dom.elements.refreshAllOrders?.addEventListener("click", async () => {
      this.showRefreshSpinner("all");
      try {
        await this.trading.refreshAllData();
        this.dom.showOrderResult("모든 데이터가 새로고침되었습니다.", true);
      } catch (error) {
        this.dom.showOrderResult("새로고침 중 오류가 발생했습니다.", false);
        console.error("새로고침 오류:", error);
      } finally {
        this.hideRefreshSpinner("all");
      }
    });

    // 주문 취소 이벤트
    this.dom.elements.pendingOrdersList?.addEventListener(
      "click",
      async (e) => {
        const cancelBtn = e.target.closest(".cancel-btn");
        if (cancelBtn) {
          const orderId = cancelBtn.dataset.orderId;
          if (orderId) {
            // 🔧 취소 후 자동 새로고침 (cancelOrder 내부에서 처리)
            await this.trading.cancelOrder(orderId);
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
      btn.addEventListener("click", async () => {
        const side = btn.classList.contains("bid-button") ? "bid" : "ask";
        const result = await this.trading.sendOrder(side);

        // 🔧 주문 성공 후 UI 자동 업데이트 (sendOrder에서 이미 처리됨)
        if (result?.success) {
          // 추가로 필요한 UI 업데이트가 있다면 여기서 처리
        }
      });
    });
  }

  // 🔧 개선된 입력 이벤트 (주문총액 입력 추가)
  setupInputEvents() {
    // 가격 입력 이벤트
    this.dom.elements.orderPriceInput?.addEventListener("input", (e) => {
      const value = Utils.parseNumber(e.target.value);
      const adjustedPrice = Utils.adjustPriceToStep(
        value,
        this.state.activeCoin
      );
      e.target.value = Utils.formatKRW(adjustedPrice);

      // 🔧 가격 변경 시 총액 업데이트 (수량이 있는 경우)
      const quantity =
        Utils.parseNumber(this.dom.elements.orderQuantity?.value) || 0;
      if (quantity > 0) {
        this.ui.updateOrderTotal();
      } else {
        // 🔧 총액이 이미 입력되어 있으면 수량 계산
        this.ui.updateQuantityFromPrice();
      }
    });

    // 수량 입력 이벤트
    this.dom.elements.orderQuantityInput?.addEventListener("input", () => {
      // 🔧 수량 변경 시 총액 업데이트
      this.ui.updateOrderTotal();
    });

    // 🔧 주문총액 입력 이벤트 (1000원 단위 적용)
    this.dom.elements.orderTotalInput?.addEventListener("input", (e) => {
      let value = Utils.parseNumber(e.target.value);

      // 🔧 비트코인/이더리움의 경우 1000원 단위로 조정
      if (
        this.state.activeCoin === "KRW-BTC" ||
        this.state.activeCoin === "KRW-ETH"
      ) {
        value = Math.floor(value / 1000) * 1000;
      }

      e.target.value = Utils.formatKRW(value);

      // 총액 변경 시 수량 자동 계산
      this.ui.updateQuantityFromTotal();
    });

    // 시장가 주문총액 입력 이벤트 (1000원 단위 적용)
    this.dom.elements.orderTotalMarketInput?.addEventListener("input", (e) => {
      let value = Utils.parseNumber(e.target.value);

      // 🔧 비트코인/이더리움의 경우 1000원 단위로 조정
      if (
        this.state.activeCoin === "KRW-BTC" ||
        this.state.activeCoin === "KRW-ETH"
      ) {
        value = Math.floor(value / 1000) * 1000;
      }

      e.target.value = Utils.formatKRW(value);
      this.ui.updateMarketQuantity();
    });

    // 🔧 현재가 대비 % 선택 시 코인별 호가 단위 적용
    this.dom.elements.pricePercentageDropdown?.addEventListener(
      "change",
      (e) => {
        const currentPrice =
          this.state.latestTickerData[this.state.activeCoin]?.trade_price || 0;
        const percent = parseInt(e.target.value) / 100;

        // 🔧 코인별 호가 단위를 적용한 가격 계산
        const newPrice = Utils.calculatePriceWithPercentage(
          currentPrice,
          percent * 100,
          this.state.activeCoin
        );

        if (this.dom.elements.orderPrice) {
          this.dom.elements.orderPrice.value = Utils.formatKRW(newPrice);

          // 🔧 가격 변경 시 수량이 있으면 총액 업데이트, 없으면 총액 기준으로 수량 계산
          const quantity =
            Utils.parseNumber(this.dom.elements.orderQuantity?.value) || 0;
          if (quantity > 0) {
            this.ui.updateOrderTotal();
          } else {
            this.ui.updateQuantityFromPrice();
          }
        }
      }
    );
  }

  // 🔧 개선된 버튼 이벤트
  setupButtonEvents() {
    // 가격 조정 버튼
    this.dom.elements.priceBtns?.forEach((btn) => {
      btn.addEventListener("click", () => {
        const direction = btn.classList.contains("minus") ? "down" : "up";
        this.trading.adjustPrice(direction);
      });
    });

    // 수량 퍼센트 버튼
    this.dom.elements.quantityBtns?.forEach((btn) => {
      btn.addEventListener("click", () => {
        const percent = parseInt(btn.dataset.percent);
        this.trading.calculatePercentageAmount(percent);
      });
    });

    // 🔧 시장가 주문총액 퍼센트 버튼 (1000원 단위 적용)
    document
      .querySelectorAll(".market-total-group .quantity-btns button")
      ?.forEach((btn) => {
        btn.addEventListener("click", () => {
          const percent = parseInt(btn.dataset.percent);
          if (
            this.state.activeTradingType === "market" &&
            this.state.activeTradingSide === "bid"
          ) {
            let totalAmount = Math.floor(
              (this.state.userKRWBalance * percent) / 100
            );

            // 🔧 비트코인/이더리움의 경우 1000원 단위로 조정
            if (
              this.state.activeCoin === "KRW-BTC" ||
              this.state.activeCoin === "KRW-ETH"
            ) {
              totalAmount = Math.floor(totalAmount / 1000) * 1000;
            }

            this.dom.setOrderTotalMarket(totalAmount);
            this.ui.updateMarketQuantity();
          }
        });
      });
  }

  // 🔧 새로고침 스피너 표시 (전체 새로고침만)
  showRefreshSpinner(type) {
    if (type === "all") {
      const button = this.dom.elements.refreshAllOrders;
      if (button) {
        button.disabled = true;
        button.innerHTML = '<div class="loading-spinner"></div>';
      }
    }
  }

  // 🔧 새로고침 스피너 숨김 (전체 새로고침만)
  hideRefreshSpinner(type) {
    if (type === "all") {
      const button = this.dom.elements.refreshAllOrders;
      if (button) {
        button.disabled = false;
        button.textContent = "🔄";
      }
    }
  }
}
