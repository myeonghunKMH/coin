// ============================================
// 전역 변수 및 설정
// ============================================
const marketCodes = ["KRW-BTC", "KRW-ETH", "KRW-XRP"];
const coinNames = {
  "KRW-BTC": "비트코인",
  "KRW-ETH": "이더리움",
  "KRW-XRP": "리플",
};

// 상태 변수
let latestTickerData = {};
let latestOrderbookData = {};
let activeCoin = "KRW-BTC";
let activeUnit = "60";
let lastUpdateTime = null;
let activeOrderbookType = "general";
let activeTradingSide = "bid";
let activeTradingType = "limit";

// 사용자 잔고
let userKRWBalance = 0;
let userCoinBalance = { "KRW-BTC": 0, "KRW-ETH": 0, "KRW-XRP": 0 };

// 차트 인스턴스
let mainChart = null;

// DOM 요소 참조
const availableAmountValue = document.getElementById("available-amount");
const orderPriceInput = document.getElementById("order-price");
const orderQuantityInput = document.getElementById("order-quantity");
const orderTotalInput = document.getElementById("order-total");
const orderTotalMarketInput = document.getElementById("order-total-market");
const buyButton = document.querySelector(".bid-button");
const sellButton = document.querySelector(".ask-button");
const pricePercentageDropdown = document.getElementById(
  "price-percentage-dropdown"
);

// ============================================
// 초기화 함수
// ============================================
function initializeData() {
  marketCodes.forEach((code) => {
    latestTickerData[code] = {
      trade_price: 0,
      change_rate: 0,
      signed_change_price: 0,
      acc_trade_price_24h: 0,
      high_price: 0,
      low_price: 0,
      prev_closing_price: 0,
    };
    latestOrderbookData[code] = {
      general: null,
      grouped: null,
    };
  });
}

// ============================================
// 차트 관련 함수
// ============================================
async function fetchAndRenderChart() {
  if (!activeCoin || !activeUnit) return;

  try {
    const response = await fetch(
      `/api/candles?unit=${activeUnit}&market=${activeCoin}`
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
        label: `${coinNames[activeCoin]} ${activeUnit} 캔들`,
        data: chartData,
        borderColor: "rgb(75, 192, 192)",
        tension: 0.1,
      },
    ];

    let unitForChart;
    if (activeUnit === "1D") {
      unitForChart = "day";
    } else if (parseInt(activeUnit) >= 60) {
      unitForChart = "hour";
    } else {
      unitForChart = "minute";
    }

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: "index",
          intersect: false,
        },
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

    if (mainChart) {
      mainChart.destroy();
    }

    const ctx = document.getElementById("coinChart").getContext("2d");
    mainChart = new Chart(ctx, {
      type: "candlestick",
      data: { datasets: dataset },
      options: chartOptions,
    });
  } catch (error) {
    console.error("캔들 데이터 로딩 오류:", error);
  }
}

function checkAndAutoUpdateChart() {
  const now = new Date();
  const currentMinute = now.getMinutes();
  const currentHour = now.getHours();
  let unitInMinutes = parseInt(activeUnit);

  if (activeUnit === "1D") {
    if (
      currentHour === 0 &&
      currentMinute === 0 &&
      lastUpdateTime !== "1D-updated"
    ) {
      fetchAndRenderChart();
      lastUpdateTime = "1D-updated";
    } else if (currentHour !== 0 || currentMinute !== 0) {
      lastUpdateTime = null;
    }
  } else if (unitInMinutes) {
    const isUpdateMinute = currentMinute % unitInMinutes === 0;
    const lastUpdateString = `${activeUnit}-${currentHour}:${currentMinute}`;
    if (
      isUpdateMinute &&
      now.getSeconds() === 0 &&
      lastUpdateTime !== lastUpdateString
    ) {
      fetchAndRenderChart();
      lastUpdateTime = lastUpdateString;
    } else if (!isUpdateMinute) {
      lastUpdateTime = null;
    }
  }
}

