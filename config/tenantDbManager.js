const { createSequelize } = require('./db');
const { TENANT_HEADER } = require('./constants');
const Tenant = require('../models/Tenant');
const { logger } = require('./logger');
const { fromCode } = require('../utils/errors');

const tenantCache = new Map();

function getTenantId(req) {
  return req.headers[TENANT_HEADER] || req.query.tenant || req.params.tenant;
}

async function getTenantSequelize(tenantId) {
  if (!tenantId) throw new Error('Tenant id missing');
  if (tenantCache.has(tenantId)) return tenantCache.get(tenantId);

  // Fetch credentials from master DB (password is automatically decrypted by model hook)
  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) {
    throw fromCode('TENANT_NOT_FOUND');
  }

  // Check tenant status - only ACTIVE tenants can connect
  if (tenant.status === 'INACTIVE') {
    throw fromCode('TENANT_INACTIVE', [`Tenant ${tenantId} is INACTIVE`]);
  }
  
  if (tenant.status === 'SUSPENDED') {
    throw fromCode('TENANT_SUSPENDED', [`Tenant ${tenantId} is SUSPENDED`]);
  }
  
  if (tenant.status !== 'ACTIVE') {
    throw fromCode('TENANT_DB_NOT_AVAILABLE', [`Tenant ${tenantId} status is ${tenant.status}`]);
  }

  // Password is automatically decrypted by Tenant model hook
  // URL encode password and username to handle special characters
  const encodedPassword = encodeURIComponent(tenant.db_password);
  const encodedUser = encodeURIComponent(tenant.db_user);
  const url = `${tenant.dialect}://${encodedUser}:${encodedPassword}@${tenant.db_host}:${tenant.db_port}/${tenant.db_name}`;
  const sequelize = createSequelize(url);
  
  try {
    await sequelize.authenticate();
    logger.info(`Connection established for Tenant ${tenantId}`);
  } catch (error) {
    throw fromCode('DB_CONNECTION_FAILED', [`Unable to connect to tenant ${tenantId}: ${error.message}`]);
  }

  // Security: Clear password from tenant object after use (don't keep in memory)
  // Note: This doesn't affect the database record, only the in-memory object
  if (tenant.dataValues) {
    tenant.dataValues.db_password = '[REDACTED]';
  }
  tenant.db_password = '[REDACTED]';

  tenantCache.set(tenantId, sequelize);
  return sequelize;
}


module.exports = { getTenantId, getTenantSequelize };


