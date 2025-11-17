const { Sequelize } = require('sequelize');
const { logger } = require('./logger');
const { DB_POOL } = require('./constants');

function createSequelize(url) {
  const sequelize = new Sequelize(url, {
    logging: false,
    pool: { max: DB_POOL.MAX, min: DB_POOL.MIN, acquire: DB_POOL.ACQUIRE, idle: DB_POOL.IDLE }
  });
  return sequelize;
}

const masterSequelize = createSequelize(process.env.MASTER_DB_URL);

module.exports = { createSequelize, masterSequelize };


