import { MARKET_CODES, COIN_NAMES } from "./constants.js";
import { Utils } from "./utils.js";

export class UIController {
  constructor(state, domManager) {
    this.state = state;
    this.dom = domManager;
    this.setupInitialData();
  }

  async setupInitialData() {
    this.fetchUserData();
    this.updateCoinTabs();
    this.updateCoinSummary();
    this.updateTradingPanel();
  }

  showPendingOrders() {
    this.dom.elements.pendingOrdersSection.classList.remove("hidden");
    this.dom.elements.filledOrdersSection.classList.add("hidden");
    this.updatePendingOrdersList(this.state.pendingOrders);
  }

  showFilledOrders() {
    this.dom.elements.pendingOrdersSection.classList.add("hidden");
    this.dom.elements.filledOrdersSection.classList.remove("hidden");
    this.updateFilledOrdersList(this.state.filledOrders);
  }

  updatePendingOrdersList(orders) {
    const listElement = this.dom.elements.pendingOrdersList;
    const validOrders = orders || [];

    if (!listElement) return;

    if (validOrders.length === 0) {
      listElement.innerHTML = `<div class="no-orders-message">대기 중인 주문이 없습니다.</div>`;
      return;
    }

    const orderItemsHTML = validOrders
      .map((order) => {
        const coinSymbol = order.market ? order.market.split("-")[1] : "";
        const sideText = order.side === "bid" ? "매수" : "매도";
        const priceText = `${Utils.formatKRW(order.price)}원`;
        const quantityText = `${Utils.formatCoinAmount(order.quantity, 4)}개`;
        const totalAmount = order.price * order.quantity;
        const totalText = `(총 ${Utils.formatKRW(totalAmount)}원)`;

        return `
    <div class="order-item">
      <div class="order-info">
        <span class="order-text">${coinSymbol} ${sideText} ${priceText} ${quantityText} ${totalText}</span>
      </div>
      <button class="cancel-btn" data-order-id="${
        order.id || order.orderId
      }">취소</button>
    </div>
    `;
      })
      .join("");

    listElement.innerHTML = orderItemsHTML;
  }

  updateFilledOrdersList(transactions) {
    const listElement = this.dom.elements.filledOrdersList;
    if (!listElement) return;

    if (!transactions || transactions.length === 0) {
      listElement.innerHTML = `<div class="no-orders-message">체결된 주문이 없습니다.</div>`;
      return;
    }

    const transactionItemsHTML = transactions
      .map(
        (t) => `
    <div class="transaction-item">
      <span class="tx-info">${t.market} | ${
          t.side === "bid" ? "매수" : "매도"
        }</span>
      <span class="tx-price">가격: ${Utils.formatKRW(t.price)}</span>
      <span class="tx-quantity">수량: ${Utils.formatCoinAmount(
        t.quantity
      )}</span>
    </div>
    `
      )
      .join("");

    listElement.innerHTML = transactionItemsHTML;
  }

  updateCoinTabs() {
    const container = this.dom.elements.coinTabs;
    if (!container) return;

    if (container.children.length === 0) {
      MARKET_CODES.forEach((code) => {
        const tab = document.createElement("div");
        tab.className = `coin-tab ${
          code === this.state.activeCoin ? "active" : ""
        }`;
        tab.innerText = COIN_NAMES[code];
        tab.onclick = () => this.switchCoin(code);
        container.appendChild(tab);
      });
    }

    Array.from(container.children).forEach((tab) => {
      if (tab.innerText === COIN_NAMES[this.state.activeCoin]) {
        tab.classList.add("active");
      } else {
        tab.classList.remove("active");
      }
    });
  }

  updateCoinSummary() {
    const container = this.dom.elements.coinSummary;
    const data = this.state.latestTickerData[this.state.activeCoin];

    if (!data || !container) return;

    const priceChange = data.trade_price - data.prev_closing_price;
    const changePriceClass = priceChange >= 0 ? "positive" : "negative";
    const changeRateClass = priceChange >= 0 ? "positive" : "negative";

    container.innerHTML = `
      <div class="summary-left">
        <div class="summary-main">
          <span class="summary-name">${COIN_NAMES[this.state.activeCoin]}</span>
          <span class="summary-price ${changePriceClass}">${Utils.formatKRW(
      data.trade_price
    )} KRW</span>
        </div>
        <div class="summary-sub">
          <span class="${changePriceClass}">${Utils.formatKRW(
      priceChange
    )} KRW</span>
          <span class="${changeRateClass}">${Utils.formatPercent(
      data.change_rate
    )}%</span>
        </div>
      </div>
      <div class="summary-right">
        <div class="summary-item">
          <span class="summary-label">고가</span>
          <span class="summary-value">${Utils.formatKRW(data.high_price)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">저가</span>
          <span class="summary-value">${Utils.formatKRW(data.low_price)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">거래대금(24H)</span>
          <span class="summary-value">${Utils.formatKRW(
            data.acc_trade_price_24h
          )}</span>
        </div>
      </div>
    `;
  }

