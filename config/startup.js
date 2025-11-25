// startup.js
const { masterSequelize } = require('./db');
const { logger } = require('./logger');

// Import all active models to ensure they're registered and tables are created
const { AdminUser } = require('../models/AdminUser');
const { Tenant } = require('../models/Tenant');
const { PageConfig } = require('../models/PageConfig');
const { UserTenantPermission } = require('../models/UserTenantPermission');
const { UserPagePermission } = require('../models/UserPagePermission');
const { QueryAuditLog } = require('../models/QueryAuditLog');

async function testMasterDbConnection() {
  try {
    await masterSequelize.authenticate();
    logger.info('✅ Master DB connection established successfully.');
    
    // Sync all models to create tables if they don't exist
    logger.info('🔄 Syncing database models...');
    await masterSequelize.sync({ alter: true });
    logger.info('✅ All database tables created/updated successfully.');
  } catch (err) {
    console.error(err);
    logger.error('❌ Unable to connect to the Master DB:', err.message);
    process.exit(1); // stop app if DB not reachable
  }
}

module.exports = { testMasterDbConnection };
