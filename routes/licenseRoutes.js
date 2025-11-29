const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireAdmin, requireSuperAdmin } = require('../middleware/roleMiddleware');
const { checkLicense } = require('../middleware/licenseMiddleware');
const licenseController = require('../controllers/licenseController');

/**
 * GET /api/license/status
 * Get license status for current organization
 * Requires: Authentication
 */
router.get('/status', authMiddleware, checkLicense, licenseController.getLicenseStatus);

/**
 * GET /api/license/features
 * Get available features and license status summary
 * Requires: Authentication
 */
router.get('/features', authMiddleware, checkLicense, licenseController.getLicenseFeatures);

/**
 * GET /api/license/limits
 * Check license limits (users/tenants)
 * Requires: Authentication
 */
router.get('/limits', authMiddleware, checkLicense, licenseController.checkLicenseLimits);

/**
 * GET /api/license
 * List all licenses
 * Requires: SUPER_ADMIN
 */
router.get('/', authMiddleware, requireSuperAdmin, licenseController.listLicenses);

/**
 * POST /api/license
 * Create new license
 * Requires: SUPER_ADMIN
 */
router.post('/', authMiddleware, requireSuperAdmin, licenseController.createLicense);

/**
 * GET /api/license/organization/:organizationId
 * Get license for specific organization
 * Requires: SUPER_ADMIN
 */
router.get('/organization/:organizationId', authMiddleware, requireSuperAdmin, licenseController.getLicenseByOrganization);

/**
 * PUT /api/license/organization/:organizationId
 * Update license
 * Requires: SUPER_ADMIN
 */
router.put('/organization/:organizationId', authMiddleware, requireSuperAdmin, licenseController.updateLicense);

/**
 * POST /api/license/organization/:organizationId/renew
 * Renew license (extend expiration)
 * Requires: SUPER_ADMIN
 */
router.post('/organization/:organizationId/renew', authMiddleware, requireSuperAdmin, licenseController.renewLicense);

module.exports = router;

