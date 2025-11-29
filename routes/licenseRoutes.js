const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/roleMiddleware');
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
 * POST /api/license
 * Create new license
 * Requires: SUPER_ADMIN
 */
router.post('/', authMiddleware, requireAdmin, licenseController.createLicense);

/**
 * GET /api/license/organization/:organizationId
 * Get license for specific organization
 * Requires: SUPER_ADMIN
 */
router.get('/organization/:organizationId', authMiddleware, requireAdmin, licenseController.getLicenseByOrganization);

/**
 * PUT /api/license/organization/:organizationId
 * Update license
 * Requires: SUPER_ADMIN
 */
router.put('/organization/:organizationId', authMiddleware, requireAdmin, licenseController.updateLicense);

/**
 * POST /api/license/organization/:organizationId/renew
 * Renew license (extend expiration)
 * Requires: SUPER_ADMIN
 */
router.post('/organization/:organizationId/renew', authMiddleware, requireAdmin, licenseController.renewLicense);

module.exports = router;

