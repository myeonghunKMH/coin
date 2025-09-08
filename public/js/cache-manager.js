// public/js/cache-manager.js
export class CacheManager {
  constructor() {
    this.cacheTimeout = 60000; // 1분
    this.cache = new Map();
    this.maxSize = 50; // 최대 캐시 크기 증가
    this.maxAge = 300000; // 5분
    // 🔧 주기적 캐시 정리 (10분마다)
    setInterval(() => {
      this.cleanupCache();
    }, 600000);
  }

  getCacheKey(market, unit, to = null) {
    if (to) {
      return `${market}-${unit}-${to}`;
    }
    return `${market}-${unit}`;
  }

  get(market, unit, to = null) {
    // to 파라미터 추가
    const key = this.getCacheKey(market, unit, to);
    const cached = this.cache.get(key);

    if (cached && this.isValid(cached, to)) {
      return cached.data;
    }

    this.cache.delete(key); // Cache → cache (소문자)
    return null;
  }

  set(market, unit, data, to = null) {
    const key = this.getCacheKey(market, unit, to);
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  isValid(cached, to = null) {
    // to 파라미터 추가
    const now = Date.now();
    const age = now - cached.timestamp;
    const maxAge = to ? this.maxAge : this.cacheTimeout;
    return age < maxAge;
  }

  clear() {
    this.cache.clear();
  }

  // 🔧 히스토리 캐시 정리 메서드 추가
  cleanupCache() {
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
