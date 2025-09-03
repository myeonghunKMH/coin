// src/managers/database-manager.js (Enhanced with Order Matching)
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

  /**
   * 특정 마켓의 모든 대기 주문 조회 (체결 엔진용)
   */
  async getMarketPendingOrders(market) {
    const request = new sql.Request(this.pool);
    const result = await request.input("market", sql.VarChar(20), market)
      .query(`
        SELECT id, user_id, market, side, order_type, price, quantity, 
               remaining_quantity, total_amount, status, created_at
        FROM pending_orders 
        WHERE market = @market AND status = 'pending' AND remaining_quantity > 0
        ORDER BY 
          CASE WHEN side = 'bid' THEN price END DESC,  -- 매수는 높은 가격부터
          CASE WHEN side = 'ask' THEN price END ASC,   -- 매도는 낮은 가격부터
          created_at ASC  -- 같은 가격이면 먼저 들어온 순서대로
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

    console.log(
      `📝 지정가 주문 등록: ${market} ${side} ${KRWUtils.toInteger(
        price
      ).toLocaleString()}원 ${quantity}개`
    );

    return {
      orderId: result.recordset[0].id,
      status: "pending",
      message: "지정가 주문이 등록되었습니다.",
    };
  }

  async cancelPendingOrder(userId, orderId) {
    const transaction = new sql.Transaction(this.pool);

    try {
      await transaction.begin();
      const request = new sql.Request(transaction);

      // 주문 정보 조회
      const orderResult = await request
        .input("orderId", sql.Int, orderId)
        .input("userId", sql.Int, userId).query(`
          SELECT market, side, price, remaining_quantity, total_amount, status
          FROM pending_orders 
          WHERE id = @orderId AND user_id = @userId AND status = 'pending'
        `);

      if (orderResult.recordset.length === 0) {
        throw new Error("취소할 수 있는 주문을 찾을 수 없습니다.");
      }

      const order = orderResult.recordset[0];

      // 주문 상태를 취소로 변경
      await request.query(`
        UPDATE pending_orders 
        SET status = 'cancelled', updated_at = GETDATE()
        WHERE id = @orderId AND user_id = @userId AND status = 'pending'
      `);

      // 매수 주문 취소시 KRW 잔고 복구
      if (order.side === "bid") {
        const refundAmount = KRWUtils.calculateTotal(
          order.price,
          order.remaining_quantity
        );

        await request.input("refundAmount", sql.Decimal(18, 0), refundAmount)
          .query(`
            UPDATE users 
            SET krw_balance = krw_balance + @refundAmount
            WHERE id = @userId
          `);

        console.log(
          `💰 매수 주문 취소 - KRW 잔고 복구: ${refundAmount.toLocaleString()}원`
        );
      }
      // 매도 주문 취소시 코인 잔고 복구
      else if (order.side === "ask") {
        const coinName = order.market.split("-")[1].toLowerCase();

        await request.input(
          "coinQuantity",
          sql.Decimal(18, 8),
          order.remaining_quantity
        ).query(`
            UPDATE users 
            SET ${coinName}_balance = ${coinName}_balance + @coinQuantity
            WHERE id = @userId
          `);

        console.log(
          `🪙 매도 주문 취소 - ${coinName.toUpperCase()} 잔고 복구: ${
            order.remaining_quantity
          }개`
        );
      }

      await transaction.commit();
      console.log(`❌ 주문 취소 완료: ID ${orderId}`);

      return { message: "주문이 성공적으로 취소되었습니다." };
    } catch (error) {
      await transaction.rollback();
      console.error("주문 취소 처리 오류:", error);
      throw error;
    }
  }

  /**
   * 주문 체결 트랜잭션 처리 (체결 엔진용)
   */
  async executeOrderFillTransaction(
    userId,
    orderId,
    market,
    side,
    executionPrice,
    executedQuantity,
    totalAmount,
    remainingQuantity
  ) {
    const transaction = new sql.Transaction(this.pool);

    try {
      await transaction.begin();
      const request = new sql.Request(transaction);

      // 파라미터 설정
      request.input("userId", sql.Int, userId);
      request.input("orderId", sql.Int, orderId);
      request.input("market", sql.VarChar(20), market);
      request.input("side", sql.NVarChar, side);
      request.input(
        "executionPrice",
        sql.Decimal(18, 0),
        KRWUtils.toInteger(executionPrice)
      );
      request.input("executedQuantity", sql.Decimal(18, 8), executedQuantity);
      request.input(
        "totalAmount",
        sql.Decimal(18, 0),
        KRWUtils.toInteger(totalAmount)
      );
      request.input("remainingQuantity", sql.Decimal(18, 8), remainingQuantity);

      const coinName = market.split("-")[1].toLowerCase();

      // 잔고 업데이트
      if (side === "bid") {
        // 매수 체결: 코인 잔고 증가
        await request.input("coinName", sql.NVarChar, `${coinName}_balance`)
          .query(`
            UPDATE users 
            SET ${coinName}_balance = ${coinName}_balance + @executedQuantity
            WHERE id = @userId
          `);
      } else {
        // 매도 체결: KRW 잔고 증가
        await request.query(`
          UPDATE users 
          SET krw_balance = krw_balance + @totalAmount
          WHERE id = @userId
        `);
      }

      // 거래 내역 기록
      await request.query(`
        INSERT INTO transactions (user_id, market, side, price, quantity, total_amount, type) 
        VALUES (@userId, @market, @side, @executionPrice, @executedQuantity, @totalAmount, 'limit')
      `);

      // 대기 주문 상태 업데이트
      const newStatus = remainingQuantity <= 0 ? "filled" : "partial";

      await request.input("newStatus", sql.NVarChar, newStatus).query(`
          UPDATE pending_orders 
          SET remaining_quantity = @remainingQuantity,
              status = @newStatus,
              updated_at = GETDATE()
          WHERE id = @orderId
        `);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
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
