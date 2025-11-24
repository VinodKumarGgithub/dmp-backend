const { masterSequelize } = require('./db');
const { logger } = require('./logger');
const { initRedis } = require('./redis');

async function testMasterDbConnection() {
  try {
    await masterSequelize.authenticate();
    await masterSequelize.sync({ alter: true });
    logger.info('✅ Master DB connection established successfully.');
  } catch (err) {
    logger.error('❌ Unable to connect to the Master DB:', err.message);
    process.exit(1);
  }
}

async function initServices() {
  await testMasterDbConnection();
  await initRedis();
}

module.exports = { testMasterDbConnection, initServices };
