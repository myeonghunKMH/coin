// src/routes/api-router.js
const express = require("express");
const axios = require("axios");
const CONFIG = require("../config");
const KRWUtils = require("../utils/krw-utils");
const ValidationUtils = require("../utils/validation-utils");

class APIRouter {
  constructor(dbManager, tradingService) {
    this.db = dbManager;
    this.trading = tradingService;
    this.router = express.Router();
    this.setupRoutes();
  }

  setupRoutes() {
    this.router.get("/balance", this.getBalance.bind(this));
    this.router.post("/trade", this.postTrade.bind(this));
    this.router.get("/candles", this.getCandles.bind(this));
    this.router.get("/transactions", this.getTransactions.bind(this));
    this.router.get("/pending-orders", this.getPendingOrders.bind(this));
    this.router.delete(
      "/pending-orders/:orderId",
      this.cancelPendingOrder.bind(this)
    );
  }

  async getBalance(req, res) {
    try {
      const balance = await this.db.getUserBalance(CONFIG.DEFAULT_USER);

      if (!balance) {
        return res.status(404).json({
          error: "사용자 잔고를 찾을 수 없습니다.",
          code: "USER_NOT_FOUND",
        });
      }

      const processedBalance = KRWUtils.processBalance(balance);
      res.json(processedBalance);
    } catch (err) {
      console.error("잔고 조회 오류:", err);
      res.status(500).json({
        error: "서버 오류: 잔고 조회에 실패했습니다.",
        code: "INTERNAL_ERROR",
      });
    }
  }

  async postTrade(req, res) {
    const { market, side, type, price, quantity } = req.body;

    // 입력값 유효성 검사
    const validation = ValidationUtils.validateTradeInput(
      market,
      side,
      type,
      price,
      quantity
    );
    if (!validation.isValid) {
      return res.status(400).json({
        error: "주문 정보가 유효하지 않습니다.",
        details: validation.errors,
        code: "INVALID_INPUT",
      });
    }

    try {
      const orderDetails = await this.trading.executeOrder(
        market,
        side,
        type,
        validation.normalizedPrice,
        validation.normalizedQuantity
      );

      res.status(200).json({
        message: "주문이 성공적으로 접수되었습니다.",
        orderDetails,
      });
    } catch (error) {
      console.error("❌ 주문 처리 중 오류 발생:", error.message);
      res.status(500).json({
        error: error.message || "주문 처리 중 서버 오류가 발생했습니다.",
        code: "TRADE_PROCESSING_ERROR",
      });
    }
  }

  async getCandles(req, res) {
    const { unit, market } = req.query;

    const validation = ValidationUtils.validateApiParams({ unit, market }, [
      "unit",
      "market",
    ]);
    if (!validation.isValid) {
      return res.status(400).json({
        error: `다음 파라미터가 필요합니다: ${validation.missing.join(", ")}`,
        code: "MISSING_PARAMETERS",
      });
    }

    try {
      let url;
      if (unit === "1D") {
        url = `https://api.upbit.com/v1/candles/days?market=${market}&count=200`;
      } else {
        url = `https://api.upbit.com/v1/candles/minutes/${unit}?market=${market}&count=200`;
      }

      const response = await axios.get(url, {
        headers: { "Accept-Encoding": "gzip, deflate" },
        timeout: 10000,
      });

      res.json(response.data);
    } catch (error) {
      console.error("❌ 캔들 데이터 요청 오류:", error.message);
      res.status(500).json({
        error: "캔들 데이터를 가져오는 데 실패했습니다.",
        code: "CANDLE_DATA_ERROR",
      });
    }
  }

  async getTransactions(req, res) {
    const { limit = 50, offset = 0 } = req.query;

    try {
      const userId = await this.db.getUserById(CONFIG.DEFAULT_USER);
      if (!userId) {
        return res.status(404).json({
          error: "사용자를 찾을 수 없습니다.",
          code: "USER_NOT_FOUND",
        });
      }

      const transactions = await this.db.getUserTransactions(
        userId,
        limit,
        offset
      );
      // ✅ 화살표 함수를 사용하여 'this' 컨텍스트를 유지합니다.
      const processedTransactions = transactions.map((t) =>
        KRWUtils.processTransaction(t)
      );

      res.json(processedTransactions);
    } catch (error) {
      console.error("❌ 거래 내역 조회 오류:", error);
      res.status(500).json({
        error: "거래 내역 조회에 실패했습니다.",
        code: "TRANSACTION_HISTORY_ERROR",
      });
    }
  }
  async getPendingOrders(req, res) {
    try {
      const userId = await this.db.getUserById(CONFIG.DEFAULT_USER);
      if (!userId) {
        return res.status(404).json({
          error: "사용자를 찾을 수 없습니다.",
          code: "USER_NOT_FOUND",
        });
      }

      const orders = await this.db.getUserPendingOrders(userId);
      res.json(orders);
    } catch (error) {
      console.error("대기 주문 조회 오류:", error);
      res.status(500).json({
        error: "대기 주문 조회에 실패했습니다.",
        code: "PENDING_ORDERS_ERROR",
      });
    }
  }
  async cancelPendingOrder(req, res) {
    try {
      const { orderId } = req.params;

      if (!orderId || isNaN(orderId)) {
        return res.status(400).json({
          error: "유효한 주문 ID가 필요합니다.",
          code: "INVALID_ORDER_ID",
        });
      }

      const userId = await this.db.getUserById(CONFIG.DEFAULT_USER);
      if (!userId) {
        return res.status(404).json({
          error: "사용자를 찾을 수 없습니다.",
          code: "USER_NOT_FOUND",
        });
      }

      const result = await this.db.cancelPendingOrder(
        userId,
        parseInt(orderId)
      );
      res.json(result);
    } catch (error) {
      console.error("주문 취소 오류:", error);
      res.status(500).json({
        error: error.message || "주문 취소에 실패했습니다.",
        code: "CANCEL_ORDER_ERROR",
      });
    }
  }
}
module.exports = APIRouter;
