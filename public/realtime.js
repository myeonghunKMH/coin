// ============================================
// 상수 및 설정
// ============================================
const MARKET_CODES = ["KRW-BTC", "KRW-ETH", "KRW-XRP"];
const COIN_NAMES = {
  "KRW-BTC": "비트코인",
  "KRW-ETH": "이더리움",
  "KRW-XRP": "리플",
};

const PRICE_STEPS = [
  { min: 100000000, step: 100000 },
  { min: 50000000, step: 50000 },
  { min: 10000000, step: 10000 },
  { min: 1000000, step: 1000 },
  { min: 100000, step: 100 },
  { min: 10000, step: 10 },
  { min: 1000, step: 5 },
  { min: 100, step: 1 },
  { min: 0, step: 0.1 },
];

// ============================================
// 상태 관리
// ============================================
class TradingState {
  constructor() {
    this.latestTickerData = {};
    this.latestOrderbookData = {};
    this.activeCoin = "KRW-BTC";
    this.activeUnit = "60";
    this.lastUpdateTime = null;
    this.activeOrderbookType = "general";
    this.activeTradingSide = "bid";
    this.activeTradingType = "limit";
    this.userKRWBalance = 0;
    this.userCoinBalance = { "KRW-BTC": 0, "KRW-ETH": 0, "KRW-XRP": 0 };
    this.mainChart = null;

    this.initializeData();
  }

  initializeData() {
    MARKET_CODES.forEach((code) => {
      this.latestTickerData[code] = {
        trade_price: 0,
        change_rate: 0,
        signed_change_price: 0,
        acc_trade_price_24h: 0,
        high_price: 0,
        low_price: 0,
        prev_closing_price: 0,
      };
      this.latestOrderbookData[code] = {
        general: null,
        grouped: null,
      };
    });
  }
}

// ============================================
// 유틸리티 함수
// ============================================
class Utils {
  // 원화 포맷팅 - 항상 정수로 처리
  static formatKRW(amount) {
    return Math.floor(Number(amount) || 0).toLocaleString("ko-KR");
  }

  // 코인 수량 포맷팅
  static formatCoinAmount(amount, decimals = 8) {
    return Number(amount || 0).toFixed(decimals);
  }

  // 퍼센트 포맷팅
  static formatPercent(rate) {
    return (Number(rate || 0) * 100).toFixed(2);
  }

  // 콤마 제거 후 숫자 변환
  static parseNumber(value) {
    return Number(String(value).replace(/,/g, "")) || 0;
  }

  // 가격 단위 계산
  static getPriceStep(price) {
    for (const { min, step } of PRICE_STEPS) {
      if (price >= min) return step;
    }
    return 0.1;
  }

  // 총액 계산 (항상 정수로)
  static calculateTotal(price, quantity) {
    const total = this.parseNumber(price) * this.parseNumber(quantity);
    return Math.floor(total);
  }
}

// ============================================
// DOM 관리자
// ============================================
class DOMManager {
  constructor() {
    this.elements = this.getElements();
  }

