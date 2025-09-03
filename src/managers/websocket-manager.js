// src/managers/websocket-manager.js
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
const CONFIG = require("../config");
const KRWUtils = require("../utils/krw-utils");

class WebSocketManager {
  constructor(clientWebSocketServer) {
    this.upbitWs = null;
    this.clientWss = clientWebSocketServer;
    this.currentMarketPrices = {};
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

  handleMessage(event) {
    try {
      const data = JSON.parse(event.data);

      // 현재 시장가 업데이트 (정수로 저장)
      if (data.type === "ticker") {
        this.currentMarketPrices[data.code] = KRWUtils.toInteger(
          data.trade_price
        );
      }

      // 연결된 모든 클라이언트에게 데이터 전송
      this.broadcastToClients(event.data);
    } catch (error) {
      console.error("웹소켓 메시지 처리 오류:", error);
    }
  }

  broadcastToClients(data) {
    this.clientWss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
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
