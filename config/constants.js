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
        MIN: 1,
        MAX: 10,
        ACQUIRE: 30000,
        IDLE:10000,
    }
  };
  


