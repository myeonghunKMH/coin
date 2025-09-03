// public/js/websocket-manager.js (Enhanced with Order Fill Notifications)
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
      console.log("웹소켓 연결 종료 - 재연결 시도 중...");
      setTimeout(() => this.connect(), 3000);
    };

    this.ws.onopen = () => {
      console.log("✅ 웹소켓 연결 성공");
    };
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data);

      // 🔥 주문 체결 알림 처리
      if (message.type === "order_filled") {
        this.handleOrderFillNotification(message.data);
        return;
      }

      // 기존 업비트 데이터 처리
      if (message.type === "ticker") {
        this.handleTickerData(message);
      } else if (message.type === "orderbook") {
        this.handleOrderbookData(message);
      }
    } catch (error) {
      console.error("웹소켓 메시지 파싱 오류:", error);
    }
  }

  /**
   * 주문 체결 알림 처리
   */
  async handleOrderFillNotification(orderData) {
    console.log("🎯 주문 체결 알림 수신:", orderData);

    // 성공 토스트 메시지 표시
    const message = `${orderData.market} ${
      orderData.side === "bid" ? "매수" : "매도"
    } 주문이 체결되었습니다! (가격: ${Utils.formatKRW(
      orderData.executionPrice
    )})`;

    if (this.ui?.dom?.showOrderResult) {
      this.ui.dom.showOrderResult(message, true);
    }

    // 관련 데이터 새로고침
    setTimeout(async () => {
      await this.trading.fetchUserBalance();
      const pendingOrders = await this.trading.fetchPendingOrders();
      const filledOrders = await this.trading.fetchFilledOrders();

      this.ui.updatePendingOrdersList(pendingOrders);
      this.ui.updateFilledOrdersList(filledOrders);
      this.ui.updateTradingPanel();
    }, 500);
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
    }

    // 가격 변동시 UI 업데이트 (체결된 주문이 있을 수 있음)
    if (previousPrice !== currentPrice) {
      setTimeout(async () => {
        await this.trading.fetchUserBalance();
        const pendingOrders = await this.trading.fetchPendingOrders();
        this.ui.updatePendingOrdersList(pendingOrders);
      }, 1000);
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
