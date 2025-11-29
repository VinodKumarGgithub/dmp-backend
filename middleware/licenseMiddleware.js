/**
 * License Validation Middleware
 * Validates license on requests (cached for performance)
 */

const licenseService = require('../services/licenseService');
const { fromCode } = require('../utils/errors');
const { isSuperAdmin } = require('./roleMiddleware');

// Cache license validation results (5 minute TTL)
const licenseCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get instance identifier from request
 * Uses domain/host or IP address
 */
function getInstanceId(req) {
  // Prefer host header (domain), fallback to IP
  return req.headers.host || req.ip || 'unknown';
}

/**
 * Clear license cache for organization
 */
function clearLicenseCache(organizationId) {
  const keysToDelete = [];
  for (const key of licenseCache.keys()) {
    if (key.startsWith(`${organizationId}-`)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => licenseCache.delete(key));
}

/**
 * License validation middleware
 * Validates license and attaches license info to request
 */
async function validateLicense(req, res, next) {
  // Skip for SUPER_ADMIN
  if (isSuperAdmin(req.user)) {
    return next();
  }

  const organizationId = req.user?.organization_id;
  if (!organizationId) {
    // No organization ID - allow through (might be public route)
    return next();
  }

  const instanceId = getInstanceId(req);
  const cacheKey = `${organizationId}-${instanceId}`;
  
  // Check cache
  const cached = licenseCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    if (!cached.valid) {
      return next(fromCode('LICENSE_INVALID', [cached.message]));
    }
    req.license = cached.license;
    return next();
  }

  // Validate license
  try {
    const validation = await licenseService.validateLicense(organizationId, instanceId);
    
    // Cache result
    licenseCache.set(cacheKey, {
      valid: validation.valid,
      message: validation.message,
      license: validation.license,
      reason: validation.reason,
      status: validation.status,
      timestamp: Date.now()
    });

    if (!validation.valid) {
      return next(fromCode('LICENSE_INVALID', [validation.message]));
    }

    req.license = validation.license;
    next();
  } catch (error) {
    // If it's already a formatted error, pass it through
    if (error.code) {
      return next(error);
    }
    // Otherwise, log and return generic error
    console.error('License validation error:', error);
    return next(fromCode('LICENSE_VALIDATION_ERROR', [
      'Failed to validate license. Please contact support.'
    ]));
  }
}

/**
 * Optional license check (doesn't block, just attaches info)
 * Useful for routes that work in read-only mode when expired
 */
async function checkLicense(req, res, next) {
  const organizationId = req.user?.organization_id;
  
  if (!organizationId || isSuperAdmin(req.user)) {
    return next();
  }

  try {
    const instanceId = getInstanceId(req);
    const validation = await licenseService.validateLicense(organizationId, instanceId);
    req.licenseStatus = validation;
    req.license = validation.license;
  } catch (error) {
    // Non-blocking: just log
    console.error('License check error:', error);
  }
  
  next();
}

module.exports = { 
  validateLicense, 
  checkLicense,
  clearLicenseCache,
  getInstanceId
};

