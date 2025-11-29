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
      // Password will be encrypted automatically by Tenant model hook
      const tenant = await masterDb.models.tenant.create(data, { transaction: txn });
      await txn.commit();
      
      // Security: Remove password from response
      const tenantResponse = tenant.toJSON ? tenant.toJSON() : tenant;
      delete tenantResponse.db_password;
      
      return tenantResponse;
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
    
    // Security: Remove password from response
    const tenantResponse = tenant.toJSON ? tenant.toJSON() : tenant;
    delete tenantResponse.db_password;
    
    return tenantResponse;
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

      // Password will be encrypted automatically by Tenant model hook if changed
      const updatedTenant = await tenant.update(data, { transaction: txn });
      await txn.commit();
      
      // Security: Remove password from response
      const tenantResponse = updatedTenant.toJSON ? updatedTenant.toJSON() : updatedTenant;
      delete tenantResponse.db_password;
      
      return tenantResponse;
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
    // Fetch tenant directly to get decrypted password (bypass getTenantById which removes it)
    const tenant = await masterDb.models.tenant.findByPk(tenantId);
    if (!tenant) {
      throw fromCode('TENANT_NOT_FOUND');
    }
    
    // Check tenant status - provide specific feedback
    if (tenant.status === 'INACTIVE') {
      return {
        success: false,
        message: 'This tenant is currently INACTIVE. Please activate the tenant to connect to its database.',
        error: 'TENANT_INACTIVE',
        tenant: tenant.id,
        status: tenant.status
      };
    }
    
    if (tenant.status === 'SUSPENDED') {
      return {
        success: false,
        message: 'This tenant is currently SUSPENDED. Database access is temporarily disabled. Please contact support if you need access.',
        error: 'TENANT_SUSPENDED',
        tenant: tenant.id,
        status: tenant.status
      };
    }
    
    if (tenant.status !== 'ACTIVE') {
      return {
        success: false,
        message: `This tenant status is ${tenant.status}. Only ACTIVE tenants can connect.`,
        error: 'TENANT_DB_NOT_AVAILABLE',
        tenant: tenant.id,
        status: tenant.status
      };
    }
    
    // Password is automatically decrypted by Tenant model hook (afterFind)
    try {
      const { createSequelize } = require('../config/db');
      // URL encode password and username to handle special characters
      const encodedPassword = encodeURIComponent(tenant.db_password);
      const encodedUser = encodeURIComponent(tenant.db_user);
      const connectionString = `${tenant.dialect}://${encodedUser}:${encodedPassword}@${tenant.db_host}:${tenant.db_port}/${tenant.db_name}`;
      
      const testDb = createSequelize(connectionString);
      await testDb.authenticate();
      await testDb.close();
      
      // Security: Clear password from memory after use
      if (tenant.dataValues) {
        tenant.dataValues.db_password = '[REDACTED]';
      }
      tenant.db_password = '[REDACTED]';
      
      return { 
        success: true, 
        message: 'Database connection successful',
        tenant: tenant.id
      };
    } catch (error) {
      // Security: Clear password from memory even on error
      if (tenant.dataValues) {
        tenant.dataValues.db_password = '[REDACTED]';
      }
      tenant.db_password = '[REDACTED]';
      
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

