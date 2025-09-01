const express = require("express");
const { Server } = require("ws");
const http = require("http");
const { v4: uuidv4 } = require("uuid");
const WebSocket = require("ws");
const axios = require("axios");
const cors = require("cors");
const sql = require("mssql");
const path = require("path");

// 환경 변수 설정 (실제 운영에서는 .env 파일 사용 권장)
const PORT = process.env.PORT || 3000;
const DB_CONFIG = {
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
};

// 상수 정의
const MARKET_CODES = ["KRW-BTC", "KRW-ETH", "KRW-XRP"];
const UPBIT_WS_URL = "wss://api.upbit.com/websocket/v1";
const DEFAULT_USER = "testuser";

// 전역 변수
let pool;
let currentMarketPrices = {};
let upbitWs;

// Express 앱 및 서버 설정
const app = express();
const server = http.createServer(app);
const wss = new Server({ server });

// 미들웨어 설정
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

/**
 * 데이터베이스 연결 함수
 */
async function connectToDatabase() {
  try {
    pool = await sql.connect(DB_CONFIG);
    console.log("✅ MSSQL 데이터베이스에 성공적으로 연결되었습니다.");
  } catch (err) {
    console.error("❌ MSSQL 데이터베이스 연결 오류:", err);
    process.exit(1); // 데이터베이스 연결 실패 시 서버 종료
  }
}

/**
 * 업비트 웹소켓 연결 및 설정
 */
function connectToUpbitWebSocket() {
  upbitWs = new WebSocket(UPBIT_WS_URL);

  upbitWs.onopen = () => {
    console.log("✅ 업비트 웹소켓 서버에 연결되었습니다.");

    const requestMessage = [
      { ticket: uuidv4() },
      { type: "ticker", codes: MARKET_CODES },
      { type: "orderbook", codes: MARKET_CODES, level: 0 },
      { type: "orderbook", codes: ["KRW-BTC"], level: 1000000 },
      { type: "orderbook", codes: ["KRW-ETH"], level: 10000 },
      { type: "orderbook", codes: ["KRW-XRP"], level: 1 },
      { format: "DEFAULT" },
    ];

    upbitWs.send(JSON.stringify(requestMessage));
  };

  upbitWs.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      // 현재 시장가 업데이트
      if (data.type === "ticker") {
        currentMarketPrices[data.code] = data.trade_price;
      }

      // 연결된 모든 클라이언트에게 데이터 전송
      broadcastToClients(event.data);
    } catch (error) {
      console.error("웹소켓 메시지 처리 오류:", error);
    }
  };

  upbitWs.onclose = () => {
    console.log("⚠️ 업비트 웹소켓 연결이 끊어졌습니다. 재연결을 시도합니다...");
    setTimeout(connectToUpbitWebSocket, 5000); // 5초 후 재연결 시도
  };

  upbitWs.onerror = (error) => {
    console.error("❌ 업비트 웹소켓 오류:", error);
  };
}

/**
 * 모든 연결된 클라이언트에게 데이터 브로드캐스트
 */
