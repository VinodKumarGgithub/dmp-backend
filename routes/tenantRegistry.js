const express = require('express');
const { 
  createTenant,
  listTenants,
  getTenantById,
  updateTenant,
  deleteTenant,
  testTenantConnection,
  bulkCreateTenants,
  getTenantStats
} = require('../controllers/tenantController');

const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/roleMiddleware');
const { requireActiveLicense } = require('../middleware/featureGateMiddleware');
const { checkTenantLimit } = require('../middleware/licenseLimitMiddleware');

// Read operations - no license check needed (read-only mode allowed)
router.get('/', authMiddleware, listTenants);
router.get('/stats', authMiddleware, requireAdmin, getTenantStats);
router.get('/:id', authMiddleware, getTenantById);

// Write operations - require active license (block expired licenses) and check limits
router.post('/', authMiddleware, requireActiveLicense('create'), checkTenantLimit, requireAdmin, createTenant);
router.put('/:id', authMiddleware, requireActiveLicense('update'), requireAdmin, updateTenant);
router.delete('/:id', authMiddleware, requireActiveLicense('delete'), requireAdmin, deleteTenant);

// Special Operations - require active license and check limits
router.post('/bulk', authMiddleware, requireActiveLicense('create'), checkTenantLimit, requireAdmin, bulkCreateTenants);
router.post('/:id/test-connection', authMiddleware, requireActiveLicense('create'), requireAdmin, testTenantConnection);

module.exports = router;