  updateOrderbook(orderbook, askListElement, bidListElement) {
    if (!orderbook?.orderbook_units || !askListElement || !bidListElement)
      return;

    askListElement.innerHTML = "";
    bidListElement.innerHTML = "";

    const asks = orderbook.orderbook_units.sort(
      (a, b) => b.ask_price - a.ask_price
    );
    const bids = orderbook.orderbook_units.sort(
      (a, b) => b.bid_price - a.bid_price
    );

    asks.slice(0, 10).forEach((unit) => {
      const div = document.createElement("div");
      div.className = "orderbook-unit ask";
      div.innerHTML = `
        <span class="orderbook-price ask">${Utils.formatKRW(
          unit.ask_price
        )}</span>
        <span class="orderbook-size">${Utils.formatCoinAmount(
          unit.ask_size,
          4
        )}</span>
      `;
      div.onclick = () => {
        if (this.state.activeTradingType === "limit") {
          this.dom.setOrderPrice(unit.ask_price);
        }
      };
      askListElement.appendChild(div);
    });

    bids.slice(0, 10).forEach((unit) => {
      const div = document.createElement("div");
      div.className = "orderbook-unit bid";
      div.innerHTML = `
        <span class="orderbook-price bid">${Utils.formatKRW(
          unit.bid_price
        )}</span>
        <span class="orderbook-size">${Utils.formatCoinAmount(
          unit.bid_size,
          4
        )}</span>
      `;
      div.onclick = () => {
        if (this.state.activeTradingType === "limit") {
          this.dom.setOrderPrice(unit.bid_price);
        }
      };
      bidListElement.appendChild(div);
    });
  }

  updateTradingPanel() {
    const coinCode = this.state.activeCoin;
    const coinName = coinCode.split("-")[1];

    if (this.state.activeTradingSide === "bid") {
      this.dom.updateAvailableAmount(this.state.userKRWBalance, "KRW");
    } else {
      const coinBalance =
        this.state.userCoinBalance[this.state.activeCoin] || 0;
      this.dom.updateAvailableAmount(coinBalance, coinName);
    }

    const buyButton = document.querySelector(".bid-button");
    const sellButton = document.querySelector(".ask-button");

    if (this.state.activeTradingSide === "bid") {
      buyButton?.classList.remove("hidden");
      sellButton?.classList.add("hidden");
    } else {
      buyButton?.classList.add("hidden");
      sellButton?.classList.remove("hidden");
    }

    this.updateTradingInputs();
    this.createPercentageDropdown();
    // 가격 자동 설정 제거
  }

  updateTradingInputs() {
    const priceGroup = document.querySelector(".price-input-group");
    const quantityGroup = document.querySelector(".quantity-input-group");
    const limitTotalGroup = document.querySelector(
      ".trading-total-group:not(.hidden)"
    );
    const marketTotalGroup = document.querySelector(
      ".trading-total-group.hidden"
    );

    [priceGroup, quantityGroup, limitTotalGroup, marketTotalGroup].forEach(
      (element) => {
        if (element) element.style.display = "none";
      }
    );

    if (this.state.activeTradingType === "limit") {
      [priceGroup, quantityGroup, limitTotalGroup].forEach((element) => {
        if (element) element.style.display = "flex";
      });

      if (this.dom.elements.orderPrice) {
        this.dom.elements.orderPrice.disabled = false;
        // 가격 자동 설정 제거 - 사용자가 직접 설정하도록
      }
    } else if (this.state.activeTradingType === "market") {
      if (this.state.activeTradingSide === "bid") {
        if (marketTotalGroup) marketTotalGroup.style.display = "flex";
      } else {
        if (quantityGroup) quantityGroup.style.display = "flex";
      }
    }
  }

  updateOrderTotal() {
    if (this.state.activeTradingType !== "limit") return;

    const orderPrice =
      Utils.parseNumber(this.dom.elements.orderPrice?.value) || 0;
    const orderQuantity =
      Utils.parseNumber(this.dom.elements.orderQuantity?.value) || 0;

    const total = orderPrice * orderQuantity;
    this.dom.elements.orderTotal.value = Utils.formatKRW(total);
  }

  updateMarketQuantity() {
    if (
      this.state.activeTradingType !== "market" ||
      this.state.activeTradingSide !== "bid"
    )
      return;

    const orderTotal =
      Utils.parseNumber(this.dom.elements.orderTotalMarket?.value) || 0;
    const currentPrice =
      this.state.latestTickerData[this.state.activeCoin]?.trade_price || 0;

    if (currentPrice > 0 && this.dom.elements.orderQuantity) {
      const quantity = orderTotal / currentPrice;
      this.dom.elements.orderQuantity.value = Utils.formatCoinAmount(quantity);
    }
  }

  createPercentageDropdown() {
    const dropdown = this.dom.elements.pricePercentageDropdown;
    if (!dropdown) return;

    dropdown.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "현재가 대비 설정";
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.hidden = true;
    dropdown.appendChild(placeholder);

    [-20, -15, -10, -5, 0, 5, 10, 15, 20].forEach((percent) => {
      const option = document.createElement("option");
      option.value = percent;
      option.textContent = `${percent}%`;
      dropdown.appendChild(option);
    });

    dropdown.addEventListener("blur", () => {
      dropdown.value = "";
    });
  }

  switchCoin(code) {
    if (this.state.activeCoin === code) return;

    this.state.activeCoin = code;
    this.updateCoinTabs();
    this.updateCoinSummary();

    if (this.state.activeOrderbookType === "general") {
      this.updateOrderbook(
        this.state.latestOrderbookData[code].general,
        this.dom.elements.generalAskList,
        this.dom.elements.generalBidList
      );
    } else {
      this.updateOrderbook(
        this.state.latestOrderbookData[code].grouped,
        this.dom.elements.groupedAskList,
        this.dom.elements.groupedBidList
      );
    }

    if (this.state.activeTradingType === "limit") {
      const currentPrice = this.state.latestTickerData[code]?.trade_price || 0;
      if (currentPrice > 0) {
        this.dom.setOrderPrice(currentPrice);
      }
    }

    this.updateTradingPanel();
  }

  async fetchUserData() {
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
      this.dom.updateAvailableAmount(this.state.userKRWBalance);
    } catch (error) {
      console.error("사용자 데이터 불러오기 오류:", error);
    }
  }
}
