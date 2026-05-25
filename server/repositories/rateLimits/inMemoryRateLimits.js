/** In-process sliding-window rate limits (SQLite / single-node dev). */
export function createInMemoryRateLimits() {
  const store = new Map();

  return {
    async isRateLimited(key, maxAttempts, windowMs, now = Date.now()) {
      const entry = store.get(key);
      if (!entry) return false;
      if (now - entry.windowStart > windowMs) {
        store.delete(key);
        return false;
      }
      return entry.count >= maxAttempts;
    },

    async recordFailedAttempt(key, windowMs, now = Date.now()) {
      const entry = store.get(key);
      if (!entry || now - entry.windowStart > windowMs) {
        store.set(key, { count: 1, windowStart: now });
        return;
      }
      entry.count += 1;
      store.set(key, entry);
    },

    async clear(key) {
      store.delete(key);
    },
  };
}
