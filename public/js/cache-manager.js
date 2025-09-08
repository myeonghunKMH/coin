// public/js/cache-manager.js
export class CacheManager {
  constructor() {
    this.candleCache = new Map();
    this.cacheTimeout = 60000; // 1분
    this.cache = new Map();
    this.maxSize = 50; // 최대 캐시 크기 증가
    this.maxAge = 300000; // 5분
    // 🔧 주기적 캐시 정리 (10분마다)
    setInterval(() => {
      this.cleanupHistoryCache();
    }, 600000);
  }

  getCacheKey(market, unit) {
    return `${market}-${unit}`;
  }

  get(market, unit) {
    const key = this.getCacheKey(market, unit);
    const cached = this.candleCache.get(key);

    if (cached && this.isValid(cached)) {
      return cached.data;
    }

    this.candleCache.delete(key);
    return null;
  }

  set(market, unit, data) {
    const key = this.getCacheKey(market, unit);
    this.candleCache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  isValid(cached) {
    return Date.now() - cached.timestamp < this.cacheTimeout;
  }

  clear() {
    this.candleCache.clear();
  }

  // 🔧 히스토리 캐시 정리 메서드 추가
  cleanupHistoryCache() {
    const now = Date.now();
    const keysToDelete = [];

    for (const [key, item] of this.cache.entries()) {
      // 히스토리 캐시 (to 파라미터 포함)는 더 오래 보관
      const isHistoryCache = key.includes("-2025-") || key.includes("T");
      const maxAge = isHistoryCache ? 900000 : this.maxAge; // 히스토리는 15분

      if (now - item.timestamp > maxAge) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.cache.delete(key));

    if (keysToDelete.length > 0) {
      console.log(`🧹 캐시 정리: ${keysToDelete.length}개 항목 삭제`);
    }
  }

  // 🔧 캐시 통계 조회
  getStats() {
    const now = Date.now();
    let currentDataCount = 0;
    let historyDataCount = 0;

    for (const [key, item] of this.cache.entries()) {
      if (key.includes("-2025-") || key.includes("T")) {
        historyDataCount++;
      } else {
        currentDataCount++;
      }
    }

    return {
      totalItems: this.cache.size,
      currentData: currentDataCount,
      historyData: historyDataCount,
      maxSize: this.maxSize,
    };
  }
}
