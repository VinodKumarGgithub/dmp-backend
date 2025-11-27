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
    },
    BRANDING: {
        CACHE_TTL: parseInt(process.env.BRANDING_CACHE_TTL || '600000', 10), // 10 minutes default (in milliseconds)
    },
    ORGANIZATION: {
        DEFAULT_PRIMARY_COLOR: process.env.ORG_DEFAULT_PRIMARY_COLOR || '#1890ff',
        DEFAULT_APP_NAME: process.env.ORG_DEFAULT_APP_NAME || null,
        ID_GENERATION_MODE: process.env.ORG_ID_GENERATION_MODE || 'slug', // slug|uuid|time
        AUTO_GENERATE_SUBDOMAIN: process.env.ORG_AUTO_GENERATE_SUBDOMAIN === 'true',
    }
  };
  


