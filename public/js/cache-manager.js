// public/js/cache-manager.js
export class CacheManager {
  constructor() {
    this.candleCache = new Map();
    this.cacheTimeout = 60000; // 1분
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
}
