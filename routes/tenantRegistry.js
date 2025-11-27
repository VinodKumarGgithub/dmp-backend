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

// CRUD Operations
router.post('/', authMiddleware, requireAdmin, createTenant);
router.get('/', authMiddleware,  listTenants);                      // List all tenants with filtering
router.get('/stats', authMiddleware, requireAdmin, getTenantStats);              // Get tenant statistics
router.get('/:id', authMiddleware, getTenantById);                 // Public via client credentials handled elsewhere
router.put('/:id', authMiddleware, requireAdmin, updateTenant);
router.delete('/:id', authMiddleware, requireAdmin, deleteTenant);

// Special Operations
router.post('/bulk', authMiddleware, requireAdmin, bulkCreateTenants);           // Bulk create tenants
router.post('/:id/test-connection', authMiddleware, requireAdmin, testTenantConnection); // Test database connection

module.exports = router;

