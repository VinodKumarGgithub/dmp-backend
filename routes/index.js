const express = require('express');
const tenantRegistryRoutes = require('./tenantRegistry');
const pageMasterRoutes = require('./pageMasterRoutes');
const pageTenantRoutes = require('./pageTenantRoutes');
const userRoutes = require('./userRoutes');
const { tenantResolver } = require('../middleware/tenantResolver');
const { login } = require('../controllers/authController');

const router = express.Router();

// Auth routes
router.post('/auth/login', login);

// Master-only routes (no tenant resolution needed - uses master DB)
router.use('/users', userRoutes); // Admin user management routes
router.use('/tenants', tenantRegistryRoutes);
router.use('/pages', pageMasterRoutes);

// Tenant-aware routes (with tenant resolution)
router.use(tenantResolver);
router.use('/pages', pageTenantRoutes);

module.exports = router;


