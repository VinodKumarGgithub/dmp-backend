module.exports = {
    DEFAULT_TIMEZONE: 'UTC',
    TENANT_HEADER: 'x-tenant-id',
    STATUS: {
      ACTIVE: "ACTIVE",
      INACTIVE: "INACTIVE",
      PENDING: "PENDING",
      FAILED: "FAILED"
    },
    ERRORS: {
      DUPLICATE_TX: "Duplicate transaction detected",
      INVALID_INPUT: "Invalid request payload",
      TENANT_NOT_FOUND: "Tenant DB not found"
    },
    DB_POOL: {
        MIN: 10,
        MAX: 100,
        ACQUIRE: 30000,
        IDLE: 10000,
    },
    REDIS: {
        URL: process.env.REDIS_URL || 'redis://localhost:6379',
    },
    RATE_LIMIT: {
        WINDOW: 60000,      // 1 minute
        MAX_QUERIES: 30,    // per window
    }
  };
  


