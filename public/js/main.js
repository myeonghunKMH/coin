// main.js

import { CryptoTradingApp } from "./crypto-trading-app.js";
import { Utils } from "./utils.js";

let app = null;

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

window.addEventListener("beforeunload", () => {
  if (app) {
    app.cleanup();
  }
});

// 개발용 전역 접근
if (typeof window !== "undefined") {
  window.TradingApp = {
    app: () => app,
    utils: Utils,
    getState: () => app?.state,
    switchCoin: (code) => app?.uiController.switchCoin(code),
    refreshChart: () => app?.chartManager.fetchAndRender(),
    refreshBalance: () => app?.tradingManager.fetchUserBalance(),
    refreshPendingOrders: () => app?.tradingManager.fetchPendingOrders(),
    cancelOrder: (orderId) => app?.tradingManager.cancelOrder(orderId),
  };
}
