// src/config.js
module.exports = {
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
