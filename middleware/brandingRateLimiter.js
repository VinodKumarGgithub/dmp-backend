const { fromCode } = require('../utils/errors');

/**
 * Rate limiter for public branding endpoint
 * Prevents abuse by limiting requests per IP
 */

// In-memory store for rate limiting (in production, use Redis)
const brandingCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60; // 60 requests per minute per IP

/**
 * Check if rate limit is exceeded
 */
function checkRateLimit(key) {
  const now = Date.now();
  const userRequests = brandingCounts.get(key) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
  
  // Reset if window expired
  if (now > userRequests.resetTime) {
    userRequests.count = 0;
    userRequests.resetTime = now + RATE_LIMIT_WINDOW;
  }
  
  // Check limit
  if (userRequests.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: userRequests.resetTime
    };
  }
  
  // Increment count
  userRequests.count++;
  brandingCounts.set(key, userRequests);
  
  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_WINDOW - userRequests.count,
    resetTime: userRequests.resetTime
  };
}

/**
 * Rate limiter middleware for branding endpoints
 */
function brandingRateLimiter(req, res, next) {
  // Only apply to branding endpoints
  if (!req.path.includes('/organizations/') || !req.path.includes('/branding')) {
    return next();
  }
  
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const key = `branding:${ip}`;
  
  const limitCheck = checkRateLimit(key);
  
  if (!limitCheck.allowed) {
    const resetSeconds = Math.ceil((limitCheck.resetTime - Date.now()) / 1000);
    return next(fromCode('RATE_LIMIT_EXCEEDED', [
      `Rate limit exceeded. Please try again in ${resetSeconds} seconds.`
    ]));
  }
  
  // Add rate limit headers
  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS_PER_WINDOW);
  res.setHeader('X-RateLimit-Remaining', limitCheck.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(limitCheck.resetTime / 1000));
  
  next();
}

/**
 * Clean up old entries periodically (prevent memory leak)
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of brandingCounts.entries()) {
    if (now > value.resetTime) {
      brandingCounts.delete(key);
    }
  }
}, RATE_LIMIT_WINDOW * 2); // Clean up every 2 windows

module.exports = { brandingRateLimiter };

