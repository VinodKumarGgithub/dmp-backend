const { masterSequelize } = require('./db');
const { logger } = require('./logger');

const { AdminUser } = require('../models/AdminUser');
const { Tenant } = require('../models/Tenant');
const { PageConfig } = require('../models/PageConfig');
const { QueryAuditLog } = require('../models/QueryAuditLog');
const { UserPagePermission } = require('../models/UserPagePermission');
const { UserPreference } = require('../models/UserPreference');
const { UserTenantPermission } = require('../models/UserTenantPermission');
const { UserPagePreference } = require('../models/UserPagePreference');

async function testMasterDbConnection() {
  try {
    await masterSequelize.authenticate();
    // await masterSequelize.sync({ alter: true });
    logger.info('✅ Master DB connection established successfully.');
  } catch (err) {
    console.error(err)
    logger.error('❌ Unable to connect to the Master DB:', err.message);
    process.exit(1); // stop app if DB not reachable
  }
}

module.exports = { testMasterDbConnection };