// src/managers/websocket-manager.js (Enhanced with Order Matching)
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
const CONFIG = require("../config");
const KRWUtils = require("../utils/krw-utils");
const OrderMatchingEngine = require("../services/order-matching-engine");

class WebSocketManager {
  constructor(clientWebSocketServer, dbManager) {
    this.upbitWs = null;
    this.clientWss = clientWebSocketServer;
    this.currentMarketPrices = {};
    this.dbManager = dbManager;

    // 주문 매칭 엔진 초기화
    this.matchingEngine = new OrderMatchingEngine(dbManager);

    // 호가창 데이터 저장 (체결 검사용)
    this.latestOrderbooks = {};
  }

  connect() {
    this.upbitWs = new WebSocket(CONFIG.UPBIT_WS_URL);

    this.upbitWs.onopen = () => {
      console.log("✅ 업비트 웹소켓 서버에 연결되었습니다.");
      this.sendSubscriptionRequest();
    };

    this.upbitWs.onmessage = (event) => {
      this.handleMessage(event);
    };

    this.upbitWs.onclose = () => {
      console.log(
        "⚠️ 업비트 웹소켓 연결이 끊어졌습니다. 재연결을 시도합니다..."
      );
      setTimeout(() => this.connect(), 5000);
    };

    this.upbitWs.onerror = (error) => {
      console.error("❌ 업비트 웹소켓 오류:", error);
    };
  }

  sendSubscriptionRequest() {
    const requestMessage = [
      { ticket: uuidv4() },
      { type: "ticker", codes: CONFIG.MARKET_CODES },
      { type: "orderbook", codes: CONFIG.MARKET_CODES, level: 0 },
      { type: "orderbook", codes: ["KRW-BTC"], level: 1000000 },
      { type: "orderbook", codes: ["KRW-ETH"], level: 10000 },
      { type: "orderbook", codes: ["KRW-XRP"], level: 1 },
      { format: "DEFAULT" },
    ];

    this.upbitWs.send(JSON.stringify(requestMessage));
  }

  async handleMessage(event) {
    try {
      const data = JSON.parse(event.data);

      if (data.type === "ticker") {
        this.handleTickerData(data);
      } else if (data.type === "orderbook") {
        await this.handleOrderbookData(data);
      }

      // 연결된 모든 클라이언트에게 데이터 전송
      this.broadcastToClients(event.data);
    } catch (error) {
      console.error("웹소켓 메시지 처리 오류:", error);
    }
  }

  handleTickerData(data) {
    const code = data.code;
    if (!CONFIG.MARKET_CODES.includes(code)) return;

    // 현재 시장가 업데이트 (정수로 저장)
    this.currentMarketPrices[code] = KRWUtils.toInteger(data.trade_price);
  }

  async handleOrderbookData(data) {
    const code = data.code;
    if (!CONFIG.MARKET_CODES.includes(code)) return;

    // 호가창 데이터 저장
    this.latestOrderbooks[code] = data;

    // 🔥 핵심: 호가창이 업데이트될 때마다 주문 매칭 검사
    if (data.level === 0) {
      // 일반 호가창만 처리 (grouped는 제외)
      try {
        await this.matchingEngine.processOrderbook(code, data);
      } catch (error) {
        console.error(`주문 매칭 처리 오류 (${code}):`, error);
      }
    }
  }

  broadcastToClients(data) {
    this.clientWss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  /**
   * 주문 체결 알림을 클라이언트에게 전송
   */
  broadcastOrderFillNotification(userId, orderDetails) {
    const notification = {
      type: "order_filled",
      userId: userId,
      data: orderDetails,
    };

    this.clientWss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(notification));
      }
    });
  }

  getCurrentPrice(market) {
    return this.currentMarketPrices[market];
  }

  getIntegerPrices() {
    const integerPrices = {};
    Object.keys(this.currentMarketPrices).forEach((market) => {
      integerPrices[market] = KRWUtils.toInteger(
        this.currentMarketPrices[market]
      );
    });
    return integerPrices;
  }

  close() {
    if (this.upbitWs) {
      this.upbitWs.close();
    }
  }
}

module.exports = WebSocketManager;
