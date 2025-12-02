const { getRedisClient } = require('../config/redis');
const { logger } = require('../config/logger');

// In-memory fallback cache (when Redis unavailable)
const memoryCache = new Map();

/**
 * Generic cache service with Redis backend and in-memory fallback
 */
const cacheService = {
  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} Cached value or null
   */
  async get(key) {
    const redis = getRedisClient();
    
    // Try Redis first
    if (redis) {
      try {
        const value = await redis.get(key);
        if (value !== null) {
          return JSON.parse(value);
        }
      } catch (error) {
        logger.warn(`Redis cache get failed for key ${key}:`, error.message);
      }
    }
    
    // Fallback to in-memory cache
    if (memoryCache.has(key)) {
      const cached = memoryCache.get(key);
      // Check if expired
      if (cached.expiresAt && Date.now() > cached.expiresAt) {
        memoryCache.delete(key);
        return null;
      }
      return cached.value;
    }
    
    return null;
  },

  /**
   * Set value in cache with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttlSeconds - Time to live in seconds
   * @returns {Promise<boolean>} Success status
   */
  async set(key, value, ttlSeconds = 300) {
    const redis = getRedisClient();
    const serialized = JSON.stringify(value);
    
    // Try Redis first
    if (redis) {
      try {
        await redis.setex(key, ttlSeconds, serialized);
        return true;
      } catch (error) {
        logger.warn(`Redis cache set failed for key ${key}:`, error.message);
      }
    }
    
    // Fallback to in-memory cache
    memoryCache.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds * 1000)
    });
    
    // Clean up expired entries periodically
    if (memoryCache.size > 10000) {
      this._cleanupMemoryCache();
    }
    
    return true;
  },

  /**
   * Delete value from cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} Success status
   */
  async del(key) {
    const redis = getRedisClient();
    
    // Delete from Redis
    if (redis) {
      try {
        await redis.del(key);
      } catch (error) {
        logger.warn(`Redis cache delete failed for key ${key}:`, error.message);
      }
    }
    
    // Delete from in-memory cache
    memoryCache.delete(key);
    
    return true;
  },

  /**
   * Delete multiple keys matching a pattern
   * @param {string} pattern - Redis key pattern (e.g., 'page:*')
   * @returns {Promise<number>} Number of keys deleted
   */
  async delPattern(pattern) {
    const redis = getRedisClient();
    let deletedCount = 0;
    
    // Delete from Redis using pattern
    if (redis) {
      try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
          deletedCount = keys.length;
        }
      } catch (error) {
        logger.warn(`Redis cache pattern delete failed for pattern ${pattern}:`, error.message);
      }
    }
    
    // Delete from in-memory cache
    for (const key of memoryCache.keys()) {
      if (this._matchPattern(key, pattern)) {
        memoryCache.delete(key);
        deletedCount++;
      }
    }
    
    return deletedCount;
  },

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} True if exists
   */
  async exists(key) {
    const redis = getRedisClient();
    
    // Check Redis
    if (redis) {
      try {
        const exists = await redis.exists(key);
        return exists === 1;
      } catch (error) {
        logger.warn(`Redis cache exists check failed for key ${key}:`, error.message);
      }
    }
    
    // Check in-memory cache
    if (memoryCache.has(key)) {
      const cached = memoryCache.get(key);
      // Check if expired
      if (cached.expiresAt && Date.now() > cached.expiresAt) {
        memoryCache.delete(key);
        return false;
      }
      return true;
    }
    
    return false;
  },

  /**
   * Get TTL for a key
   * @param {string} key - Cache key
   * @returns {Promise<number>} TTL in seconds, -1 if no expiry, -2 if key doesn't exist
   */
  async ttl(key) {
    const redis = getRedisClient();
    
    // Check Redis
    if (redis) {
      try {
        return await redis.ttl(key);
      } catch (error) {
        logger.warn(`Redis cache TTL check failed for key ${key}:`, error.message);
      }
    }
    
    // Check in-memory cache
    if (memoryCache.has(key)) {
      const cached = memoryCache.get(key);
      if (cached.expiresAt) {
        const remaining = Math.ceil((cached.expiresAt - Date.now()) / 1000);
        return remaining > 0 ? remaining : -2; // Expired
      }
      return -1; // No expiry
    }
    
    return -2; // Key doesn't exist
  },

  /**
   * Clean up expired entries from memory cache
   * @private
   */
  _cleanupMemoryCache() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, cached] of memoryCache.entries()) {
      if (cached.expiresAt && now > cached.expiresAt) {
        memoryCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} expired memory cache entries`);
    }
  },

  /**
   * Match key against pattern (simple glob matching)
   * @param {string} key - Cache key
   * @param {string} pattern - Pattern (e.g., 'page:*')
   * @returns {boolean} True if matches
   * @private
   */
  _matchPattern(key, pattern) {
    // Convert Redis pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(key);
  },

  /**
   * Generate cache key with namespace
   * @param {string} namespace - Namespace (e.g., 'page', 'metadata')
   * @param {...string} parts - Key parts
   * @returns {string} Cache key
   */
  key(namespace, ...parts) {
    return `${namespace}:${parts.join(':')}`;
  }
};

// Periodic cleanup of memory cache
setInterval(() => {
  cacheService._cleanupMemoryCache();
}, 60000); // Every minute

module.exports = { cacheService };

