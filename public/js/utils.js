// utils.js
import { PRICE_STEPS } from "./constants.js";

export class Utils {
  static formatKRW(amount) {
    return Math.floor(Number(amount) || 0).toLocaleString("ko-KR");
  }

  static formatCoinAmount(amount, decimals = 8) {
    return Number(amount || 0).toFixed(decimals);
  }

  static formatPercent(rate) {
    return (Number(rate || 0) * 100).toFixed(2);
  }

  static parseNumber(value) {
    return Number(String(value).replace(/,/g, "")) || 0;
  }

  static getPriceStep(price) {
    for (const { min, step } of PRICE_STEPS) {
      if (price >= min) return step;
    }
    return 0.1;
  }

  static calculateTotal(price, quantity) {
    const total = this.parseNumber(price) * this.parseNumber(quantity);
    return Math.floor(total);
  }

  static formatDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}
