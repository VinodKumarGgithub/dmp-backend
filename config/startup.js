const { masterSequelize } = require('./db');
const { logger } = require('./logger');
const { testRedisConnection: testRedis } = require('./redis');

const { AdminUser } = require('../models/AdminUser');
const { Tenant } = require('../models/Tenant');
const { PageConfig } = require('../models/PageConfig');
const { QueryAuditLog } = require('../models/QueryAuditLog');
const { UserPagePermission } = require('../models/UserPagePermission');
const { UserPreference } = require('../models/UserPreference');
const { UserTenantPermission } = require('../models/UserTenantPermission');
const { UserPagePreference } = require('../models/UserPagePreference');
const { Organization } = require('../models/Organization');

async function testMasterDbConnection() {
  try {
    await masterSequelize.authenticate();
    // Ensure Organization model is initialized (for login branding)
    // Note: We don't sync here to avoid altering production tables
    // The table should be created via migration
    logger.info('✅ Master DB connection established successfully.');
  } catch (err) {
    console.error(err)
    logger.error('❌ Unable to connect to the Master DB:', err.message);
    process.exit(1); // stop app if DB not reachable
  }
}

async function testRedisConnection() {
  const result = await testRedis();
  if (result.connected) {
    logger.info('✅ Redis connection successful');
  } else {
    logger.warn(`⚠️  Redis connection failed: ${result.error || 'Unknown error'}`);
    logger.warn('⚠️  Application will continue with in-memory caching (not recommended for production)');
  }
  return result;
}

module.exports = { testMasterDbConnection, testRedisConnection };