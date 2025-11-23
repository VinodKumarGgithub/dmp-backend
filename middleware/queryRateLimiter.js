const { fromCode } = require('../utils/errors');

/**
 * Rate limiter for query execution
 * Prevents abuse by limiting the number of queries per user/IP
 */

// In-memory store for rate limiting (in production, use Redis)
const queryCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_QUERIES_PER_WINDOW = 30; // 30 queries per minute per user/IP

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
 */
function checkRateLimit(key) {
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
function queryRateLimiter(req, res, next) {
  // Only apply to query/data endpoints
  if (!req.path.includes('/pages/') || (!req.path.includes('/data') && !req.path.includes('/test-query'))) {
    return next();
  }

  const key = getRateLimitKey(req);
  const limitCheck = checkRateLimit(key);

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

