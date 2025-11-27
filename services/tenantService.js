const { Joi, validate } = require('../utils/validationUtils');
const { generateId } = require('../utils/idGenerator');
const { fromCode } = require('../utils/errors');
const { mapDbError } = require('../utils/dbErrorMapper');

const tenantService = {
  // Create new tenant
  async createTenant(masterDb, payload) {
    const schema = Joi.object({
      id: Joi.string().required(),
      organization_id: Joi.string().required(),
      name: Joi.string().required().min(2).max(100),
      dialect: Joi.string().valid('mysql', 'mssql').default('mysql'),
      db_host: Joi.string().required().hostname(),
      db_port: Joi.number().integer().min(1).max(65535).default(3306),
      db_user: Joi.string().required().min(1).max(50),
      db_password: Joi.string().required().min(1),
      db_name: Joi.string().required().min(1).max(100),
      status: Joi.string().valid('ACTIVE', 'INACTIVE', 'SUSPENDED').default('ACTIVE'),
      description: Joi.string().max(500).allow('', null)
    });

    const data = validate(schema, payload);
    
    // Add timestamps
    data.created_at = new Date();
    data.updated_at = new Date();

    // Start transaction
    const txn = await masterDb.transaction();
    
    try {
      const tenant = await masterDb.models.tenant.create(data, { transaction: txn });
      await txn.commit();
      return tenant;
    } catch (error) {
      await txn.rollback();
      throw mapDbError(error);
    }
  },

  // Get all tenants with optional filtering
  async listTenants(masterDb, filters = {}) {
    const whereClause = {};
    
    if (filters.status) {
      whereClause.status = filters.status;
    }
    
    if (filters.organization_id) {
      whereClause.organization_id = filters.organization_id;
    }
    
    if (filters.search) {
      whereClause[masterDb.Sequelize.Op.or] = [
        { id: { [masterDb.Sequelize.Op.like]: `%${filters.search}%` } },
        { name: { [masterDb.Sequelize.Op.like]: `%${filters.search}%` } }
      ];
    }

    return await masterDb.models.tenant.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      attributes: { exclude: ['db_password'] } // Don't return passwords in list
    });
  },

  // Get tenant by ID
  async getTenantById(masterDb, tenantId) {
    const tenant = await masterDb.models.tenant.findByPk(tenantId);
    if (!tenant) {
      throw fromCode('TENANT_NOT_FOUND');
    }
    return tenant;
  },

  // Update tenant
  async updateTenant(masterDb, tenantId, payload) {
    const schema = Joi.object({
      name: Joi.string().min(2).max(100),
      dialect: Joi.string().valid('mysql', 'mssql'),
      db_host: Joi.string().hostname(),
      db_port: Joi.number().integer().min(1).max(65535),
      db_user: Joi.string().min(1).max(50),
      db_password: Joi.string().min(1),
      db_name: Joi.string().min(1).max(100),
      status: Joi.string().valid('ACTIVE', 'INACTIVE', 'SUSPENDED'),
      description: Joi.string().max(500).allow('', null)
    });

    const data = validate(schema, payload);
    data.updated_at = new Date();

    // Start transaction
    const txn = await masterDb.transaction();
    
    try {
      const tenant = await masterDb.models.tenant.findByPk(tenantId);
      if (!tenant) {
        throw fromCode('TENANT_NOT_FOUND');
      }

      const updatedTenant = await tenant.update(data, { transaction: txn });
      await txn.commit();
      return updatedTenant;
    } catch (error) {
      await txn.rollback();
      throw error;
    }
  },

  // Delete tenant
  async deleteTenant(masterDb, tenantId) {
    // Start transaction
    const txn = await masterDb.transaction();
    
    try {
      const tenant = await masterDb.models.tenant.findByPk(tenantId);
      if (!tenant) {
        throw fromCode('TENANT_NOT_FOUND');
      }

      await tenant.destroy({ transaction: txn });
      await txn.commit();
      return { message: 'Tenant deleted successfully' };
    } catch (error) {
      await txn.rollback();
      throw error;
    }
  },

  // Test tenant database connection
  async testTenantConnection(masterDb, tenantId) {
    const tenant = await this.getTenantById(masterDb, tenantId);
    
    try {
      const { createSequelize } = require('../config/db');
      const connectionString = `${tenant.dialect}://${tenant.db_user}:${tenant.db_password}@${tenant.db_host}:${tenant.db_port}/${tenant.db_name}`;
      
      const testDb = createSequelize(connectionString);
      await testDb.authenticate();
      await testDb.close();
      
      return { 
        success: true, 
        message: 'Database connection successful',
        tenant: tenant.id
      };
    } catch (error) {
      return { 
        success: false, 
        message: 'Database connection failed',
        error: error.message,
        tenant: tenant.id
      };
    }
  },

  // Bulk create tenants
  async bulkCreateTenants(masterDb, tenantsArray) {
    const txn = await masterDb.transaction();
    
    try {
      const results = [];
      
      for (const tenantData of tenantsArray) {
        const tenant = await this.createTenant(masterDb, tenantData);
        results.push(tenant);
      }
      
      await txn.commit();
      return results;
    } catch (error) {
      await txn.rollback();
      throw error;
    }
  }
};

module.exports = { tenantService };

