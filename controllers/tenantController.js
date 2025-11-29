const { tenantService } = require('../services/tenantService');
const { success, error } = require('../utils/responseHandler');
const { fromCode } = require('../utils/errors');
const { masterSequelize } = require('../config/db');

module.exports = {
  // Create new tenant
  createTenant: async function(req, res, next) {
    try {
      // Prevent non-SUPER_ADMIN from creating tenants for other organizations
      if (req.user?.role !== 'SUPER_ADMIN') {
        if (!req.user?.organization_id) {
          return next(fromCode('FORBIDDEN', ['Organization ID is required']));
        }
        // Auto-set organization_id for non-SUPER_ADMIN users
        req.body.organization_id = req.user.organization_id;
      } else if (!req.body.organization_id) {
        // SUPER_ADMIN must provide organization_id
        return next(fromCode('VALIDATION_ERROR', ['Organization ID is required']));
      }
      
      const tenant = await tenantService.createTenant(masterSequelize, req.body);
      
      // Security: Remove password from response
      const tenantResponse = tenant.toJSON ? tenant.toJSON() : tenant;
      delete tenantResponse.db_password;
      
      const response = success(tenantResponse, "Tenant created successfully!");
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
        search: req.query.search,
      };
      
      // Filter by organization: SUPER_ADMIN sees all, others see only their org
      if (req.user?.role !== 'SUPER_ADMIN') {
        if (req.user?.organization_id) {
          filters.organization_id = req.user.organization_id;
        } else {
          // User has no organization_id - return empty
          return res.json(success([], "Tenants fetched successfully!"));
        }
      } else if (req.query.organization_id) {
        // SUPER_ADMIN can filter by organization_id if provided
        filters.organization_id = req.query.organization_id;
      }
      // SUPER_ADMIN without filter: sees all tenants
      
      const tenants = await tenantService.listTenants(masterSequelize, filters);
      
      // Security: Remove passwords from all tenant responses
      const tenantsResponse = tenants.map(tenant => {
        const tenantObj = tenant.toJSON ? tenant.toJSON() : tenant;
        delete tenantObj.db_password;
        return tenantObj;
      });
      
      const response = success(tenantsResponse, "Tenants fetched successfully!");
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
      
      // Prevent non-SUPER_ADMIN from accessing tenants from other organizations
      if (req.user?.role !== 'SUPER_ADMIN') {
        if (!req.user?.organization_id || tenant.organization_id !== req.user.organization_id) {
          return next(fromCode('FORBIDDEN', ['You can only view tenants from your own organization']));
        }
      }
      
      // Security: Remove password from response
      const tenantResponse = tenant.toJSON ? tenant.toJSON() : tenant;
      delete tenantResponse.db_password;
      
      const response = success(tenantResponse, "Tenant fetched successfully!");
      res.json(response);
    } catch (err) {
      next(err);
    }
  },

  // Update tenant
  updateTenant: async function(req, res, next) {
    try {
      const { id } = req.params;
      
      // First get the tenant to check organization
      const existingTenant = await tenantService.getTenantById(masterSequelize, id);
      
      // Prevent non-SUPER_ADMIN from updating tenants from other organizations
      if (req.user?.role !== 'SUPER_ADMIN') {
        if (!req.user?.organization_id || existingTenant.organization_id !== req.user.organization_id) {
          return next(fromCode('FORBIDDEN', ['You can only update tenants from your own organization']));
        }
        // Prevent non-SUPER_ADMIN from changing organization_id
        delete req.body.organization_id;
      }
      
      const tenant = await tenantService.updateTenant(masterSequelize, id, req.body);
      
      // Security: Remove password from response
      const tenantResponse = tenant.toJSON ? tenant.toJSON() : tenant;
      delete tenantResponse.db_password;
      
      const response = success(tenantResponse, "Tenant updated successfully!");
      res.json(response);
    } catch (err) {
      next(err);
    }
  },

  // Delete tenant
  deleteTenant: async function(req, res, next) {
    try {
      const { id } = req.params;
      
      // First get the tenant to check organization
      const tenant = await tenantService.getTenantById(masterSequelize, id);
      
      // Prevent non-SUPER_ADMIN from deleting tenants from other organizations
      if (req.user?.role !== 'SUPER_ADMIN') {
        if (!req.user?.organization_id || tenant.organization_id !== req.user.organization_id) {
          return next(fromCode('FORBIDDEN', ['You can only delete tenants from your own organization']));
        }
      }
      
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
      
      // First get the tenant to check organization
      const tenant = await tenantService.getTenantById(masterSequelize, id);
      
      // Prevent non-SUPER_ADMIN from testing tenants from other organizations
      if (req.user?.role !== 'SUPER_ADMIN') {
        if (!req.user?.organization_id || tenant.organization_id !== req.user.organization_id) {
          return next(fromCode('FORBIDDEN', ['You can only test tenants from your own organization']));
        }
      }
      
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

      // Check license limits for bulk creation (before creating any tenants)
      // Skip for SUPER_ADMIN
      const { isSuperAdmin } = require('../middleware/roleMiddleware');
      const { fromCode } = require('../utils/errors');
      
      if (!isSuperAdmin(req.user)) {
        const organizationId = tenants[0]?.organization_id || req.user?.organization_id;
        if (organizationId) {
          const { Tenant } = require('../models/Tenant');
          const licenseService = require('../services/licenseService');
          
          // Count current tenants for this organization
          const currentCount = await Tenant.count({
            where: { organization_id: organizationId }
          });

          // Check if adding all tenants would exceed limit
          const totalAfterCreation = currentCount + tenants.length;
          const limitCheck = await licenseService.checkLicenseLimits(
            organizationId,
            'tenants',
            totalAfterCreation - 1 // Check before creation (currentCount + newCount - 1)
          );

          if (!limitCheck.allowed) {
            return next(fromCode('LICENSE_LIMIT_EXCEEDED', [
              `Cannot create ${tenants.length} tenant(s). Would exceed limit: ${totalAfterCreation}/${limitCheck.limit}. Current: ${currentCount}/${limitCheck.limit}. Please upgrade your license.`
            ]));
          }
        }
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