  getElements() {
    return {
      availableAmount: document.getElementById("available-amount"),
      orderPrice: document.getElementById("order-price"),
      orderQuantity: document.getElementById("order-quantity"),
      orderTotal: document.getElementById("order-total"),
      orderTotalMarket: document.getElementById("order-total-market"),
      pricePercentageDropdown: document.getElementById(
        "price-percentage-dropdown"
      ),
      coinTabs: document.getElementById("coin-tabs"),
      coinSummary: document.getElementById("coin-summary"),
      chartCanvas: document.getElementById("coinChart"),
      generalAskList: document.getElementById("general-ask-list"),
      generalBidList: document.getElementById("general-bid-list"),
      groupedAskList: document.getElementById("grouped-ask-list"),
      groupedBidList: document.getElementById("grouped-bid-list"),
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

  updateOrderTotal() {
    if (
      !this.elements.orderPrice ||
      !this.elements.orderQuantity ||
      !this.elements.orderTotal
    )
      return;

    const price = Utils.parseNumber(this.elements.orderPrice.value);
    const quantity = Utils.parseNumber(this.elements.orderQuantity.value);

    if (price > 0 && quantity > 0) {
      const totalAmount = Utils.calculateTotal(price, quantity);
      this.elements.orderTotal.value = Utils.formatKRW(totalAmount);
    } else {
      this.elements.orderTotal.value = "";
    }
  }

  setOrderPrice(price) {
    if (this.elements.orderPrice) {
      this.elements.orderPrice.value = Utils.formatKRW(price);
      this.updateOrderTotal();
    }
  }

  setOrderQuantity(quantity) {
    if (this.elements.orderQuantity) {
      this.elements.orderQuantity.value = Utils.formatCoinAmount(quantity);
      this.updateOrderTotal();
    }
  }

  setOrderTotalMarket(total) {
    if (this.elements.orderTotalMarket) {
      this.elements.orderTotalMarket.value = Utils.formatKRW(total);
    }
  }
}

// ============================================
// UI 컨트롤러
// ============================================
class UIController {
  constructor(state, domManager) {
    this.state = state;
    this.dom = domManager;
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

    // 활성 탭 업데이트
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

    // 매도 호가
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

    // 매수 호가
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

    // 잔고 표시 업데이트
    if (this.state.activeTradingSide === "bid") {
      this.dom.updateAvailableAmount(this.state.userKRWBalance, "KRW");
    } else {
      const coinBalance =
        this.state.userCoinBalance[this.state.activeCoin] || 0;
      this.dom.updateAvailableAmount(coinBalance, coinName);
    }

    // 버튼 표시/숨김
    const buyButton = document.querySelector(".bid-button");
    const sellButton = document.querySelector(".ask-button");

    if (this.state.activeTradingSide === "bid") {
      buyButton?.classList.remove("hidden");
      sellButton?.classList.add("hidden");
    } else {
      buyButton?.classList.add("hidden");
      sellButton?.classList.remove("hidden");
    }

    // 입력 필드 표시/숨김
    this.updateTradingInputs();
    this.createPercentageDropdown();
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

    // 모든 요소 숨김
    [priceGroup, quantityGroup, limitTotalGroup, marketTotalGroup].forEach(
      (element) => {
        if (element) element.style.display = "none";
      }
    );

    if (this.state.activeTradingType === "limit") {
      // 지정가: 가격, 수량, 총액 모두 표시
      [priceGroup, quantityGroup, limitTotalGroup].forEach((element) => {
        if (element) element.style.display = "flex";
      });

      // 현재가로 초기 설정
      if (this.dom.elements.orderPrice) {
        this.dom.elements.orderPrice.disabled = false;
        if (!this.dom.elements.orderPrice.value?.trim()) {
          const currentPrice =
            this.state.latestTickerData[this.state.activeCoin]?.trade_price ||
            0;
          if (currentPrice > 0) {
            this.dom.setOrderPrice(currentPrice);
          }
        }
      }
    } else if (this.state.activeTradingType === "market") {
      // 시장가
      if (this.state.activeTradingSide === "bid") {
        // 시장가 매수: 총액만 표시
        if (marketTotalGroup) marketTotalGroup.style.display = "flex";
      } else {
        // 시장가 매도: 수량만 표시
        if (quantityGroup) quantityGroup.style.display = "flex";
      }
    }
  }

  createPercentageDropdown() {
    const dropdown = this.dom.elements.pricePercentageDropdown;
    if (!dropdown) return;

    dropdown.innerHTML = "";

    // 기본 텍스트
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "현재가 대비 설정";
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.hidden = true;
    dropdown.appendChild(placeholder);

    // 퍼센트 옵션들
    [-20, -15, -10, -5, 0, 5, 10, 15, 20].forEach((percent) => {
      const option = document.createElement("option");
      option.value = percent;
      option.textContent = `${percent}%`;
      dropdown.appendChild(option);
    });

    // 드롭다운 닫힐 때 초기화
    dropdown.addEventListener("blur", () => {
      dropdown.value = "";
    });
  }

  switchCoin(code) {
    if (this.state.activeCoin === code) return;

    this.state.activeCoin = code;
    this.updateCoinTabs();
    this.updateCoinSummary();

    // 호가창 업데이트
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

    // 지정가일 때 현재가로 설정
    if (this.state.activeTradingType === "limit") {
      const currentPrice = this.state.latestTickerData[code]?.trade_price || 0;
      if (currentPrice > 0) {
        this.dom.setOrderPrice(currentPrice);
      }
    }

    this.updateTradingPanel();
  }
}

// ============================================
// 차트 관리자
// ============================================
class ChartManager {
  constructor(state) {
    this.state = state;
  }

  async fetchAndRender() {
    if (!this.state.activeCoin || !this.state.activeUnit) return;

    try {
      const response = await fetch(
        `/api/candles?unit=${this.state.activeUnit}&market=${this.state.activeCoin}`
      );
      const data = await response.json();
      const sortedData = data.reverse();

      const chartData = sortedData.map((d) => ({
        x: new Date(d.candle_date_time_kst).getTime(),
        o: d.opening_price,
        h: d.high_price,
        l: d.low_price,
        c: d.trade_price,
      }));

      const dataset = [
        {
          label: `${COIN_NAMES[this.state.activeCoin]} ${
            this.state.activeUnit
          } 캔들`,
          data: chartData,
          borderColor: "rgb(75, 192, 192)",
          tension: 0.1,
        },
      ];

      const unitForChart = this.getChartTimeUnit();
      const chartOptions = this.getChartOptions(unitForChart);

      if (this.state.mainChart) {
        this.state.mainChart.destroy();
      }

      const ctx = document.getElementById("coinChart")?.getContext("2d");
      if (ctx) {
        this.state.mainChart = new Chart(ctx, {
          type: "candlestick",
          data: { datasets: dataset },
          options: chartOptions,
        });
      }
    } catch (error) {
      console.error("차트 데이터 로딩 오류:", error);
    }
  }

  getChartTimeUnit() {
    if (this.state.activeUnit === "1D") return "day";
    return parseInt(this.state.activeUnit) >= 60 ? "hour" : "minute";
  }

  getChartOptions(unitForChart) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: "index", intersect: false },
      },
      scales: {
        x: {
          type: "time",
          time: {
            unit: unitForChart,
            displayFormats: {
              minute: "HH:mm",
              hour: "HH:mm",
              day: "MM-DD",
            },
          },
          title: { display: true, text: "시간", color: "white" },
          grid: { color: "rgba(255, 255, 255, 0.1)" },
          ticks: { color: "white" },
        },
        y: {
          title: { display: true, text: "가격(KRW)", color: "white" },
          grid: { color: "rgba(255, 255, 255, 0.1)" },
          ticks: { color: "white" },
        },
      },
    };
  }

  checkAutoUpdate() {
    const now = new Date();
    const currentMinute = now.getMinutes();
    const currentHour = now.getHours();

    if (this.state.activeUnit === "1D") {
      if (
        currentHour === 0 &&
        currentMinute === 0 &&
        this.state.lastUpdateTime !== "1D-updated"
      ) {
        this.fetchAndRender();
        this.state.lastUpdateTime = "1D-updated";
      } else if (currentHour !== 0 || currentMinute !== 0) {
        this.state.lastUpdateTime = null;
      }
    } else {
      const unitInMinutes = parseInt(this.state.activeUnit);
      if (unitInMinutes) {
        const isUpdateMinute = currentMinute % unitInMinutes === 0;
        const lastUpdateString = `${this.state.activeUnit}-${currentHour}:${currentMinute}`;

        if (
          isUpdateMinute &&
          now.getSeconds() === 0 &&
          this.state.lastUpdateTime !== lastUpdateString
        ) {
          this.fetchAndRender();
          this.state.lastUpdateTime = lastUpdateString;
        } else if (!isUpdateMinute) {
          this.state.lastUpdateTime = null;
        }
      }
    }
  }
}

