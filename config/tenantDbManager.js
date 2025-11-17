const { createSequelize } = require('./db');
const { TENANT_HEADER } = require('./constants');
const Tenant = require('../models/Tenant');
const { logger } = require('./logger');

const tenantCache = new Map();

function getTenantId(req) {
  return req.headers[TENANT_HEADER] || req.query.tenant || req.params.tenant;
}

async function getTenantSequelize(tenantId) {
  if (!tenantId) throw new Error('Tenant id missing');
  if (tenantCache.has(tenantId)) return tenantCache.get(tenantId);

  // fetch credentials from master DB
  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) throw new Error('Tenant not found');

  const url = `${tenant.dialect}://${tenant.db_user}:${tenant.db_password}@${tenant.db_host}:${tenant.db_port}/${tenant.db_name}`;
  const sequelize = createSequelize(url);
  
    try {
      await sequelize.authenticate()
      logger.info(`Connestion establised for Tenant ${tenantId}`)
    } catch (error) {
      throw new Error(`Unable to Connect tenant : ${tenantId}.`)
    }

  tenantCache.set(tenantId, sequelize);
  return sequelize;
}


module.exports = { getTenantId, getTenantSequelize };


