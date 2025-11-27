const express = require('express');
const { getPublicBranding, getBranding, updateBranding, listOrganizationsController, createOrganizationController, checkSubdomainAvailabilityController } = require('../controllers/organizationController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/roleMiddleware');
const { brandingRateLimiter } = require('../middleware/brandingRateLimiter');

const router = express.Router();

// Public routes - no auth required (for login page)
// Rate limited to prevent abuse
// These routes only match when subdomain is present (in params or query)
router.get('/organizations/:subdomain/branding', brandingRateLimiter, getPublicBranding);
router.get('/organizations/branding', brandingRateLimiter, (req, res, next) => {
  // Only handle if subdomain is in query params (public access)
  // Otherwise, pass to authenticated route below
  if (req.query.subdomain) {
    return getPublicBranding(req, res, next);
  }
  next(); // Pass to authenticated route
});

// Authenticated routes (no subdomain required)
router.get('/organizations', authMiddleware, requireAdmin, listOrganizationsController);
router.get('/organizations/subdomain/check', brandingRateLimiter, checkSubdomainAvailabilityController);
router.post('/organizations', authMiddleware, requireAdmin, createOrganizationController);
router.get('/organizations/branding', authMiddleware, getBranding);
router.put('/organizations/:id/branding', authMiddleware, requireAdmin, updateBranding);

module.exports = router;