// ============================================
// 웹소켓 관리자
// ============================================
class WebSocketManager {
  constructor(state, uiController) {
    this.state = state;
    this.ui = uiController;
    this.ws = null;
  }

  connect() {
    this.ws = new WebSocket("ws://localhost:3000");

    this.ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        const reader = new FileReader();
        reader.onload = () => this.handleMessage(reader.result);
        reader.readAsText(event.data);
      } else {
        this.handleMessage(event.data);
      }
    };

    this.ws.onerror = (error) => {
      console.error("웹소켓 오류:", error);
    };

    this.ws.onclose = () => {
      console.log("웹소켓 연결 종료");
      // 재연결 로직을 여기에 추가할 수 있습니다
    };
  }

  handleMessage(data) {
    try {
      const upbitData = JSON.parse(data);

      if (upbitData.type === "ticker") {
        this.handleTickerData(upbitData);
      } else if (upbitData.type === "orderbook") {
        this.handleOrderbookData(upbitData);
      }
    } catch (error) {
      console.error("웹소켓 메시지 파싱 오류:", error);
    }
  }

  handleTickerData(data) {
    const code = data.code;
    if (!MARKET_CODES.includes(code)) return;

    this.state.latestTickerData[code] = {
      trade_price: data.trade_price,
      change_rate: data.change_rate || 0,
      signed_change_price: data.signed_change_price || 0,
      acc_trade_price_24h: data.acc_trade_price_24h || 0,
      trade_timestamp: data.trade_timestamp,
      high_price: data.high_price,
      low_price: data.low_price,
      prev_closing_price: data.prev_closing_price,
    };

    if (code === this.state.activeCoin) {
      this.ui.updateCoinSummary();

      // 지정가 모드에서 가격이 비어있으면 현재가로 설정
      if (this.state.activeTradingType === "limit") {
        const orderPriceInput = document.getElementById("order-price");
        if (orderPriceInput && !orderPriceInput.value?.trim()) {
          const currentPrice =
            this.state.latestTickerData[code]?.trade_price || 0;
          if (currentPrice > 0) {
            orderPriceInput.value = Utils.formatKRW(currentPrice);
          }
        }
      }

      this.ui.updateTradingPanel();
    }
  }

  handleOrderbookData(data) {
    const code = data.code;
    if (!MARKET_CODES.includes(code)) return;

    if (data.level === 0) {
      this.state.latestOrderbookData[code].general = data;
      if (
        code === this.state.activeCoin &&
        this.state.activeOrderbookType === "general"
      ) {
        this.ui.updateOrderbook(
          data,
          document.getElementById("general-ask-list"),
          document.getElementById("general-bid-list")
        );
      }
    } else {
      this.state.latestOrderbookData[code].grouped = data;
      if (
        code === this.state.activeCoin &&
        this.state.activeOrderbookType === "grouped"
      ) {
        this.ui.updateOrderbook(
          data,
          document.getElementById("grouped-ask-list"),
          document.getElementById("grouped-bid-list")
        );
      }
    }
  }
}

