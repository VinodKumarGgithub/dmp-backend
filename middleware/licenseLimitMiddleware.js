/**
 * License Limit Middleware
 * Checks license limits before allowing user/tenant creation
 */

const licenseService = require('../services/licenseService');
const { AdminUser } = require('../models/AdminUser');
const { Tenant } = require('../models/Tenant');
const { fromCode } = require('../utils/errors');
const { isSuperAdmin } = require('./roleMiddleware');

/**
 * Check user limit before creating user
 */
async function checkUserLimit(req, res, next) {
  try {
    // Skip for SUPER_ADMIN
    if (isSuperAdmin(req.user)) {
      return next();
    }

    const organizationId = req.body.organization_id || req.user?.organization_id;
    if (!organizationId) {
      // No organization ID - might be SUPER_ADMIN creating another SUPER_ADMIN
      return next();
    }

    // Count current users for this organization
    const currentCount = await AdminUser.count({
      where: { organization_id: organizationId }
    });

    // Check license limit
    const limitCheck = await licenseService.checkLicenseLimits(
      organizationId,
      'users',
      currentCount
    );

    if (!limitCheck.allowed) {
      return next(fromCode('LICENSE_LIMIT_EXCEEDED', [
        limitCheck.message || `User limit exceeded: ${limitCheck.current}/${limitCheck.limit}. Please upgrade your license.`
      ]));
    }

    // Attach limit info to request for potential frontend use
    req.licenseLimitInfo = {
      type: 'users',
      current: limitCheck.current,
      limit: limitCheck.limit,
      remaining: limitCheck.remaining,
      message: limitCheck.message
    };

    next();
  } catch (error) {
    // If license check fails, we should block to be safe
    // Only allow through if it's a specific "no license" case for graceful degradation
    if (error.code === 'NOT_FOUND' || error.message?.includes('No active license')) {
      // No license found - allow through but log warning
      console.warn('License limit check failed - no license found, allowing request:', error.message);
      return next();
    }
    // For other errors, block the request
    console.error('License limit check error:', error);
    return next(fromCode('LICENSE_VALIDATION_ERROR', [
      'Failed to validate license limits. Please contact support.'
    ]));
  }
}

/**
 * Check tenant limit before creating tenant
 */
async function checkTenantLimit(req, res, next) {
  try {
    // Skip for SUPER_ADMIN
    if (isSuperAdmin(req.user)) {
      return next();
    }

    const organizationId = req.body.organization_id || req.user?.organization_id;
    if (!organizationId) {
      // No organization ID - might be SUPER_ADMIN
      return next();
    }

    // Count current tenants for this organization
    const currentCount = await Tenant.count({
      where: { organization_id: organizationId }
    });

    // Check license limit
    const limitCheck = await licenseService.checkLicenseLimits(
      organizationId,
      'tenants',
      currentCount
    );

    if (!limitCheck.allowed) {
      return next(fromCode('LICENSE_LIMIT_EXCEEDED', [
        limitCheck.message || `Tenant limit exceeded: ${limitCheck.current}/${limitCheck.limit}. Please upgrade your license.`
      ]));
    }

    // Attach limit info to request for potential frontend use
    req.licenseLimitInfo = {
      type: 'tenants',
      current: limitCheck.current,
      limit: limitCheck.limit,
      remaining: limitCheck.remaining,
      message: limitCheck.message
    };

    next();
  } catch (error) {
    // If license check fails, we should block to be safe
    // Only allow through if it's a specific "no license" case for graceful degradation
    if (error.code === 'NOT_FOUND' || error.message?.includes('No active license')) {
      // No license found - allow through but log warning
      console.warn('License limit check failed - no license found, allowing request:', error.message);
      return next();
    }
    // For other errors, block the request
    console.error('License limit check error:', error);
    return next(fromCode('LICENSE_VALIDATION_ERROR', [
      'Failed to validate license limits. Please contact support.'
    ]));
  }
}

module.exports = { checkUserLimit, checkTenantLimit };

