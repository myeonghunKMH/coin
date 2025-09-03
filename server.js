const express = require("express");
const { Server } = require("ws");
const http = require("http");
const { v4: uuidv4 } = require("uuid");
const WebSocket = require("ws");
const axios = require("axios");
const cors = require("cors");
const sql = require("mssql");
const path = require("path");

// ============================================
// 설정 및 상수
// ============================================
const CONFIG = {
  PORT: process.env.PORT || 3000,
  DEFAULT_USER: "testuser",
  MARKET_CODES: ["KRW-BTC", "KRW-ETH", "KRW-XRP"],
  UPBIT_WS_URL: "wss://api.upbit.com/websocket/v1",
  DB_CONFIG: {
    user: process.env.DB_USER || "new_trading_user",
    password: process.env.DB_PASSWORD || "YourStrongPassword1!",
    server: process.env.DB_SERVER || "localhost",
    database: process.env.DB_NAME || "new_trading_db",
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  },
};

// ============================================
// 유틸리티 클래스
// ============================================
class KRWUtils {
  /**
   * 원화 금액을 정수로 변환 (소수점 완전 제거)
   */
  static toInteger(amount) {
    const num = Number(amount) || 0;
    return Math.floor(Math.abs(num)) * Math.sign(num);
  }

  /**
   * 거래 총액 계산 후 정수로 변환
   */
  static calculateTotal(price, quantity) {
    const total = Number(price) * Number(quantity);
    return this.toInteger(total);
  }

  /**
   * 문자열에서 콤마 제거 후 숫자 변환
   */
  static parseNumber(value) {
    if (typeof value === "string") {
      return Number(value.replace(/,/g, "")) || 0;
    }
    return Number(value) || 0;
  }

  /**
   * 잔고 데이터 처리 (원화는 정수로)
   */
  static processBalance(balance) {
    return {
      ...balance,
      krw_balance: this.toInteger(balance.krw_balance),
    };
  }

  /**
   * 거래 데이터 처리 (원화는 정수로)
   */
  static processTransaction(transaction) {
    return {
      ...transaction,
      price: this.toInteger(transaction.price),
      total_amount: this.toInteger(transaction.total_amount),
    };
  }
}

class ValidationUtils {
  /**
   * 거래 입력값 유효성 검사
   */
  static validateTradeInput(market, side, type, price, quantity) {
    const errors = [];

    // 필수 필드 검사
    if (!market) errors.push("market은 필수입니다.");
    if (!side || !["bid", "ask"].includes(side)) {
      errors.push("side는 'bid' 또는 'ask'이어야 합니다.");
    }
    if (!type || !["market", "limit"].includes(type)) {
      errors.push("type은 'market' 또는 'limit'이어야 합니다.");
    }

    // 숫자 변환 및 유효성 검사
    const normalizedPrice = KRWUtils.parseNumber(price);
    const normalizedQuantity = KRWUtils.parseNumber(quantity);

    if (type === "limit") {
      if (isNaN(normalizedPrice) || normalizedPrice <= 0) {
        errors.push("지정가 주문에는 유효한 가격이 필요합니다.");
      }
      if (isNaN(normalizedQuantity) || normalizedQuantity <= 0) {
        errors.push("지정가 주문에는 유효한 수량이 필요합니다.");
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      normalizedPrice,
      normalizedQuantity,
    };
  }

  /**
   * API 파라미터 유효성 검사
   */
  static validateApiParams(params, required) {
    const missing = required.filter((param) => !params[param]);
    return {
      isValid: missing.length === 0,
      missing,
    };
  }
}

// ============================================
// 데이터베이스 관리자
// ============================================
class DatabaseManager {
  constructor() {
    this.pool = null;
  }

  async connect() {
    try {
      this.pool = await sql.connect(CONFIG.DB_CONFIG);
      console.log("✅ MSSQL 데이터베이스에 성공적으로 연결되었습니다.");
    } catch (err) {
      console.error("❌ MSSQL 데이터베이스 연결 오류:", err);
      throw err;
    }
  }

  async getUserById(username) {
    const request = new sql.Request(this.pool);
    const result = await request
      .input("username", sql.NVarChar, username)
      .query("SELECT id FROM users WHERE username = @username");

    return result.recordset[0]?.id;
  }