// ============================================
// 거래 관리자
// ============================================
class TradingManager {
  constructor(state, domManager) {
    this.state = state;
    this.dom = domManager;
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
      alert(result.message || result.error);

      if (response.ok) {
        this.fetchUserBalance();
      }
    } catch (error) {
      console.error("주문 요청 오류:", error);
      alert("주문 요청 중 오류가 발생했습니다.");
    }
  }

  validateLimitOrder(price, quantity) {
    if (!price || !quantity || price <= 0 || quantity <= 0) {
      alert("주문 가격과 수량을 올바르게 입력해주세요.");
      return false;
    }
    return true;
  }

  validateMarketBuyOrder(totalAmount) {
    if (!totalAmount || totalAmount <= 0) {
      alert("주문 총액을 올바르게 입력해주세요.");
      return false;
    }
    return true;
  }

  validateMarketSellOrder(quantity) {
    if (!quantity || quantity <= 0) {
      alert("주문 수량을 올바르게 입력해주세요.");
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
      this.state.userKRWBalance = Math.floor(data.krw_balance || 0); // 원화는 정수로
      this.state.userCoinBalance = {
        "KRW-BTC": data.btc_balance || 0,
        "KRW-ETH": data.eth_balance || 0,
        "KRW-XRP": data.xrp_balance || 0,
      };
    } catch (error) {
      console.error("잔고 데이터 로딩 오류:", error);
    }
  }

  calculatePercentageAmount(percent) {
    if (this.state.activeTradingType === "limit") {
      return this.calculateLimitPercentage(percent);
    } else if (this.state.activeTradingType === "market") {
      return this.calculateMarketPercentage(percent);
    }
  }

  calculateLimitPercentage(percent) {
    const percentage = percent / 100;

    if (this.state.activeTradingSide === "bid") {
      const orderPrice = Utils.parseNumber(this.dom.elements.orderPrice?.value);
      if (orderPrice > 0) {
        const quantity = (this.state.userKRWBalance * percentage) / orderPrice;
        this.dom.setOrderQuantity(quantity);
      }
    } else {
      const quantity =
        this.state.userCoinBalance[this.state.activeCoin] * percentage;
      this.dom.setOrderQuantity(quantity);
    }
  }

  calculateMarketPercentage(percent) {
    const percentage = percent / 100;

    if (this.state.activeTradingSide === "bid") {
      const totalAmount = Math.floor(this.state.userKRWBalance * percentage);
      this.dom.setOrderTotalMarket(totalAmount);
    } else {
      const quantity =
        this.state.userCoinBalance[this.state.activeCoin] * percentage;
      this.dom.setOrderQuantity(quantity);
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

// ============================================
// 이벤트 관리자
// ============================================
class EventManager {
  constructor(state, uiController, chartManager, tradingManager) {
    this.state = state;
    this.ui = uiController;
    this.chart = chartManager;
    this.trading = tradingManager;
  }

  setupAllEventListeners() {
    this.setupOrderbookEvents();
    this.setupChartEvents();
    this.setupTradingEvents();
    this.setupInputEvents();
    this.setupButtonEvents();
  }

  setupOrderbookEvents() {
    // 호가창 탭 전환
    document.getElementById("toggle-general")?.addEventListener("click", () => {
      this.state.activeOrderbookType = "general";
      this.updateOrderbookTabs("general");
      this.ui.updateOrderbook(
        this.state.latestOrderbookData[this.state.activeCoin].general,
        document.getElementById("general-ask-list"),
        document.getElementById("general-bid-list")
      );
    });

    document.getElementById("toggle-grouped")?.addEventListener("click", () => {
      this.state.activeOrderbookType = "grouped";
      this.updateOrderbookTabs("grouped");
      this.ui.updateOrderbook(
        this.state.latestOrderbookData[this.state.activeCoin].grouped,
        document.getElementById("grouped-ask-list"),
        document.getElementById("grouped-bid-list")
      );
    });
  }

  updateOrderbookTabs(activeType) {
    document
      .getElementById("toggle-general")
      ?.classList.toggle("active", activeType === "general");
    document
      .getElementById("toggle-grouped")
      ?.classList.toggle("active", activeType === "grouped");

    document
      .getElementById("general-orderbook-container")
      ?.classList.toggle("hidden", activeType !== "general");
    document
      .getElementById("grouped-orderbook-container")
      ?.classList.toggle("hidden", activeType !== "grouped");
  }

  setupChartEvents() {
    // 시간 탭 전환
    document.getElementById("time-tabs")?.addEventListener("click", (e) => {
      if (e.target.tagName === "BUTTON") {
        document
          .querySelectorAll(".time-tab")
          .forEach((btn) => btn.classList.remove("active"));
        e.target.classList.add("active");
        this.state.activeUnit = e.target.dataset.unit;
        this.chart.fetchAndRender();
      }
    });
  }

  setupTradingEvents() {
    // 매수/매도 탭 전환
    document.querySelectorAll(".trading-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document
          .querySelectorAll(".trading-tab")
          .forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        this.state.activeTradingSide = tab.dataset.side;
        this.ui.updateTradingPanel();
        this.trading.fetchUserBalance();
      });
    });

    // 거래 타입 버튼 (지정가/시장가)
    document.querySelectorAll(".trading-type-btn").forEach((btn, index) => {
      btn.addEventListener("click", () => {
        if (btn.classList.contains("disabled")) return;

        document
          .querySelectorAll(".trading-type-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        this.state.activeTradingType = index === 0 ? "limit" : "market";
        this.ui.updateTradingPanel();
      });
    });

    // 거래 실행 버튼
    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("bid-button")) {
        this.trading.sendOrder("bid");
      } else if (e.target.classList.contains("ask-button")) {
        this.trading.sendOrder("ask");
      }
    });
  }

  setupInputEvents() {
    const dom = document.querySelector(".dom") || document;

    // 주문가/수량 입력 시 총액 자동 계산
    const orderPriceInput = document.getElementById("order-price");
    const orderQuantityInput = document.getElementById("order-quantity");

    orderPriceInput?.addEventListener("input", (e) => {
      // 입력값을 숫자로 변환하고 다시 포맷
      const value = Utils.parseNumber(e.target.value);
      if (value >= 0) {
        e.target.value = Utils.formatKRW(value);
        this.updateOrderTotal();
      }
    });

    orderQuantityInput?.addEventListener("input", () => {
      this.updateOrderTotal();
    });

    // 시장가 총액 입력 포맷팅
    const orderTotalMarketInput = document.getElementById("order-total-market");
    orderTotalMarketInput?.addEventListener("input", (e) => {
      const value = Utils.parseNumber(e.target.value);
      if (value >= 0) {
        e.target.value = Utils.formatKRW(value);
      }
    });

    // 가격 드롭다운 변경
    const priceDropdown = document.getElementById("price-percentage-dropdown");
    priceDropdown?.addEventListener("change", (e) => {
      const currentPrice =
        this.state.latestTickerData[this.state.activeCoin]?.trade_price || 0;
      const percent = parseInt(e.target.value) / 100;
      const newPrice = Math.floor(currentPrice * (1 + percent));

      const orderPriceInput = document.getElementById("order-price");
      if (orderPriceInput) {
        orderPriceInput.value = Utils.formatKRW(newPrice);
        this.updateOrderTotal();
      }
    });
  }

  setupButtonEvents() {
    // 가격 +/- 버튼
    document.querySelectorAll(".price-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const direction =
          btn.textContent.includes("-") || btn.classList.contains("minus")
            ? "down"
            : "up";
        this.trading.adjustPrice(direction);
      });
    });

    // 퍼센트 버튼
    document.addEventListener("click", (e) => {
      if (e.target.tagName === "BUTTON" && e.target.dataset.percent) {
        const percent = parseInt(e.target.dataset.percent);
        this.trading.calculatePercentageAmount(percent);
      }
    });
  }

  updateOrderTotal() {
    const orderPriceInput = document.getElementById("order-price");
    const orderQuantityInput = document.getElementById("order-quantity");
    const orderTotalInput = document.getElementById("order-total");

    if (!orderPriceInput || !orderQuantityInput || !orderTotalInput) return;

    const price = Utils.parseNumber(orderPriceInput.value);
    const quantity = Utils.parseNumber(orderQuantityInput.value);

    if (price > 0 && quantity > 0) {
      const totalAmount = Utils.calculateTotal(price, quantity);
      orderTotalInput.value = Utils.formatKRW(totalAmount);
    } else {
      orderTotalInput.value = "";
    }
  }
}

