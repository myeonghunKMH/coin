// src/managers/database-manager.js
const sql = require("mssql");
const CONFIG = require("../config");
const KRWUtils = require("../utils/krw-utils");

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

module.exports = DatabaseManager;
