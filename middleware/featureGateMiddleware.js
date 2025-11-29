/**
 * Feature Gate Middleware
 * Restricts features based on license status
 */

const featureGateService = require('../services/featureGateService');
const { fromCode } = require('../utils/errors');
const { isSuperAdmin } = require('./roleMiddleware');

/**
 * Require a specific feature to be enabled
 * @param {string} feature - Feature name
 */
function requireFeature(feature) {
  return async (req, res, next) => {
    // SUPER_ADMIN bypasses all feature checks
    if (isSuperAdmin(req.user)) {
      return next();
    }

    const organizationId = req.user?.organization_id;
    
    if (!organizationId) {
      return next(fromCode('FORBIDDEN', ['Organization ID required']));
    }

    try {
      const enabled = await featureGateService.isFeatureEnabled(organizationId, feature);
      
      if (!enabled) {
        return next(fromCode('FEATURE_NOT_AVAILABLE', [
          `Feature '${feature}' is not available. Please check your license.`
        ]));
      }

      next();
    } catch (error) {
      console.error('Feature gate check error:', error);
      return next(fromCode('FEATURE_NOT_AVAILABLE', [
        'Failed to verify feature availability. Please contact support.'
      ]));
    }
  };
}

/**
 * Require active license (blocks expired licenses from write operations)
 * Allows read-only mode for expired licenses
 * @param {string} action - Action type (e.g., 'create', 'update', 'delete', 'export')
 */
function requireActiveLicense(action = 'write') {
  return async (req, res, next) => {
    // SUPER_ADMIN bypasses license checks
    if (isSuperAdmin(req.user)) {
      return next();
    }

    const organizationId = req.user?.organization_id;
    
    if (!organizationId) {
      // No organization ID - might be public route, allow through
      return next();
    }

    try {
      const canPerform = await featureGateService.canPerformAction(organizationId, action);
      
      if (!canPerform.allowed) {
        // Attach license status to request for frontend
        req.licenseStatus = {
          valid: false,
          readOnly: canPerform.readOnly,
          reason: canPerform.reason,
          message: canPerform.message
        };

        return next(fromCode('LICENSE_RESTRICTED', [canPerform.message]));
      }

      // Attach license status to request
      req.licenseStatus = {
        valid: true,
        readOnly: canPerform.readOnly,
        reason: canPerform.reason,
        message: canPerform.message
      };

      next();
    } catch (error) {
      console.error('License check error:', error);
      return next(fromCode('LICENSE_VALIDATION_ERROR', [
        'Failed to validate license. Please contact support.'
      ]));
    }
  };
}

/**
 * Check license status (non-blocking, attaches info to request)
 * Useful for routes that work in read-only mode
 */
function checkLicenseStatus(req, res, next) {
  const organizationId = req.user?.organization_id;
  
  if (!organizationId || isSuperAdmin(req.user)) {
    req.licenseStatus = {
      valid: true,
      readOnly: false,
      features: []
    };
    return next();
  }

  // Non-blocking check - attach status to request
  featureGateService.getLicenseStatusSummary(organizationId)
    .then(status => {
      req.licenseStatus = status;
      next();
    })
    .catch(error => {
      // On error, assume valid (don't block)
      console.error('License status check error:', error);
      req.licenseStatus = {
        valid: true,
        readOnly: false,
        features: []
      };
      next();
    });
}

module.exports = { 
  requireFeature, 
  requireActiveLicense,
  checkLicenseStatus
};