// ============================================
// 메인 애플리케이션 클래스
// ============================================
class CryptoTradingApp {
  constructor() {
    this.state = new TradingState();
    this.domManager = new DOMManager();
    this.uiController = new UIController(this.state, this.domManager);
    this.chartManager = new ChartManager(this.state);
    this.tradingManager = new TradingManager(this.state, this.domManager);
    this.eventManager = new EventManager(
      this.state,
      this.uiController,
      this.chartManager,
      this.tradingManager
    );
    this.webSocketManager = new WebSocketManager(this.state, this.uiController);
  }

  async initialize() {
    try {
      // UI 초기화
      this.uiController.updateCoinTabs();
      this.uiController.updateCoinSummary();
      this.uiController.updateTradingPanel();

      // 차트 초기화
      await this.chartManager.fetchAndRender();

      // 호가창 초기화
      this.uiController.updateOrderbook(
        this.state.latestOrderbookData[this.state.activeCoin].general,
        this.domManager.elements.generalAskList,
        this.domManager.elements.generalBidList
      );

      // 잔고 조회
      await this.tradingManager.fetchUserBalance();

      // 이벤트 리스너 설정
      this.eventManager.setupAllEventListeners();

      // 웹소켓 연결
      this.webSocketManager.connect();

      // 주기적 업데이트 시작
      this.startPeriodicUpdates();

      console.log("암호화폐 거래 시스템 초기화 완료");
    } catch (error) {
      console.error("초기화 중 오류 발생:", error);
      alert("시스템 초기화 중 오류가 발생했습니다. 페이지를 새로고침해주세요.");
    }
  }