  async getUserBalance(username) {
    const request = new sql.Request(this.pool);
    const result = await request.input("username", sql.NVarChar, username)
      .query(`
        SELECT krw_balance, btc_balance, eth_balance, xrp_balance 
        FROM users 
        WHERE username = @username
      `);

    return result.recordset[0];
  }

  async getUserTransactions(userId, limit, offset) {
    const request = new sql.Request(this.pool);
    const result = await request
      .input("userId", sql.Int, userId)
      .input("limit", sql.Int, parseInt(limit))
      .input("offset", sql.Int, parseInt(offset)).query(`
        SELECT market, side, type, price, quantity, total_amount, created_at
        FROM transactions 
        WHERE user_id = @userId 
        ORDER BY created_at DESC 
        OFFSET @offset ROWS 
        FETCH NEXT @limit ROWS ONLY
      `);

    return result.recordset;
  }

  async getUserPendingOrders(userId) {
    const request = new sql.Request(this.pool);
    request.input("userId", sql.Int, userId);

    const result = await request.query(`
  SELECT id, market, side, order_type, price, quantity, remaining_quantity, 
         total_amount, status, created_at
  FROM pending_orders 
  WHERE user_id = @userId AND status = 'pending'
  ORDER BY created_at DESC
`);

    return result.recordset;
  }

  async createPendingOrder(
    userId,
    market,
    side,
    price,
    quantity,
    totalAmount,
    type
  ) {
    const request = new sql.Request(this.pool);
    const result = await request
      .input("userId", sql.Int, userId)
      .input("market", sql.VarChar(20), market)
      .input("side", sql.NVarChar, side)
      .input("orderType", sql.NVarChar, type)
      .input("price", sql.Decimal(18, 0), KRWUtils.toInteger(price))
      .input("quantity", sql.Decimal(18, 8), quantity)
      .input("remainingQuantity", sql.Decimal(18, 8), quantity)
      .input("totalAmount", sql.Decimal(18, 0), KRWUtils.toInteger(totalAmount))
      .query(`
      INSERT INTO pending_orders 
      (user_id, market, side, order_type, price, quantity, remaining_quantity, total_amount)
      OUTPUT INSERTED.id
      VALUES (@userId, @market, @side, @orderType, @price, @quantity, @remainingQuantity, @totalAmount)
    `);

    return {
      orderId: result.recordset[0].id,
      status: "pending",
      message: "지정가 주문이 등록되었습니다.",
    };
  }

  async cancelPendingOrder(userId, orderId) {
    const request = new sql.Request(this.pool);
    const result = await request
      .input("userId", sql.Int, userId)
      .input("orderId", sql.Int, orderId).query(`
      UPDATE pending_orders 
      SET status = 'cancelled', updated_at = GETDATE()
      WHERE id = @orderId AND user_id = @userId AND status = 'pending'
    `);

    if (result.rowsAffected[0] === 0) {
      throw new Error("취소할 수 있는 주문을 찾을 수 없습니다.");
    }

    return { message: "주문이 성공적으로 취소되었습니다." };
  }

