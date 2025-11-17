const { getTenantId, getTenantSequelize } = require('../config/tenantDbManager');
const { initModels } = require('../models');

async function tenantResolver(req, res, next) {
  try {
    const tenantId = await getTenantId(req);
    const sequelize =await getTenantSequelize(tenantId);
    const models = await initModels(sequelize);
    req.db = { sequelize, models, tenantId };
    next();
  } catch (err) {
    err.status = err.status || 400;
    next(err);
  }
}

module.exports = { tenantResolver };