function broadcastToClients(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

/**
 * 사용자 잔고 조회 API
 */
app.get("/api/balance", async (req, res) => {
  try {
    const request = new sql.Request(pool);
    const result = await request.input("username", sql.NVarChar, DEFAULT_USER)
      .query(`
        SELECT krw_balance, btc_balance, eth_balance, xrp_balance 
        FROM users 
        WHERE username = @username
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        error: "사용자 잔고를 찾을 수 없습니다.",
        code: "USER_NOT_FOUND",
      });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("잔고 조회 오류:", err);
    res.status(500).json({
      error: "서버 오류: 잔고 조회에 실패했습니다.",
      code: "INTERNAL_ERROR",
    });
  }
});

/**
 * 입력값 유효성 검사 및 정규화
 */
function validateAndNormalizeTradeInput(market, side, type, price, quantity) {
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
  const normalizedPrice =
    typeof price === "string"
      ? parseFloat(price.replace(/,/g, ""))
      : parseFloat(price);

  const normalizedQuantity =
    typeof quantity === "string"
      ? parseFloat(quantity.replace(/,/g, ""))
      : parseFloat(quantity);

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
 * 거래 계산 로직
 */
function calculateTradeAmounts(
  market,
  side,
  type,
  normalizedPrice,
  normalizedQuantity
) {
  let finalPrice, finalQuantity, totalAmount;

  if (type === "market") {
    const currentPrice = currentMarketPrices[market];
    if (!currentPrice) {
      throw new Error("현재 시장가를 가져올 수 없습니다.");
    }

    if (side === "bid") {
      // 시장가 매수: 총액 기준
      totalAmount = normalizedPrice; // 클라이언트에서 'price'에 총액이 들어옴
      finalPrice = currentPrice;
      finalQuantity = totalAmount / finalPrice;
    } else {
      // 시장가 매도: 수량 기준
      finalQuantity = normalizedQuantity;
      finalPrice = currentPrice;
      totalAmount = finalPrice * finalQuantity;
    }
  } else {
    // 지정가 주문
    finalPrice = normalizedPrice;
    finalQuantity = normalizedQuantity;
    totalAmount = finalPrice * finalQuantity;

    console.log(
      `📝 지정가 주문 접수: ${market} ${side} - 가격: ${finalPrice.toLocaleString()}, 수량: ${finalQuantity}, 총액: ${totalAmount.toLocaleString()}`
    );
  }

  return { finalPrice, finalQuantity, totalAmount };
}

/**
 * 잔고 확인 및 업데이트
 */
async function processTradeTransaction(
  transaction,
  userId,
  market,
  side,
  finalPrice,
  finalQuantity,
  totalAmount,
  type
) {
  const request = new sql.Request(transaction);
  const coinName = market.split("-")[1].toLowerCase();

  // 공통 파라미터 설정
  request.input("userId", sql.Int, userId);
  request.input("market", sql.VarChar(20), market);
  request.input("finalPrice", sql.Decimal(18, 8), finalPrice);
  request.input("finalQuantity", sql.Decimal(18, 8), finalQuantity);
  request.input(
    "totalAmount",
    sql.Decimal(18, 2),
    parseFloat(totalAmount.toFixed(2))
  );
  request.input("side", sql.NVarChar, side);
  request.input("type", sql.NVarChar, type);
  request.input("coinName", sql.VarChar(10), coinName);

  if (side === "bid") {
    // 매수: KRW 잔고 확인 및 차감, 코인 잔고 증가
    const balanceResult = await request.query(`
      SELECT krw_balance 
      FROM users WITH (UPDLOCK) 
      WHERE id = @userId
    `);

    const currentBalance = balanceResult.recordset[0]?.krw_balance || 0;
    if (currentBalance < totalAmount) {
      throw new Error("잔액이 부족합니다.");
    }

    await request.query(`
      UPDATE users 
      SET krw_balance = krw_balance - @totalAmount, 
          ${coinName}_balance = ${coinName}_balance + @finalQuantity 
      WHERE id = @userId
    `);
  } else {
    // 매도: 코인 잔고 확인 및 차감, KRW 잔고 증가
    const coinBalanceResult = await request.query(`
      SELECT ${coinName}_balance 
      FROM users WITH (UPDLOCK) 
      WHERE id = @userId
    `);

    const currentCoinBalance =
      coinBalanceResult.recordset[0]?.[`${coinName}_balance`] || 0;
    if (currentCoinBalance < finalQuantity) {
      throw new Error("보유 코인이 부족합니다.");
    }

    await request.query(`
      UPDATE users 
      SET krw_balance = krw_balance + @totalAmount, 
          ${coinName}_balance = ${coinName}_balance - @finalQuantity 
      WHERE id = @userId
    `);
  }

  // 거래 내역 기록
  await request.query(`
    INSERT INTO transactions (user_id, market, side, price, quantity, total_amount, type) 
    VALUES (@userId, @market, @side, @finalPrice, @finalQuantity, @totalAmount, @type)
  `);
}

/**
 * 주문 요청 처리 API
 */
app.post("/api/trade", async (req, res) => {
  const { market, side, type, price, quantity } = req.body;

  // 입력값 유효성 검사
  const validation = validateAndNormalizeTradeInput(
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

  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // 사용자 ID 조회
    const request = new sql.Request(transaction);
    const userResult = await request
      .input("username", sql.NVarChar, DEFAULT_USER)
      .query("SELECT id FROM users WHERE username = @username");

    const userId = userResult.recordset[0]?.id;
    if (!userId) {
      await transaction.rollback();
      return res.status(404).json({
        error: "사용자를 찾을 수 없습니다.",
        code: "USER_NOT_FOUND",
      });
    }

    // 거래 금액 계산
    const { finalPrice, finalQuantity, totalAmount } = calculateTradeAmounts(
      market,
      side,
      type,
      validation.normalizedPrice,
      validation.normalizedQuantity
    );

    // 거래 처리
    await processTradeTransaction(
      transaction,
      userId,
      market,
      side,
      finalPrice,
      finalQuantity,
      totalAmount,
      type
    );

    await transaction.commit();

    console.log(
      `✅ 주문 성공: ${market} ${side} ${type} - 가격: ${finalPrice.toLocaleString()}, 수량: ${finalQuantity}, 총액: ${totalAmount.toLocaleString()}`
    );

    res.status(200).json({
      message: "주문이 성공적으로 접수되었습니다.",
      orderDetails: {
        market,
        side,
        type,
        price: finalPrice,
        quantity: finalQuantity,
        totalAmount,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("❌ 주문 처리 중 오류 발생:", error.message);

    res.status(500).json({
      error: error.message || "주문 처리 중 서버 오류가 발생했습니다.",
      code: "TRADE_PROCESSING_ERROR",
    });
  }
});

/**
 * 캔들 데이터 API 엔드포인트
 */
app.get("/api/candles", async (req, res) => {
  const { unit, market } = req.query;

  if (!unit || !market) {
    return res.status(400).json({
      error: "unit과 market 파라미터가 필요합니다.",
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
      timeout: 10000, // 10초 타임아웃
    });

    res.json(response.data);
  } catch (error) {
    console.error("❌ 캔들 데이터 요청 오류:", error.message);
    res.status(500).json({
      error: "캔들 데이터를 가져오는 데 실패했습니다.",
      code: "CANDLE_DATA_ERROR",
    });
  }
});

/**
 * 거래 내역 조회 API (추가)
 */
app.get("/api/transactions", async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;

  try {
    const request = new sql.Request(pool);
    const userResult = await request
      .input("username", sql.NVarChar, DEFAULT_USER)
      .query("SELECT id FROM users WHERE username = @username");

    const userId = userResult.recordset[0]?.id;
    if (!userId) {
      return res.status(404).json({
        error: "사용자를 찾을 수 없습니다.",
        code: "USER_NOT_FOUND",
      });
    }

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

    res.json(result.recordset);
  } catch (error) {
    console.error("❌ 거래 내역 조회 오류:", error);
    res.status(500).json({
      error: "거래 내역 조회에 실패했습니다.",
      code: "TRANSACTION_HISTORY_ERROR",
    });
  }
});

/**
 * 클라이언트 웹소켓 연결 처리
 */
wss.on("connection", (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  console.log(`🔗 클라이언트 연결됨 (IP: ${clientIP})`);

  // 연결 시 현재 시장가 전송
  if (Object.keys(currentMarketPrices).length > 0) {
    ws.send(
      JSON.stringify({
        type: "initial_prices",
        data: currentMarketPrices,
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

/**
 * 서버 종료 시 정리 작업
 */
process.on("SIGINT", async () => {
  console.log("\n🛑 서버 종료 중...");

  try {
    if (upbitWs) {
      upbitWs.close();
    }

    if (pool) {
      await pool.close();
      console.log("✅ 데이터베이스 연결이 정상적으로 종료되었습니다.");
    }

    server.close(() => {
      console.log("✅ 서버가 정상적으로 종료되었습니다.");
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ 서버 종료 중 오류:", error);
    process.exit(1);
  }
});

/**
 * 서버 시작
 */
async function startServer() {
  try {
    await connectToDatabase();
    connectToUpbitWebSocket();

    server.listen(PORT, () => {
      console.log(`🚀 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
      console.log(`📊 지원 마켓: ${MARKET_CODES.join(", ")}`);
    });
  } catch (error) {
    console.error("❌ 서버 시작 실패:", error);
    process.exit(1);
  }
}

// 예외 처리
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

// 서버 시작
startServer();
