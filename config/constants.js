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
        MIN: 5,              // Reduced from 10 (lower memory per instance)
        MAX: 20,             // Reduced from 100 (per PM2 instance, not per tenant)
        ACQUIRE: 10000,      // Reduced from 30000 (faster timeout)
        IDLE: 5000,          // Reduced from 10000 (faster cleanup)
        EVICT: 1000,         // Connection eviction check interval (ms)
    },
    REDIS: {
        URL: process.env.REDIS_URL || 'redis://localhost:6379',
        CLUSTER: process.env.REDIS_CLUSTER === 'true',
        NODES: process.env.REDIS_NODES ? JSON.parse(process.env.REDIS_NODES) : null,
        PASSWORD: process.env.REDIS_PASSWORD || null,
    },
    CACHE: {
        TENANT_CONFIG_TTL: 3600,        // 1 hour (seconds)
        TENANT_STATUS_TTL: 7200,        // 2 hours (seconds)
        PAGE_CONFIG_TTL: 3600,          // 1 hour (seconds)
        PAGE_DATA_TTL: 300,             // 5 minutes (seconds)
        METADATA_TTL: 1800,             // 30 minutes (seconds)
        QUERY_RESULT_TTL: 300,          // 5 minutes (seconds)
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
  


