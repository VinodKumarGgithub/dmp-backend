const { fromCode } = require('../utils/errors');
const { getRedisClient } = require('../config/redis');
const { RATE_LIMIT } = require('../config/constants');

/**
 * Rate limiter for query execution
 * Prevents abuse by limiting the number of queries per user/IP
 */

// Fallback in-memory store (when Redis unavailable)
const queryCounts = new Map();
const RATE_LIMIT_WINDOW = RATE_LIMIT.WINDOW;
const MAX_QUERIES_PER_WINDOW = RATE_LIMIT.MAX_QUERIES;

/**
 * Get rate limit key from request
 */
function getRateLimitKey(req) {
  // Use user ID if available, otherwise use IP address
  const userId = req.user?.id || req.user?.userId;
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  return userId ? `user:${userId}` : `ip:${ip}`;
}

/**
 * Check if rate limit is exceeded
 * Uses Redis for distributed rate limiting, falls back to in-memory
 */
async function checkRateLimit(key) {
  const redis = getRedisClient();
  const redisKey = `ratelimit:${key}`;
  
  // Try Redis first (distributed rate limiting)
  if (redis) {
    try {
      const current = await redis.incr(redisKey);
      
      // Set expiration on first increment
      if (current === 1) {
        await redis.expire(redisKey, Math.ceil(RATE_LIMIT_WINDOW / 1000));
      }
      
      if (current > MAX_QUERIES_PER_WINDOW) {
        const ttl = await redis.ttl(redisKey);
        return {
          allowed: false,
          remaining: 0,
          resetTime: Date.now() + (ttl * 1000)
        };
      }
      
      const ttl = await redis.ttl(redisKey);
      return {
        allowed: true,
        remaining: MAX_QUERIES_PER_WINDOW - current,
        resetTime: Date.now() + (ttl * 1000)
      };
    } catch (error) {
      // Redis failed, fallback to in-memory
      console.warn('Redis rate limit check failed, using in-memory fallback:', error.message);
    }
  }
  
  // Fallback to in-memory rate limiting
  const now = Date.now();
  const userQueries = queryCounts.get(key) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
  
  // Reset if window expired
  if (now > userQueries.resetTime) {
    userQueries.count = 0;
    userQueries.resetTime = now + RATE_LIMIT_WINDOW;
  }
  
  // Check limit
  if (userQueries.count >= MAX_QUERIES_PER_WINDOW) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: userQueries.resetTime
    };
  }
  
  // Increment count
  userQueries.count++;
  queryCounts.set(key, userQueries);
  
  return {
    allowed: true,
    remaining: MAX_QUERIES_PER_WINDOW - userQueries.count,
    resetTime: userQueries.resetTime
  };
}

/**
 * Rate limiter middleware for query endpoints
 */
async function queryRateLimiter(req, res, next) {
  // Only apply to query/data endpoints
  if (!req.path.includes('/pages/') || (!req.path.includes('/data') && !req.path.includes('/test-query'))) {
    return next();
  }

  try {
    const key = getRateLimitKey(req);
    const limitCheck = await checkRateLimit(key);

    if (!limitCheck.allowed) {
      const resetSeconds = Math.ceil((limitCheck.resetTime - Date.now()) / 1000);
      return next(fromCode('RATE_LIMIT_EXCEEDED', [
        `Rate limit exceeded. Maximum ${MAX_QUERIES_PER_WINDOW} queries per minute. Please try again in ${resetSeconds} seconds.`
      ]));
    }

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', MAX_QUERIES_PER_WINDOW);
    res.setHeader('X-RateLimit-Remaining', limitCheck.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(limitCheck.resetTime / 1000));

    next();
  } catch (error) {
    // On error, allow request (fail open)
    console.error('Rate limit check error:', error);
    next();
  }
}

/**
 * Clean up old entries periodically (prevent memory leak)
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of queryCounts.entries()) {
    if (now > value.resetTime) {
      queryCounts.delete(key);
    }
  }
}, RATE_LIMIT_WINDOW * 2); // Clean up every 2 windows

module.exports = {
  queryRateLimiter,
  checkRateLimit,
  getRateLimitKey
};