// ============================================
// UI 업데이트 함수
// ============================================
function updateUI(code) {
  // 코인 탭 업데이트
  const tabsContainer = document.getElementById("coin-tabs");
  if (tabsContainer.children.length === 0) {
    marketCodes.forEach((c) => {
      const tab = document.createElement("div");
      tab.className = `coin-tab ${c === activeCoin ? "active" : ""}`;
      tab.innerText = coinNames[c];
      tab.onclick = () => switchCoin(c);
      tabsContainer.appendChild(tab);
    });
  }

  document.querySelectorAll(".coin-tab").forEach((tab) => {
    if (tab.innerText === coinNames[code]) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  // 요약 정보 업데이트
  const summaryContainer = document.getElementById("coin-summary");
  const data = latestTickerData[code];

  if (data) {
    const priceChange = data.trade_price - data.prev_closing_price;
    const changePriceClass = priceChange >= 0 ? "positive" : "negative";
    const changeRateClass = priceChange >= 0 ? "positive" : "negative";

    summaryContainer.innerHTML = `
      <div class="summary-left">
        <div class="summary-main">
          <span class="summary-name">${coinNames[code]}</span>
          <span class="summary-price ${changePriceClass}">${data.trade_price.toLocaleString()} KRW</span>
        </div>
        <div class="summary-sub">
          <span class="${changePriceClass}">${priceChange.toLocaleString()} KRW</span>
          <span class="${changeRateClass}">${(data.change_rate * 100).toFixed(
      2
    )}%</span>
        </div>
      </div>
      <div class="summary-right">
        <div class="summary-item">
          <span class="summary-label">고가</span>
          <span class="summary-value">${data.high_price.toLocaleString()}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">저가</span>
          <span class="summary-value">${data.low_price.toLocaleString()}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">거래대금(24H)</span>
          <span class="summary-value">${Math.floor(
            data.acc_trade_price_24h
          ).toLocaleString()}</span>
        </div>
      </div>
    `;
  }
}

function updateOrderbookUI(orderbook, askListId, bidListId) {
  if (!orderbook || !orderbook.orderbook_units) return;

  const askList = document.getElementById(askListId);
  const bidList = document.getElementById(bidListId);

  askList.innerHTML = "";
  bidList.innerHTML = "";

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
      <span class="orderbook-price ask">${unit.ask_price.toLocaleString()}</span>
      <span class="orderbook-size">${unit.ask_size.toFixed(4)}</span>
    `;
    div.onclick = () => {
      if (activeTradingType === "limit") {
        orderPriceInput.value = unit.ask_price.toLocaleString("ko-KR");
        updateTotal();
      }
    };
    askList.appendChild(div);
  });

  // 매수 호가
  bids.slice(0, 10).forEach((unit) => {
    const div = document.createElement("div");
    div.className = "orderbook-unit bid";
    div.innerHTML = `
      <span class="orderbook-price bid">${unit.bid_price.toLocaleString()}</span>
      <span class="orderbook-size">${unit.bid_size.toFixed(4)}</span>
    `;
    div.onclick = () => {
      if (activeTradingType === "limit") {
        orderPriceInput.value = unit.bid_price.toLocaleString("ko-KR");
        updateTotal();
      }
    };
    bidList.appendChild(div);
  });
}

// ============================================
// 코인 및 탭 전환 함수
// ============================================
function switchCoin(code) {
  if (activeCoin !== code) {
    activeCoin = code;
    updateUI(activeCoin);

    if (activeOrderbookType === "general") {
      updateOrderbookUI(
        latestOrderbookData[activeCoin].general,
        "general-ask-list",
        "general-bid-list"
      );
    } else {
      updateOrderbookUI(
        latestOrderbookData[activeCoin].grouped,
        "grouped-ask-list",
        "grouped-bid-list"
      );
    }

    fetchAndRenderChart();
    updateTradingPanel();
    fetchUserBalance();
  }
}

// ============================================
// 웹소켓 관련 함수
// ============================================
function initWebSocket() {
  const ws = new WebSocket("ws://localhost:3000");

  ws.onmessage = (event) => {
    if (event.data instanceof Blob) {
      const reader = new FileReader();
      reader.onload = () => handleWebSocketMessage(reader.result);
      reader.readAsText(event.data);
    } else {
      handleWebSocketMessage(event.data);
    }
  };
}

function handleWebSocketMessage(data) {
  try {
    const upbitData = JSON.parse(data);

    if (upbitData.type === "ticker") {
      const code = upbitData.code;
      if (marketCodes.includes(code)) {
        latestTickerData[code] = {
          trade_price: upbitData.trade_price,
          change_rate: upbitData.change_rate || 0,
          signed_change_price: upbitData.signed_change_price || 0,
          acc_trade_price_24h: upbitData.acc_trade_price_24h || 0,
          trade_timestamp: upbitData.trade_timestamp,
          high_price: upbitData.high_price,
          low_price: upbitData.low_price,
          prev_closing_price: upbitData.prev_closing_price,
        };

        if (code === activeCoin) {
          updateUI(activeCoin);
          // 개선: 가격 필드를 무조건 업데이트하지 않고, 필요할 때만 (e.g., 필드가 비어 있을 때만) 업데이트
          if (
            activeTradingType === "limit" &&
            (!orderPriceInput.value || orderPriceInput.value.trim() === "")
          ) {
            const currentPrice = latestTickerData[activeCoin]?.trade_price || 0;
            if (currentPrice > 0) {
              orderPriceInput.value = currentPrice.toLocaleString("ko-KR");
            }
          }
          updateTradingPanel(); // 잔고 등 다른 부분 업데이트
        }
      }
    } else if (upbitData.type === "orderbook") {
      const code = upbitData.code;
      if (marketCodes.includes(code)) {
        if (upbitData.level === 0) {
          latestOrderbookData[code].general = upbitData;
          if (code === activeCoin && activeOrderbookType === "general") {
            updateOrderbookUI(
              latestOrderbookData[activeCoin].general,
              "general-ask-list",
              "general-bid-list"
            );
          }
        } else {
          latestOrderbookData[code].grouped = upbitData;
          if (code === activeCoin && activeOrderbookType === "grouped") {
            updateOrderbookUI(
              latestOrderbookData[activeCoin].grouped,
              "grouped-ask-list",
              "grouped-bid-list"
            );
          }
        }
      }
    }
  } catch (e) {
    console.error("웹소켓 메시지 파싱 오류:", e);
  }
}

// ============================================
// 거래 관련 함수
// ============================================
function updateTradingPanel() {
  const coinCode = activeCoin;
  const coinName = coinCode.split("-")[1];

  // 매수/매도 탭 전환 시 주문 가능 금액/수량 업데이트
  if (activeTradingSide === "bid") {
    availableAmountValue.textContent = `${userKRWBalance.toLocaleString()} KRW`;
    buyButton.classList.remove("hidden");
    sellButton.classList.add("hidden");
  } else {
    const coinBalance = userCoinBalance[activeCoin] || 0;
    availableAmountValue.textContent = `${coinBalance.toFixed(8)} ${coinName}`;
    buyButton.classList.add("hidden");
    sellButton.classList.remove("hidden");
  }

  const priceGroup = document.querySelector(".price-input-group");
  const quantityGroup = document.querySelector(".quantity-input-group");
  const totalGroupLimit = document.querySelector(
    ".trading-total-group:not(.hidden)"
  );
  const totalGroupMarket = document.querySelectorAll(".trading-total-group")[1]; // 두 번째 total group

  // 지정가/시장가에 따라 UI 변경
  if (activeTradingType === "limit") {
    priceGroup?.classList.remove("hidden");
    quantityGroup?.classList.remove("hidden");
    totalGroupLimit?.classList.remove("hidden");
    totalGroupMarket?.classList.add("hidden");

    if (orderPriceInput) {
      orderPriceInput.disabled = false;
      // 개선: 가격 필드를 초기화하지 않고, 비어 있을 때만 현재 가격으로 설정 (handleWebSocketMessage에서 이미 처리됨)
      if (!orderPriceInput.value || orderPriceInput.value.trim() === "") {
        const currentPrice = latestTickerData[activeCoin]?.trade_price || 0;
        if (currentPrice > 0) {
          orderPriceInput.value = currentPrice.toLocaleString("ko-KR");
        }
      }
    }

    // 개선: 기존 값 유지, 무조건 비우지 않음
    // if (orderQuantityInput) orderQuantityInput.value = "";
    // if (orderTotalInput) orderTotalInput.value = "";
  } else if (activeTradingType === "market") {
    priceGroup?.classList.add("hidden");

    if (activeTradingSide === "bid") {
      quantityGroup?.classList.add("hidden");
      totalGroupLimit?.classList.add("hidden");
      totalGroupMarket?.classList.remove("hidden");
      // 개선: 기존 값 유지, 무조건 비우지 않음
      // if (orderTotalMarketInput) orderTotalMarketInput.value = "";
    } else if (activeTradingSide === "ask") {
      quantityGroup?.classList.remove("hidden");
      totalGroupLimit?.classList.add("hidden");
      totalGroupMarket?.classList.add("hidden");
      // 개선: 기존 값 유지, 무조건 비우지 않음
      // if (orderQuantityInput) orderQuantityInput.value = "";
    }
  }

  createPercentageDropdown();
}

function createPercentageDropdown() {
  if (!pricePercentageDropdown) return;

  pricePercentageDropdown.innerHTML = "";
  const percentages = [-20, -15, -10, -5, 0, 5, 10, 15, 20];

  percentages.forEach((percent) => {
    const option = document.createElement("option");
    option.value = percent;
    option.textContent = `${percent}%`;
    pricePercentageDropdown.appendChild(option);
  });
}

function updateTotal() {
  if (!orderPriceInput || !orderQuantityInput || !orderTotalInput) return;

  const price = parseFloat(orderPriceInput.value.replace(/,/g, ""));
  const quantity = parseFloat(orderQuantityInput.value);

  if (!isNaN(price) && !isNaN(quantity)) {
    orderTotalInput.value = (price * quantity).toLocaleString("ko-KR");
  } else {
    orderTotalInput.value = "";
  }
}

async function sendOrder(side) {
  let orderData = {
    market: activeCoin,
    side: side,
    type: activeTradingType,
  };

  let price, quantity, totalAmount;

  if (activeTradingType === "limit") {
    price = parseFloat(orderPriceInput.value.replace(/,/g, ""));
    quantity = parseFloat(orderQuantityInput.value);

    if (isNaN(price) || isNaN(quantity) || price <= 0 || quantity <= 0) {
      alert("주문 가격과 수량을 올바르게 입력해주세요.");
      return;
    }

    orderData.price = price;
    orderData.quantity = quantity;
  } else if (activeTradingType === "market") {
    if (side === "bid") {
      totalAmount = parseFloat(orderTotalMarketInput.value.replace(/,/g, ""));
      if (isNaN(totalAmount) || totalAmount <= 0) {
        alert("주문 총액을 올바르게 입력해주세요.");
        return;
      }
      orderData.price = totalAmount;
      orderData.quantity = 0;
    } else {
      quantity = parseFloat(orderQuantityInput.value);
      if (isNaN(quantity) || quantity <= 0) {
        alert("주문 수량을 올바르게 입력해주세요.");
        return;
      }
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
      fetchUserBalance();
    }
  } catch (error) {
    console.error("주문 요청 오류:", error);
    alert("주문 요청 중 오류가 발생했습니다.");
  }
}

async function fetchUserBalance() {
  try {
    const response = await fetch("/api/balance");
    if (!response.ok) {
      throw new Error("잔고 정보를 가져오는 데 실패했습니다.");
    }

    const data = await response.json();
    userKRWBalance = data.krw_balance;
    userCoinBalance = {
      "KRW-BTC": data.btc_balance,
      "KRW-ETH": data.eth_balance,
      "KRW-XRP": data.xrp_balance,
    };

    updateTradingPanel();
  } catch (error) {
    console.error("잔고 데이터 로딩 오류:", error);
  }
}

function getPriceStep(price) {
  if (price >= 100000000) return 100000;
  if (price >= 50000000) return 50000;
  if (price >= 10000000) return 10000;
  if (price >= 1000000) return 1000;
  if (price >= 100000) return 100;
  if (price >= 10000) return 10;
  if (price >= 1000) return 5;
  if (price >= 100) return 1;
  return 0.1;
}

// ============================================
// 이벤트 리스너 설정
// ============================================
function setupEventListeners() {
  // 호가창 탭 전환
  document.getElementById("toggle-general")?.addEventListener("click", () => {
    activeOrderbookType = "general";
    document.getElementById("toggle-general").classList.add("active");
    document.getElementById("toggle-grouped").classList.remove("active");
    document
      .getElementById("general-orderbook-container")
      .classList.remove("hidden");
    document
      .getElementById("grouped-orderbook-container")
      .classList.add("hidden");
    updateOrderbookUI(
      latestOrderbookData[activeCoin].general,
      "general-ask-list",
      "general-bid-list"
    );
  });

  document.getElementById("toggle-grouped")?.addEventListener("click", () => {
    activeOrderbookType = "grouped";
    document.getElementById("toggle-general").classList.remove("active");
    document.getElementById("toggle-grouped").classList.add("active");
    document
      .getElementById("general-orderbook-container")
      .classList.add("hidden");
    document
      .getElementById("grouped-orderbook-container")
      .classList.remove("hidden");
    updateOrderbookUI(
      latestOrderbookData[activeCoin].grouped,
      "grouped-ask-list",
      "grouped-bid-list"
    );
  });

  // 시간 탭 전환
  document.getElementById("time-tabs")?.addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON") {
      document
        .querySelectorAll(".time-tab")
        .forEach((btn) => btn.classList.remove("active"));
      e.target.classList.add("active");
      activeUnit = e.target.dataset.unit;
      fetchAndRenderChart();
    }
  });

  // 매수/매도 탭 전환
  document.querySelectorAll(".trading-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".trading-tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeTradingSide = tab.dataset.side;
      updateTradingPanel();
      fetchUserBalance();
    });
  });

  // 거래 타입 버튼
  document.querySelectorAll(".trading-type-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("disabled")) return;
      document
        .querySelectorAll(".trading-type-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeTradingType = btn.dataset.type;
      updateTradingPanel();
    });
  });

  // 가격 +/- 버튼
  document.querySelectorAll(".price-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!orderPriceInput) return;
      let currentPrice =
        parseFloat(orderPriceInput.value.replace(/,/g, "")) || 0;
      if (btn.classList.contains("minus")) {
        currentPrice -= 1000;
      } else {
        currentPrice += 1000;
      }
      orderPriceInput.value = Math.max(0, currentPrice).toLocaleString("ko-KR");
      updateTotal();
    });
  });

  // 가격 드롭다운 변경
  pricePercentageDropdown?.addEventListener("change", (e) => {
    const currentPrice = latestTickerData[activeCoin]?.trade_price || 0;
    const percent = parseInt(e.target.value) / 100;
    const newPrice = currentPrice * (1 + percent);
    if (orderPriceInput) {
      orderPriceInput.value = newPrice.toLocaleString("ko-KR");
      updateTotal();
    }
  });

  // 수량 퍼센트 버튼
  document.querySelectorAll(".quantity-btns").forEach((group) => {
    group.addEventListener("click", (e) => {
      if (e.target.tagName !== "BUTTON") return;
      const percent = parseInt(e.target.dataset.percent) / 100;

      if (
        activeTradingType === "limit" &&
        group.closest(".quantity-input-group")
      ) {
        const orderPrice = parseFloat(
          orderPriceInput?.value.replace(/,/g, "") || "0"
        );
        let calculatedQuantity = 0;

        if (activeTradingSide === "bid" && orderPrice > 0) {
          calculatedQuantity = (userKRWBalance * percent) / orderPrice;
        } else if (activeTradingSide === "ask") {
          calculatedQuantity = userCoinBalance[activeCoin] * percent;
        }

        if (orderQuantityInput) {
          orderQuantityInput.value = calculatedQuantity.toFixed(8);
          updateTotal();
        }
      } else if (
        activeTradingType === "market" &&
        group.closest(".trading-total-group")
      ) {
        const totalAmount = userKRWBalance * percent;
        if (orderTotalMarketInput) {
          orderTotalMarketInput.value = totalAmount.toLocaleString("ko-KR");
        }
      }
    });
  });

  // 거래 버튼
  document.querySelectorAll(".trade-button").forEach((button) => {
    button.addEventListener("click", () => {
      const side = button.classList.contains("bid-button") ? "bid" : "ask";
      sendOrder(side);
    });
  });

  // 입력 필드 이벤트
  orderPriceInput?.addEventListener("input", updateTotal);
  orderQuantityInput?.addEventListener("input", updateTotal);
}

// ============================================
// 초기화 및 시작
// ============================================
document.addEventListener("DOMContentLoaded", () => {
  initializeData();
  setupEventListeners();
  updateUI(activeCoin);
  fetchAndRenderChart();
  updateOrderbookUI(
    latestOrderbookData[activeCoin].general,
    "general-ask-list",
    "general-bid-list"
  );
  fetchUserBalance();
  updateTradingPanel();
  initWebSocket();

  // 주기적으로 차트 업데이트
  setInterval(checkAndAutoUpdateChart, 5000);
});
