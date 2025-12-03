const { Sequelize } = require('sequelize');
const { logger } = require('./logger');
const { DB_POOL } = require('./constants');

function createSequelize(url) {
  // Security: Only disable SSL certificate validation in development
  // In production, SSL certificates must be properly validated
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  const sequelize = new Sequelize(url, {
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        // Only allow self-signed certificates in development
        // Production must use valid SSL certificates
        rejectUnauthorized: !isDevelopment
      },
      // Connection pool optimizations
      connectTimeout: 10000, // 10 seconds
    },
    // Query timeout at Sequelize level (not in dialectOptions)
    query: {
      timeout: 30000, // 30 seconds
    },
    pool: { 
      max: DB_POOL.MAX, 
      min: DB_POOL.MIN, 
      acquire: DB_POOL.ACQUIRE, 
      idle: DB_POOL.IDLE,
      evict: DB_POOL.EVICT, // Check for idle connections every 1 second
    },
    // Retry configuration
    retry: {
      max: 3,
      match: [
        /ETIMEDOUT/,
        /EHOSTUNREACH/,
        /ECONNRESET/,
        /ECONNREFUSED/,
        /ETIMEDOUT/,
        /ESOCKETTIMEDOUT/,
        /EHOSTUNREACH/,
        /EPIPE/,
        /EAI_AGAIN/,
        /SequelizeConnectionError/,
        /SequelizeConnectionRefusedError/,
        /SequelizeHostNotFoundError/,
        /SequelizeHostNotReachableError/,
        /SequelizeInvalidConnectionError/,
        /SequelizeConnectionTimedOutError/
      ]
    },
    // Transaction isolation
    transactionType: 'IMMEDIATE',
    isolationLevel: 'READ COMMITTED',
  });
  
  // Connection pool monitoring (optional - can be enabled for debugging)
  // Note: Pool events are not directly exposed by Sequelize, so monitoring
  // would need to be done at a different level if needed
  
  return sequelize;
}

const masterSequelize = createSequelize(process.env.MASTER_DB_URL);

// Master DB read replica (if configured)
const masterSequelizeRead = process.env.MASTER_DB_READ_REPLICA_URL 
  ? createSequelize(process.env.MASTER_DB_READ_REPLICA_URL)
  : masterSequelize;

module.exports = { 
  createSequelize, 
  masterSequelize,
  masterSequelizeRead // Export read replica for tenant lookups
};