  startPeriodicUpdates() {
    // 차트 자동 업데이트 (5초마다 체크)
    setInterval(() => {
      this.chartManager.checkAutoUpdate();
    }, 5000);

    // 잔고 정기 업데이트 (30초마다)
    setInterval(() => {
      this.tradingManager.fetchUserBalance();
    }, 30000);
  }

  // 에러 핸들링
  handleError(error, context = "알 수 없는 오류") {
    console.error(`${context}:`, error);

    // 사용자에게 친화적인 에러 메시지 표시
    const errorMessages = {
      network: "네트워크 연결을 확인해주세요.",
      websocket: "실시간 데이터 연결에 문제가 있습니다.",
      api: "서버와의 통신에 문제가 있습니다.",
      chart: "차트 로딩 중 문제가 발생했습니다.",
      trading: "거래 처리 중 문제가 발생했습니다.",
    };

    // 에러 타입에 따른 메시지 선택 (실제 구현시 더 정교하게)
    const message =
      errorMessages.api ||
      "일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.";

    // 심각한 에러가 아닌 경우에만 사용자에게 알림
    if (!error.message?.includes("WebSocket")) {
      // alert 대신 더 부드러운 알림 방식 사용 가능
      console.warn("사용자 알림:", message);
    }
  }

  // 정리 함수 (페이지 언로드 시 호출)
  cleanup() {
    if (this.webSocketManager.ws) {
      this.webSocketManager.ws.close();
    }

    if (this.state.mainChart) {
      this.state.mainChart.destroy();
    }
  }
}

// ============================================
// 전역 변수 및 초기화
// ============================================
let app = null;

// DOM 로드 완료 시 앱 초기화
document.addEventListener("DOMContentLoaded", async () => {
  try {
    app = new CryptoTradingApp();
    await app.initialize();
  } catch (error) {
    console.error("앱 초기화 실패:", error);
    alert(
      "시스템을 불러오는 중 문제가 발생했습니다. 페이지를 새로고침해주세요."
    );
  }
});

// 페이지 언로드 시 정리
window.addEventListener("beforeunload", () => {
  if (app) {
    app.cleanup();
  }
});

// 개발용 전역 접근 (프로덕션에서는 제거)
if (typeof window !== "undefined") {
  window.TradingApp = {
    app: () => app,
    utils: Utils,
    // 디버깅용 헬퍼들
    getState: () => app?.state,
    switchCoin: (code) => app?.uiController.switchCoin(code),
    refreshChart: () => app?.chartManager.fetchAndRender(),
    refreshBalance: () => app?.tradingManager.fetchUserBalance(),
  };
}