  async executeTradeTransaction(
    userId,
    market,
    side,
    finalPrice,
    finalQuantity,
    totalAmount,
    type
  ) {
    const transaction = new sql.Transaction(this.pool);

    try {
      await transaction.begin();

      const request = new sql.Request(transaction);
      const coinName = market.split("-")[1].toLowerCase();

      // 파라미터 설정
      request.input("userId", sql.Int, userId);
      request.input("market", sql.VarChar(20), market);
      request.input(
        "finalPrice",
        sql.Decimal(18, 0),
        KRWUtils.toInteger(finalPrice)
      );
      request.input("finalQuantity", sql.Decimal(18, 8), finalQuantity);
      request.input(
        "totalAmount",
        sql.Decimal(18, 0),
        KRWUtils.toInteger(totalAmount)
      );
      request.input("side", sql.NVarChar, side);
      request.input("type", sql.NVarChar, type);

      if (side === "bid") {
        // 매수 처리
        await this.processBuyOrder(request, coinName, totalAmount);
      } else {
        // 매도 처리
        await this.processSellOrder(
          request,
          coinName,
          finalQuantity,
          totalAmount
        );
      }

      // 거래 내역 기록
      await request.query(`
        INSERT INTO transactions (user_id, market, side, price, quantity, total_amount, type) 
        VALUES (@userId, @market, @side, @finalPrice, @finalQuantity, @totalAmount, @type)
      `);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async processBuyOrder(request, coinName, totalAmount) {
    // KRW 잔고 확인
    const balanceResult = await request.query(`
      SELECT krw_balance 
      FROM users WITH (UPDLOCK) 
      WHERE id = @userId
    `);

    const currentBalance = KRWUtils.toInteger(
      balanceResult.recordset[0]?.krw_balance || 0
    );
    const requiredAmount = KRWUtils.toInteger(totalAmount);

    if (currentBalance < requiredAmount) {
      throw new Error("잔액이 부족합니다.");
    }

    const newKrwBalance = KRWUtils.toInteger(currentBalance - requiredAmount);
    request.input("newKrwBalance", sql.Decimal(18, 0), newKrwBalance);

    // 잔고 업데이트
    await request.query(`
      UPDATE users 
      SET krw_balance = @newKrwBalance, 
          ${coinName}_balance = ${coinName}_balance + @finalQuantity 
      WHERE id = @userId
    `);
  }

  async processSellOrder(request, coinName, finalQuantity, totalAmount) {
    // 코인 및 KRW 잔고 확인
    const balanceResult = await request.query(`
      SELECT ${coinName}_balance, krw_balance 
      FROM users WITH (UPDLOCK) 
      WHERE id = @userId
    `);

    const currentCoinBalance =
      balanceResult.recordset[0]?.[`${coinName}_balance`] || 0;
    const currentKrwBalance = KRWUtils.toInteger(
      balanceResult.recordset[0]?.krw_balance || 0
    );

    if (currentCoinBalance < finalQuantity) {
      throw new Error("보유 코인이 부족합니다.");
    }

    const addAmount = KRWUtils.toInteger(totalAmount);
    const newKrwBalance = KRWUtils.toInteger(currentKrwBalance + addAmount);
    request.input("newKrwBalance", sql.Decimal(18, 0), newKrwBalance);

    // 잔고 업데이트
    await request.query(`
      UPDATE users 
      SET krw_balance = @newKrwBalance, 
          ${coinName}_balance = ${coinName}_balance - @finalQuantity 
      WHERE id = @userId
    `);
  }

  async close() {
    if (this.pool) {
      await this.pool.close();
      console.log("✅ 데이터베이스 연결이 정상적으로 종료되었습니다.");
    }
  }
}

// ============================================
// 웹소켓 관리자
// ============================================
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

// ============================================
// 거래 서비스
// ============================================
class TradingService {
  constructor(dbManager, wsManager) {
    this.db = dbManager;
    this.ws = wsManager;
  }

  calculateTradeAmounts(
    market,
    side,
    type,
    normalizedPrice,
    normalizedQuantity
  ) {
    let finalPrice, finalQuantity, totalAmount;

    if (type === "market") {
      const currentPrice = this.ws.getCurrentPrice(market);
      if (!currentPrice) {
        throw new Error("현재 시장가를 가져올 수 없습니다.");
      }

      if (side === "bid") {
        // 시장가 매수: 총액 기준
        totalAmount = KRWUtils.toInteger(normalizedPrice);
        finalPrice = KRWUtils.toInteger(currentPrice);
        finalQuantity = totalAmount / finalPrice;
      } else {
        // 시장가 매도: 수량 기준
        finalQuantity = normalizedQuantity;
        finalPrice = KRWUtils.toInteger(currentPrice);
        totalAmount = KRWUtils.calculateTotal(finalPrice, finalQuantity);
      }
    } else {
      // 지정가 주문
      finalPrice = KRWUtils.toInteger(normalizedPrice);
      finalQuantity = normalizedQuantity;
      totalAmount = KRWUtils.calculateTotal(finalPrice, finalQuantity);

      console.log(
        `📝 지정가 주문 접수: ${market} ${side} - 가격: ${finalPrice.toLocaleString()}, 수량: ${finalQuantity}, 총액: ${totalAmount.toLocaleString()}`
      );
    }

    return { finalPrice, finalQuantity, totalAmount };
  }

  async executeOrder(market, side, type, normalizedPrice, normalizedQuantity) {
    const userId = await this.db.getUserById(CONFIG.DEFAULT_USER);
    if (!userId) {
      throw new Error("사용자를 찾을 수 없습니다.");
    }

    const { finalPrice, finalQuantity, totalAmount } =
      this.calculateTradeAmounts(
        market,
        side,
        type,
        normalizedPrice,
        normalizedQuantity
      );

    // 👇 이 부분이 핵심 수정
    if (type === "limit") {
      console.log("지정가 주문 처리 중:", type);
      // 지정가 주문은 대기 주문으로 처리
      return await this.db.createPendingOrder(
        userId,
        market,
        side,
        finalPrice,
        finalQuantity,
        totalAmount,
        type
      );
    } else {
      console.log("시장가 주문 처리 중:", type);
      // 시장가 주문은 즉시 체결
      await this.db.executeTradeTransaction(
        userId,
        market,
        side,
        finalPrice,
        finalQuantity,
        totalAmount,
        type
      );

      return {
        market,
        side,
        type,
        price: KRWUtils.toInteger(finalPrice),
        quantity: finalQuantity,
        totalAmount: KRWUtils.toInteger(totalAmount),
      };
    }
  }
}

// ============================================
// API 라우터
// ============================================
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

// ============================================
// 메인 애플리케이션 클래스
// ============================================
class TradingServer {
  constructor() {
    // Express 앱 및 서버 설정
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new Server({ server: this.server });

    // 서비스 인스턴스들
    this.dbManager = new DatabaseManager();
    this.wsManager = new WebSocketManager(this.wss);
    this.tradingService = new TradingService(this.dbManager, this.wsManager);
    this.apiRouter = new APIRouter(this.dbManager, this.tradingService);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupErrorHandlers();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(cors());
    this.app.use(express.static(path.join(__dirname, "public")));
  }

  setupRoutes() {
    this.app.use("/api", this.apiRouter.router);
  }

  setupWebSocket() {
    this.wss.on("connection", (ws, req) => {
      const clientIP = req.socket.remoteAddress;
      console.log(`🔗 클라이언트 연결됨 (IP: ${clientIP})`);

      // 연결 시 현재 시장가 전송
      const prices = this.wsManager.getIntegerPrices();
      if (Object.keys(prices).length > 0) {
        ws.send(
          JSON.stringify({
            type: "initial_prices",
            data: prices,
          })
        );
      }

      ws.on("close", () => {
        console.log(`🔌 클라이언트 연결 끊김 (IP: ${clientIP})`);
      });

      ws.on("error", (error) => {
        console.error("클라이언트 웹소켓 오류:", error);
      });
    });
  }

  setupErrorHandlers() {
    // 예외 처리
    process.on("unhandledRejection", (reason, promise) => {
      console.error("Unhandled Rejection at:", promise, "reason:", reason);
    });

    process.on("uncaughtException", (error) => {
      console.error("Uncaught Exception:", error);
      process.exit(1);
    });

    // 서버 종료 처리
    process.on("SIGINT", () => this.shutdown());
  }

  async start() {
    try {
      // 데이터베이스 연결
      await this.dbManager.connect();

      // 업비트 웹소켓 연결
      this.wsManager.connect();

      // HTTP 서버 시작
      this.server.listen(CONFIG.PORT, () => {
        console.log(
          `🚀 서버가 http://localhost:${CONFIG.PORT} 에서 실행 중입니다.`
        );
        console.log(`📊 지원 마켓: ${CONFIG.MARKET_CODES.join(", ")}`);
        console.log(`💰 원화 금액은 정수로 처리됩니다.`);
      });
    } catch (error) {
      console.error("❌ 서버 시작 실패:", error);
      process.exit(1);
    }
  }

  async shutdown() {
    console.log("\n🛑 서버 종료 중...");

    try {
      // 웹소켓 연결 종료
      this.wsManager.close();

      // 데이터베이스 연결 종료
      await this.dbManager.close();

      // HTTP 서버 종료
      this.server.close(() => {
        console.log("✅ 서버가 정상적으로 종료되었습니다.");
        process.exit(0);
      });
    } catch (error) {
      console.error("❌ 서버 종료 중 오류:", error);
      process.exit(1);
    }
  }
}

// ============================================
// 애플리케이션 시작
// ============================================
const server = new TradingServer();
server.start();
