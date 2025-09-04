// public/js/websocket-manager.js - 개선된 버전
import { MARKET_CODES } from "./constants.js";
import { Utils } from "./utils.js";

export class WebSocketManager {
  constructor(state, uiController, tradingManager) {
    this.state = state;
    this.ui = uiController;
    this.trading = tradingManager;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
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
      this.handleReconnection();
    };

    this.ws.onopen = () => {
      console.log("✅ 웹소켓 연결 성공");
      this.reconnectAttempts = 0; // 연결 성공 시 재시도 횟수 리셋
    };
  }

  handleReconnection() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);

      console.log(
        `재연결 시도 ${this.reconnectAttempts}/${this.maxReconnectAttempts} (${
          delay / 1000
        }초 후)`
      );

      setTimeout(() => this.connect(), delay);
    } else {
      console.error("웹소켓 재연결 실패 - 최대 시도 횟수 초과");
      if (this.ui?.dom?.showOrderResult) {
        this.ui.dom.showOrderResult(
          "실시간 데이터 연결이 끊어졌습니다.",
          false
        );
      }
    }
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data);

      // 🔥 주문 체결 알림 처리 (개선된 버전)
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

  // 🔧 개선된 주문 체결 알림 처리
  async handleOrderFillNotification(orderData) {
    console.log("🎯 주문 체결 알림 수신:", orderData);

    // 체결 타입에 따른 다른 메시지
    let message;
    const coinSymbol = orderData.market ? orderData.market.split("-")[1] : "";
    const sideText = orderData.side === "bid" ? "매수" : "매도";
    const executedQuantityText = Utils.formatCoinAmount(
      orderData.executedQuantity || 0,
      4
    );

    if (orderData.status === "filled") {
      message = `${coinSymbol} ${sideText} 주문이 완전체결되었습니다! 💰\n체결가: ${Utils.formatKRW(
        orderData.executionPrice
      )}원`;
    } else if (orderData.status === "partial") {
      message = `${coinSymbol} ${sideText} 주문이 부분체결되었습니다! ⚡\n체결가: ${Utils.formatKRW(
        orderData.executionPrice
      )}원\n체결량: ${executedQuantityText}개`;
    } else {
      message = `${coinSymbol} ${sideText} 주문이 체결되었습니다!\n체결가: ${Utils.formatKRW(
        orderData.executionPrice
      )}원`;
    }

    if (this.ui?.dom?.showOrderResult) {
      this.ui.dom.showOrderResult(message, true);
    }

    // 🔧 체결 사운드 효과 재생
    this.playFillSound(orderData.status);

    // 🔧 체결 애니메이션 효과
    this.showFillAnimation(orderData);

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

  // 🔧 체결 사운드 효과
  playFillSound(status = "filled") {
    try {
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();

      if (status === "filled") {
        // 완전체결 - 높은 음의 2음
        this.playTone(audioContext, 880, 0.1, 0.3); // 높은 도
        setTimeout(() => {
          this.playTone(audioContext, 1108, 0.1, 0.3); // 높은 레
        }, 150);
      } else {
        // 부분체결 - 낮은 음 1개
        this.playTone(audioContext, 660, 0.15, 0.2); // 미
      }
    } catch (error) {
      console.log("사운드 재생 실패:", error);
    }
  }

  playTone(audioContext, frequency, duration, volume) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + duration
    );

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
  }

  // 🔧 체결 애니메이션 효과
  showFillAnimation(orderData) {
    // 화면 상단에 체결 알림 애니메이션 표시
    const notification = document.createElement("div");
    notification.className = "fill-notification";
    notification.style.cssText = `
      position: fixed;
      top: -100px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #00C851, #00ff88);
      color: white;
      padding: 15px 25px;
      border-radius: 25px;
      font-size: 14px;
      font-weight: bold;
      z-index: 10001;
      box-shadow: 0 8px 32px rgba(0, 200, 81, 0.3);
      transition: all 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
      white-space: nowrap;
    `;

    const coinSymbol = orderData.market ? orderData.market.split("-")[1] : "";
    const sideText = orderData.side === "bid" ? "매수" : "매도";

    notification.innerHTML = `
      🎉 ${coinSymbol} ${sideText} 체결! ${Utils.formatKRW(
      orderData.executionPrice
    )}원
    `;

    document.body.appendChild(notification);

    // 애니메이션 실행
    setTimeout(() => {
      notification.style.top = "20px";
    }, 100);

    // 3초 후 제거
    setTimeout(() => {
      notification.style.top = "-100px";
      notification.style.opacity = "0";

      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 500);
    }, 3000);
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

  // 연결 상태 확인 메서드
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  // 수동 재연결 메서드
  forceReconnect() {
    if (this.ws) {
      this.ws.close();
    }
    this.reconnectAttempts = 0;
    this.connect();
  }
}
