const express = require('express');
const tenantRegistryRoutes = require('./tenantRegistry');
const pageMasterRoutes = require('./pageMasterRoutes');
const pageTenantRoutes = require('./pageTenantRoutes');
const userRoutes = require('./userRoutes');
const userPreferenceRoutes = require('./userPreferenceRoutes');
const profileRoutes = require('./profileRoutes');
const adminRoutes = require('./adminRoutes');
const organizationRoutes = require('./organizationRoutes');
const auditLogRoutes = require('./auditLogRoutes');
const licenseRoutes = require('./licenseRoutes');
const { tenantResolver } = require('../middleware/tenantResolver');
const { login } = require('../controllers/authController');

const router = express.Router();

// Auth routes
router.post('/auth/login', login);

// Master-only routes (no tenant resolution needed - uses master DB)
router.use('/users', userRoutes); // Admin user management routes
router.use('/profile', profileRoutes); // User profile management routes
router.use('/tenants', tenantRegistryRoutes);
router.use('/pages', pageMasterRoutes);
router.use('/page-preferences', userPreferenceRoutes);
router.use('/admin', adminRoutes); // Admin feature control and user blocking routes
router.use('/', organizationRoutes); // Organization branding routes (public + authenticated)
router.use('/api', auditLogRoutes); // Audit log routes
router.use('/license', licenseRoutes); // License management routes

// Tenant-aware routes (with tenant resolution)
router.use(tenantResolver);
router.use('/pages', pageTenantRoutes);

module.exports = router;


