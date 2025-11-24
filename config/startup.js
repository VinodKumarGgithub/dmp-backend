const { masterSequelize } = require('./db');
const { logger } = require('./logger');

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