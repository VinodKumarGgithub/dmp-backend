const { tenantService } = require('../services/tenantService');
const { success, error } = require('../utils/responseHandler');
const { masterSequelize } = require('../config/db');

module.exports = {
  // Create new tenant
  createTenant: async function(req, res, next) {
    try {
      const tenant = await tenantService.createTenant(masterSequelize, req.body);
      const response = success(tenant, "Tenant created successfully!");
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },

  // Get all tenants with optional filtering
  listTenants: async function(req, res, next) {
    try {
      const filters = {
        status: req.query.status,
        search: req.query.search
      };
      
      const tenants = await tenantService.listTenants(masterSequelize, filters);
      const response = success(tenants, "Tenants fetched successfully!");
      res.json(response);
    } catch (err) {
      next(err);
    }
  },

  // Get tenant by ID
  getTenantById: async function(req, res, next) {
    try {
      const { id } = req.params;
      const tenant = await tenantService.getTenantById(masterSequelize, id);
      const response = success(tenant, "Tenant fetched successfully!");
      res.json(response);
    } catch (err) {
      next(err);
    }
  },

  // Update tenant
  updateTenant: async function(req, res, next) {
    try {
      const { id } = req.params;
      const tenant = await tenantService.updateTenant(masterSequelize, id, req.body);
      const response = success(tenant, "Tenant updated successfully!");
      res.json(response);
    } catch (err) {
      next(err);
    }
  },

  // Delete tenant
  deleteTenant: async function(req, res, next) {
    try {
      const { id } = req.params;
      const result = await tenantService.deleteTenant(masterSequelize, id);
      const response = success(result, "Tenant deleted successfully!");
      res.json(response);
    } catch (err) {
      next(err);
    }
  },

  // Test tenant database connection
  testTenantConnection: async function(req, res, next) {
    try {
      const { id } = req.params;
      const result = await tenantService.testTenantConnection(masterSequelize, id);
      const response = success(result, result.success ? "Connection test successful!" : "Connection test failed!");
      res.json(response);
    } catch (err) {
      next(err);
    }
  },

  // Bulk create tenants
  bulkCreateTenants: async function(req, res, next) {
    try {
      const { tenants } = req.body;
      if (!Array.isArray(tenants) || tenants.length === 0) {
        return res.status(400).json(error("Tenants array is required and must not be empty"));
      }
      
      const createdTenants = await tenantService.bulkCreateTenants(masterSequelize, tenants);
      const response = success(createdTenants, `${createdTenants.length} tenants created successfully!`);
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },

  // Get tenant statistics
  getTenantStats: async function(req, res, next) {
    try {
      const { tenant } = masterSequelize.models;
      
      const totalTenants = await tenant.count();
      const activeTenants = await tenant.count({ where: { status: 'ACTIVE' } });
      const inactiveTenants = await tenant.count({ where: { status: 'INACTIVE' } });
      const suspendedTenants = await tenant.count({ where: { status: 'SUSPENDED' } });
      
      const stats = {
        total: totalTenants,
        active: activeTenants,
        inactive: inactiveTenants,
        suspended: suspendedTenants
      };
      
      const response = success(stats, "Tenant statistics fetched successfully!");
      res.json(response);
    } catch (err) {
      next(err);
    }
  }
};

