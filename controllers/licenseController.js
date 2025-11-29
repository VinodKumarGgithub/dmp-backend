/**
 * License Controller
 * Handles license-related API endpoints
 */

const licenseService = require('../services/licenseService');
const featureGateService = require('../services/featureGateService');
const { fromCode } = require('../utils/errors');
const { getInstanceId } = require('../middleware/licenseMiddleware');

/**
 * Get license status for current organization
 */
async function getLicenseStatus(req, res, next) {
  try {
    const organizationId = req.user?.organization_id;
    
    // SUPER_ADMIN (no organization_id) doesn't need a license
    if (!organizationId) {
      return res.json({
        valid: true,
        reason: null,
        message: 'No license required (SUPER_ADMIN)',
        status: 'ACTIVE',
        expiresAt: null,
        license: null
      });
    }

    const instanceId = getInstanceId(req);
    const validation = await licenseService.validateLicense(organizationId, instanceId);
    
    res.json({
      valid: validation.valid,
      reason: validation.reason,
      message: validation.message,
      status: validation.status,
      expiresAt: validation.license?.expiresAt || validation.expiresAt,
      license: validation.license || null
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Create license (SUPER_ADMIN only)
 */
async function createLicense(req, res, next) {
  try {
    const { organizationId, expiresInDays, maxUsers, maxTenants, features, instanceId } = req.body;

    if (!organizationId) {
      return next(fromCode('VALIDATION_ERROR', ['organizationId is required']));
    }

    const license = await licenseService.createLicense(organizationId, {
      expiresInDays: expiresInDays || 365,
      maxUsers: maxUsers || null,
      maxTenants: maxTenants || null,
      features: features || [],
      instanceId: instanceId || null
    });

    res.status(201).json({
      id: license.id,
      organizationId: license.organization_id,
      licenseKey: license.license_key,
      expiresAt: license.expires_at,
      maxUsers: license.max_users,
      maxTenants: license.max_tenants,
      features: license.features,
      status: license.status
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update license (SUPER_ADMIN only)
 */
async function updateLicense(req, res, next) {
  try {
    const { organizationId } = req.params;
    const updates = req.body;

    if (!organizationId) {
      return next(fromCode('VALIDATION_ERROR', ['organizationId is required']));
    }

    // Convert camelCase to snake_case for database fields
    const dbUpdates = {};
    if (updates.maxUsers !== undefined) dbUpdates.max_users = updates.maxUsers === -1 ? null : updates.maxUsers;
    if (updates.maxTenants !== undefined) dbUpdates.max_tenants = updates.maxTenants === -1 ? null : updates.maxTenants;
    if (updates.expiresAt !== undefined) dbUpdates.expires_at = updates.expiresAt;
    if (updates.instanceId !== undefined) dbUpdates.instance_id = updates.instanceId;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.features !== undefined) dbUpdates.features = updates.features;

    const license = await licenseService.updateLicense(organizationId, dbUpdates);

    res.json({
      id: license.id,
      organizationId: license.organization_id,
      licenseKey: license.license_key,
      expiresAt: license.expires_at,
      maxUsers: license.max_users,
      maxTenants: license.max_tenants,
      features: license.features,
      status: license.status,
      instanceId: license.instance_id
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Renew license (extend expiration)
 */
async function renewLicense(req, res, next) {
  try {
    const { organizationId } = req.params;
    const { additionalDays } = req.body;

    if (!organizationId) {
      return next(fromCode('VALIDATION_ERROR', ['organizationId is required']));
    }

    if (!additionalDays || additionalDays <= 0) {
      return next(fromCode('VALIDATION_ERROR', ['additionalDays must be a positive number']));
    }

    const license = await licenseService.renewLicense(organizationId, additionalDays);

    res.json({
      id: license.id,
      organizationId: license.organization_id,
      expiresAt: license.expires_at,
      status: license.status
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get license by organization ID (SUPER_ADMIN only)
 */
async function getLicenseByOrganization(req, res, next) {
  try {
    const { organizationId } = req.params;

    if (!organizationId) {
      return next(fromCode('VALIDATION_ERROR', ['organizationId is required']));
    }

    const license = await licenseService.getLicenseByOrganizationId(organizationId);

    if (!license) {
      return next(fromCode('NOT_FOUND', ['License not found for this organization']));
    }

    res.json({
      id: license.id,
      organizationId: license.organization_id,
      licenseKey: license.license_key,
      expiresAt: license.expires_at,
      maxUsers: license.max_users,
      maxTenants: license.max_tenants,
      features: license.features,
      status: license.status,
      instanceId: license.instance_id,
      createdAt: license.created_at,
      updatedAt: license.updated_at
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Check license limits
 */
async function checkLicenseLimits(req, res, next) {
  try {
    const organizationId = req.user?.organization_id;
    const { checkType, currentCount } = req.query;

    if (!organizationId) {
      return next(fromCode('UNAUTHORIZED'));
    }

    if (!checkType || !['users', 'tenants'].includes(checkType)) {
      return next(fromCode('VALIDATION_ERROR', ['checkType must be "users" or "tenants"']));
    }

    const count = parseInt(currentCount, 10);
    if (isNaN(count) || count < 0) {
      return next(fromCode('VALIDATION_ERROR', ['currentCount must be a non-negative number']));
    }

    const result = await licenseService.checkLicenseLimits(organizationId, checkType, count);

    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Get license features and status summary
 */
async function getLicenseFeatures(req, res, next) {
  try {
    const organizationId = req.user?.organization_id;
    
    if (!organizationId) {
      // SUPER_ADMIN - all features
      return res.json({
        valid: true,
        readOnly: false,
        features: ['export', 'custom_branding', 'api_access', 'advanced_filters', 'bulk_operations'],
        message: 'SUPER_ADMIN - All features enabled'
      });
    }

    const summary = await featureGateService.getLicenseStatusSummary(organizationId);
    res.json(summary);
  } catch (error) {
    next(error);
  }
}

/**
 * List all licenses (SUPER_ADMIN only)
 */
async function listLicenses(req, res, next) {
  try {
    const { search, status } = req.query;
    const { License } = require('../models/License');
    const { Op } = require('sequelize');
    
    const where = {};
    if (status) where.status = status;
    if (search) {
      where[Op.or] = [
        { organization_id: { [Op.like]: `%${search}%` } },
        { license_key: { [Op.like]: `%${search}%` } },
      ];
    }
    
    const licenses = await License.findAll({ 
      where, 
      order: [['created_at', 'DESC']] 
    });
    
    res.json({
      data: licenses.map(license => ({
        id: license.id,
        organizationId: license.organization_id,
        licenseKey: license.license_key,
        expiresAt: license.expires_at,
        maxUsers: license.max_users,
        maxTenants: license.max_tenants,
        features: license.features || [],
        status: license.status,
        instanceId: license.instance_id,
        createdAt: license.created_at,
        updatedAt: license.updated_at,
      }))
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getLicenseStatus,
  getLicenseFeatures,
  createLicense,
  updateLicense,
  renewLicense,
  getLicenseByOrganization,
  checkLicenseLimits,
  listLicenses
};

