import { MARKET_CODES } from "./constants.js";
import { Utils } from "./utils.js";

export class WebSocketManager {
  constructor(state, uiController, tradingManager) {
    this.state = state;
    this.ui = uiController;
    this.trading = tradingManager;
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

    const previousPrice = this.state.latestTickerData[code]?.trade_price;
    const currentPrice = data.trade_price;

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

      // ❌ 주문가 자동 업데이트 제거 - 사용자가 입력한 값 유지
      // this.ui.updateTradingPanel(); // 이것도 제거하여 불필요한 업데이트 방지
    }

    // 가격이 변경되었을 때 대기 주문 새로고침 (체결되었을 수 있음)
    if (previousPrice !== currentPrice) {
      setTimeout(() => {
        this.trading.fetchPendingOrders();
        this.trading.fetchUserBalance();
      }, 500);
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
