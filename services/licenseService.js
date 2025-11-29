/**
 * License Management Service
 * Handles license creation, validation, and management
 */

const crypto = require('crypto');
const { License } = require('../models/License');
const { generateId } = require('../utils/idGenerator');
const { fromCode } = require('../utils/errors');
const { logger } = require('../config/logger');

class LicenseService {
  /**
   * Generate a unique license key
   * @param {string} organizationId - Organization ID
   * @returns {string} License key
   */
  generateLicenseKey(organizationId) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(16).toString('hex');
    const data = `${organizationId}-${timestamp}-${random}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32).toUpperCase();
  }

  /**
   * Create license for organization
   * @param {string} organizationId - Organization ID
   * @param {Object} options - License options
   * @param {number} options.expiresInDays - Days until expiration (default: 365)
   * @param {number} options.maxUsers - Maximum users (null = unlimited)
   * @param {number} options.maxTenants - Maximum tenants (null = unlimited)
   * @param {Array<string>} options.features - Enabled features array
   * @param {string} options.instanceId - Instance binding (optional)
   * @returns {Promise<Object>} Created license
   */
  async createLicense(organizationId, options = {}) {
    const {
      expiresInDays = 365,
      maxUsers = null,
      maxTenants = null,
      features = [],
      instanceId = null
    } = options;

    // Validate organization exists
    const { Organization } = require('../models/Organization');
    const organization = await Organization.findByPk(organizationId);
    if (!organization) {
      throw fromCode('NOT_FOUND', ['Organization not found']);
    }

    // Check if license already exists
    const existing = await License.findOne({
      where: { organization_id: organizationId }
    });

    if (existing) {
      throw fromCode('CONFLICT', ['License already exists for this organization']);
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const license = await License.create({
      id: generateId('license'),
      organization_id: organizationId,
      license_key: this.generateLicenseKey(organizationId),
      instance_id: instanceId,
      expires_at: expiresAt,
      max_users: maxUsers,
      max_tenants: maxTenants,
      features: Array.isArray(features) ? features : [],
      status: 'ACTIVE'
    });

    logger.info('License created', {
      licenseId: license.id,
      organizationId: license.organization_id,
      expiresAt: license.expires_at
    });

    return license;
  }

  /**
   * Validate license for organization
   * @param {string} organizationId - Organization ID
   * @param {string} instanceId - Instance identifier (optional, for binding check)
   * @returns {Promise<Object>} Validation result
   */
  async validateLicense(organizationId, instanceId = null) {
    // SUPER_ADMIN organizations (null organization_id) should always be valid
    // This is handled at middleware level, but adding safety check here too
    if (!organizationId) {
      return {
        valid: true,
        reason: null,
        message: 'No license required (SUPER_ADMIN)',
        status: 'ACTIVE',
        license: null
      };
    }

    const license = await License.findOne({
      where: { organization_id: organizationId }
    });

    if (!license) {
      return {
        valid: false,
        reason: 'NO_LICENSE',
        message: 'No license found for this organization',
        status: null
      };
    }

    // Check status
    if (license.status !== 'ACTIVE') {
      return {
        valid: false,
        reason: 'INACTIVE',
        message: `License status: ${license.status}`,
        status: license.status,
        expiresAt: license.expires_at
      };
    }

    // Check expiration
    const now = new Date();
    const expiresAt = new Date(license.expires_at);
    
    if (now > expiresAt) {
      // Auto-update status to EXPIRED
      await license.update({ status: 'EXPIRED' });
      
      return {
        valid: false,
        reason: 'EXPIRED',
        message: `License expired on ${expiresAt.toISOString().split('T')[0]}`,
        status: 'EXPIRED',
        expiresAt: expiresAt
      };
    }

    // Instance binding check (if instance_id is set and provided)
    if (license.instance_id && instanceId && license.instance_id !== instanceId) {
      return {
        valid: false,
        reason: 'INSTANCE_MISMATCH',
        message: 'License is bound to a different instance',
        status: license.status,
        expiresAt: license.expires_at
      };
    }

    return {
      valid: true,
      reason: null,
      message: 'License is valid',
      status: license.status,
      license: {
        id: license.id,
        licenseKey: license.license_key,
        expiresAt: license.expires_at,
        maxUsers: license.max_users,
        maxTenants: license.max_tenants,
        features: license.features || [],
        instanceId: license.instance_id
      }
    };
  }

  /**
   * Check license limits (users, tenants)
   * @param {string} organizationId - Organization ID
   * @param {string} checkType - 'users' or 'tenants'
   * @param {number} currentCount - Current count
   * @returns {Promise<Object>} Limit check result
   */
  async checkLicenseLimits(organizationId, checkType, currentCount) {
    const license = await License.findOne({
      where: { organization_id: organizationId, status: 'ACTIVE' }
    });

    if (!license) {
      return { 
        allowed: false, 
        reason: 'NO_LICENSE',
        message: 'No active license found'
      };
    }

    // Check expiration
    const now = new Date();
    if (now > new Date(license.expires_at)) {
      return {
        allowed: false,
        reason: 'EXPIRED',
        message: 'License has expired'
      };
    }

    if (checkType === 'users' && license.max_users !== null) {
      // Check if current count is already at or exceeds limit
      // We check BEFORE creation, so if currentCount is 10 and limit is 10, we should block
      const allowed = currentCount < license.max_users;
      const remaining = Math.max(0, license.max_users - currentCount);
      return {
        allowed,
        limit: license.max_users,
        current: currentCount,
        remaining,
        reason: allowed ? null : 'USER_LIMIT_EXCEEDED',
        message: allowed 
          ? `Users: ${currentCount}/${license.max_users} (${remaining} remaining)`
          : `User limit exceeded: ${currentCount}/${license.max_users}. Please upgrade your license.`
      };
    }

    if (checkType === 'tenants' && license.max_tenants !== null) {
      // Check if current count is already at or exceeds limit
      // We check BEFORE creation, so if currentCount is 5 and limit is 5, we should block
      const allowed = currentCount < license.max_tenants;
      const remaining = Math.max(0, license.max_tenants - currentCount);
      return {
        allowed,
        limit: license.max_tenants,
        current: currentCount,
        remaining,
        reason: allowed ? null : 'TENANT_LIMIT_EXCEEDED',
        message: allowed
          ? `Tenants: ${currentCount}/${license.max_tenants} (${remaining} remaining)`
          : `Tenant limit exceeded: ${currentCount}/${license.max_tenants}. Please upgrade your license.`
      };
    }

    return { 
      allowed: true,
      limit: null,
      current: currentCount,
      message: 'No limit set'
    };
  }

  /**
   * Update license
   * @param {string} organizationId - Organization ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated license
   */
  async updateLicense(organizationId, updates) {
    const license = await License.findOne({
      where: { organization_id: organizationId }
    });

    if (!license) {
      throw fromCode('NOT_FOUND', ['License not found']);
    }

    const allowedUpdates = [
      'expires_at',
      'status',
      'max_users',
      'max_tenants',
      'features',
      'instance_id'
    ];

    const updateData = {};
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    });

    updateData.updated_at = new Date();

    await license.update(updateData);

    // Clear license cache to reflect changes immediately
    const { clearLicenseCache } = require('../middleware/licenseMiddleware');
    clearLicenseCache(organizationId);

    logger.info('License updated', {
      organizationId,
      updates: Object.keys(updateData)
    });

    return license;
  }

  /**
   * Get license by organization ID
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object|null>} License or null
   */
  async getLicenseByOrganizationId(organizationId) {
    return await License.findOne({
      where: { organization_id: organizationId }
    });
  }

  /**
   * Renew license (extend expiration)
   * @param {string} organizationId - Organization ID
   * @param {number} additionalDays - Days to add
   * @returns {Promise<Object>} Updated license
   */
  async renewLicense(organizationId, additionalDays) {
    const license = await License.findOne({
      where: { organization_id: organizationId }
    });

    if (!license) {
      throw fromCode('NOT_FOUND', ['License not found']);
    }

    const currentExpiry = new Date(license.expires_at);
    const newExpiry = new Date(currentExpiry);
    newExpiry.setDate(newExpiry.getDate() + additionalDays);

    await license.update({
      expires_at: newExpiry,
      status: 'ACTIVE', // Reactivate if expired
      updated_at: new Date()
    });

    logger.info('License renewed', {
      organizationId,
      oldExpiry: currentExpiry,
      newExpiry: newExpiry,
      additionalDays
    });

    return license;
  }
}

module.exports = new LicenseService();

