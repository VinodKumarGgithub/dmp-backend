const { success } = require('../utils/responseHandler');
const { fromCode } = require('../utils/errors');
const { 
  getOrganizationBySubdomain, 
  getOrganizationById, 
  createOrUpdateOrganization,
  listOrganizations,
  createOrganization
} = require('../services/organizationService');
const { isSuperAdmin } = require('../middleware/roleMiddleware');
const { checkSubdomainAvailability } = require('../utils/subdomainGenerator');

/**
 * Public endpoint - no auth required (for login page)
 * Returns only public branding fields (no sensitive data)
 * Single DB call - service handles masking and filtering
 */
async function getPublicBranding(req, res, next) {
  try {
    const subdomain = req.params.subdomain || req.query.subdomain;
    
    if (!subdomain) {
      return res.json(success(null, 'No subdomain specified'));
    }
    
    // Single DB call - service already handles masking and filtering
    // Branding already excludes 'id' and includes 'masked_org_id'
    const branding = await getOrganizationBySubdomain(subdomain);
    
    res.json(success(branding, 'Branding fetched successfully'));
  } catch (err) {
    // Don't expose error details for public endpoint (security)
    if (err.code === 'NOT_FOUND') {
      return res.json(success(null, 'Organization not found'));
    }
    // Generic error for security
    res.json(success(null, 'Branding not available'));
  }
}

/**
 * Get branding for authenticated user's organization
 * Single DB call - service handles masking
 */
async function getBranding(req, res, next) {
  try {
    const organizationId = req.user?.organization_id;
    
    if (!organizationId && req.user?.role !== 'SUPER_ADMIN') {
      return res.json(success(null, 'No organization branding'));
    }
    
    // SUPER_ADMIN can specify org_id in query, otherwise use their org
    const targetOrgId = req.query.organization_id || organizationId;
    
    if (!targetOrgId) {
      return res.json(success(null, 'No organization branding'));
    }
    
    // Single DB call - service already handles masking
    const branding = await getOrganizationById(targetOrgId, false);
    res.json(success(branding, 'Branding fetched successfully'));
  } catch (err) {
    next(err);
  }
}

/**
 * List organizations (SUPER_ADMIN can see all, others see only their own)
 */
async function listOrganizationsController(req, res, next) {
  try {
    const { user } = req;
    const { search } = req.query;
    
    // Non-SUPER_ADMIN can only see their own organization
    const filters = {};
    if (user?.role !== 'SUPER_ADMIN' && user?.organization_id) {
      filters.organization_id = user.organization_id;
    }
    
    if (search) {
      filters.search = search;
    }
    
    const organizations = await listOrganizations(filters);
    res.json(success(organizations, 'Organizations fetched successfully'));
  } catch (err) {
    next(err);
  }
}

/**
 * Create new organization (SUPER_ADMIN only)
 */
async function createOrganizationController(req, res, next) {
  try {
    const { user } = req;
    
    // Only SUPER_ADMIN can create organizations
    if (!isSuperAdmin(user)) {
      return next(fromCode('FORBIDDEN', ['Only SUPER_ADMIN can create organizations']));
    }
    
    const organization = await createOrganization(req.body);
    res.json(success(organization, 'Organization created successfully'));
  } catch (err) {
    next(err);
  }
}

/**
 * Update organization branding (SUPER_ADMIN or org ADMIN)
 */
async function updateBranding(req, res, next) {
  try {
    const organizationId = req.params.id || req.user?.organization_id;
    
    if (!organizationId) {
      return next(fromCode('VALIDATION_ERROR', ['Organization ID required']));
    }
    
    // Check permissions
    if (!isSuperAdmin(req.user) && req.user?.organization_id !== organizationId) {
      return next(fromCode('FORBIDDEN', ['You can only update your own organization']));
    }
    
    // createOrUpdateOrganization already returns branding with masked_org_id
    const branding = await createOrUpdateOrganization(organizationId, req.body);
    
    // Return subdomain so frontend can clear cache if needed
    res.json(success({
      ...branding,
      cacheKey: branding.subdomain
    }, 'Branding updated successfully'));
  } catch (err) {
    next(err);
  }
}

/**
 * Check subdomain availability
 */
async function checkSubdomainAvailabilityController(req, res, next) {
  try {
    const { subdomain } = req.query;
    if (!subdomain) {
      return res.json(success({ available: null, suggestions: [] }, 'Subdomain required'));
    }
    
    const result = await checkSubdomainAvailability(subdomain);
    res.json(success(result, 'Subdomain availability checked'));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPublicBranding,
  getBranding,
  updateBranding,
  listOrganizationsController,
  createOrganizationController,
  checkSubdomainAvailabilityController
};

