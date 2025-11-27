const { getTenantId, getTenantSequelize } = require('../config/tenantDbManager');
const { initModels } = require('../models');
const { isSuperAdmin } = require('./roleMiddleware');
const { fromCode } = require('../utils/errors');

async function tenantResolver(req, res, next) {
  try {
    const tenantId = await getTenantId(req);
    const sequelize = await getTenantSequelize(tenantId);
    const models = await initModels(sequelize);
    
    // Fetch tenant to get organization_id
    const Tenant = require('../models/Tenant');
    const tenant = await Tenant.findByPk(tenantId);
    
    if (!tenant) {
      return next(fromCode('TENANT_NOT_FOUND', ['The specified tenant was not found']));
    }
    
    const organizationId = tenant.organization_id || null;
    
    // For SUPER_ADMIN, allow access to any organization
    // For others, verify organization access
    if (!isSuperAdmin(req.user) && req.user?.organization_id && organizationId) {
      if (req.user.organization_id !== organizationId) {
        return next(fromCode('FORBIDDEN', ['You do not have access to this organization']));
      }
    }
    
    req.db = { sequelize, models, tenantId, organizationId };
    next();
  } catch (err) {
    err.status = err.status || 400;
    next(err);
  }
}

module.exports = { tenantResolver };


