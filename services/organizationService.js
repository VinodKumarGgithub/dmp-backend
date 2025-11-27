const { Organization } = require('../models/Organization');
const { fromCode } = require('../utils/errors');
const { mapDbError } = require('../utils/dbErrorMapper');
const { generateMaskedOrgId } = require('../utils/organizationMask');
const { generateUniqueOrganizationId } = require('../utils/organizationIdGenerator');

/**
 * Validate and sanitize subdomain
 */
function validateSubdomain(subdomain) {
  if (!subdomain || typeof subdomain !== 'string') {
    throw fromCode('VALIDATION_ERROR', ['Subdomain is required']);
  }
  
  // Sanitize: lowercase, trim
  const sanitized = subdomain.toLowerCase().trim();
  
  // Validate format: 1-63 chars, alphanumeric, hyphens, underscores
  // Must start with letter or number
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(sanitized)) {
    throw fromCode('VALIDATION_ERROR', ['Invalid subdomain format']);
  }
  
  // Prevent reserved subdomains
  const reserved = ['www', 'api', 'admin', 'app', 'mail', 'ftp', 'localhost'];
  if (reserved.includes(sanitized)) {
    throw fromCode('VALIDATION_ERROR', ['Reserved subdomain']);
  }
  
  return sanitized;
}

/**
 * Parse branding JSON safely
 */
function parseBrandingJson(brandingJson) {
  if (!brandingJson) return {};
  
  try {
    return JSON.parse(brandingJson);
  } catch (e) {
    // Invalid JSON, return empty object
    return {};
  }
}

// Safe fields for public branding (includes 'id' for masking, but we'll exclude it from response)
const PUBLIC_BRANDING_ATTRIBUTES = [
  'id',              // Needed for generating masked_id, but excluded from response
  'subdomain',
  'name',
  'logo_url',
  'primary_color',
  'app_name',
  'branding_json'
];

// Safe fields for authenticated users (excludes internal IDs)
const AUTHENTICATED_BRANDING_ATTRIBUTES = [
  'subdomain',
  'name',
  'logo_url',
  'primary_color',
  'app_name',
  'branding_json'
];

// Whitelist of safe fields from branding_json
const SAFE_BRANDING_JSON_FIELDS = [
  'app_short_name',
  'favicon_url',
  'secondary_color',
  'email_footer_text',
  'support_email',
  'support_phone',
  'custom_css'
];

/**
 * Filter branding_json to only include safe fields
 */
function filterSafeBrandingJson(brandingJson) {
  const branding = parseBrandingJson(brandingJson);
  const safe = {};
  
  SAFE_BRANDING_JSON_FIELDS.forEach(field => {
    if (branding[field] !== undefined) {
      safe[field] = branding[field];
    }
  });
  
  return safe;
}

/**
 * Get organization by subdomain (public-facing)
 * Only fetches safe branding fields from database
 * Generates masked_id internally and excludes internal 'id' from response
 */
async function getOrganizationBySubdomain(subdomain) {
  try {
    const sanitized = validateSubdomain(subdomain);
    
    // Fetch with 'id' included (needed for masked_id), but we'll exclude it from response
    const org = await Organization.findOne({
      where: { subdomain: sanitized },
      attributes: PUBLIC_BRANDING_ATTRIBUTES
    });
    
    if (!org) {
      throw fromCode('NOT_FOUND', ['Organization not found']);
    }
    
    // Generate masked_id from internal 'id' (before excluding it)
    const maskedOrgId = generateMaskedOrgId(org.id);
    
    // Filter branding_json to only safe fields
    const safeBranding = filterSafeBrandingJson(org.branding_json);
    
    // Return safe fields + masked_id, but exclude internal 'id'
    return {
      masked_org_id: maskedOrgId,  // Include masked_id
      subdomain: org.subdomain,
      name: org.name,
      logo_url: org.logo_url,
      primary_color: org.primary_color,
      app_name: org.app_name,
      ...safeBranding // Only safe fields from branding_json
      // Note: 'id' is NOT included in response
    };
  } catch (error) {
    if (error.code) throw error;
    throw mapDbError(error);
  }
}

/**
 * Get organization by ID (internal use only)
 * For authenticated users - excludes internal ID but includes more fields
 * 
 * @param {string} organizationId - Internal organization ID
 * @param {boolean} includeInternalFields - Whether to include internal 'id' field (for internal operations)
 * @returns {object} - Branding data with masked_org_id (excludes internal 'id' unless includeInternalFields=true)
 */
async function getOrganizationById(organizationId, includeInternalFields = false) {
  try {
    if (!organizationId) {
      throw fromCode('VALIDATION_ERROR', ['Organization ID is required']);
    }
    
    // Check if Organization model is available (defensive check)
    if (!Organization) {
      throw fromCode('INTERNAL_ERROR', ['Organization model not available']);
    }
    
    // Check if Organization.findByPk is a function (defensive check)
    if (typeof Organization.findByPk !== 'function') {
      throw fromCode('INTERNAL_ERROR', ['Organization model not properly initialized']);
    }
    
    // For authenticated users, we don't need 'id' in attributes since we already have organizationId
    const attributes = includeInternalFields 
      ? undefined // Fetch all fields
      : AUTHENTICATED_BRANDING_ATTRIBUTES; // Only safe fields
    
    // Wrap database query in try-catch to handle table not found errors
    let org;
    try {
      org = await Organization.findByPk(organizationId, {
        attributes: attributes
      });
    } catch (dbError) {
      // Handle case where table doesn't exist or connection issues
      // Re-throw as NOT_FOUND so caller can handle gracefully
      if (dbError.name === 'SequelizeDatabaseError' || dbError.name === 'SequelizeConnectionError') {
        throw fromCode('NOT_FOUND', ['Organization not found']);
      }
      throw dbError;
    }
    
    if (!org) {
      throw fromCode('NOT_FOUND', ['Organization not found']);
    }
    
    // Generate masked_id
    const maskedOrgId = generateMaskedOrgId(organizationId);
    
    // For authenticated users, return all branding_json fields (they're authenticated)
    const branding = parseBrandingJson(org.branding_json);
    
    const result = {
      masked_org_id: maskedOrgId,  // Include masked_id
      subdomain: org.subdomain,
      name: org.name,
      logo_url: org.logo_url,
      primary_color: org.primary_color,
      app_name: org.app_name,
      ...branding
    };
    
    // Only include 'id' if explicitly requested (for internal operations)
    if (includeInternalFields && org.id) {
      result.id = org.id;
    }
    
    return result;
  } catch (error) {
    // Re-throw if it's already a formatted error
    if (error.code) throw error;
    // Map database errors
    throw mapDbError(error);
  }
}

/**
 * List all organizations (for SUPER_ADMIN) or filter by organization_id
 */
async function listOrganizations(filters = {}) {
  try {
    const { organization_id, search } = filters;
    const { Op } = require('sequelize');
    
    const where = {};
    
    // Filter by organization_id if provided (for non-SUPER_ADMIN)
    if (organization_id) {
      where.id = organization_id;
    }
    
    // Search in name or subdomain
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { subdomain: { [Op.like]: `%${search}%` } }
      ];
    }
    
    const organizations = await Organization.findAll({
      where,
      attributes: ['id', 'subdomain', 'name', 'logo_url', 'primary_color', 'app_name', 'created_at', 'updated_at'],
      order: [['created_at', 'DESC']]
    });
    
    return organizations.map(org => ({
      id: org.id,
      subdomain: org.subdomain,
      name: org.name,
      logo_url: org.logo_url,
      primary_color: org.primary_color,
      app_name: org.app_name,
      created_at: org.created_at,
      updated_at: org.updated_at
    }));
  } catch (error) {
    if (error.code) throw error;
    throw mapDbError(error);
  }
}

/**
 * Create a new organization (SUPER_ADMIN only)
 * Organization ID is auto-generated if not provided
 */
async function createOrganization(data) {
  try {
    const { id, subdomain, name, logo_url, primary_color, app_name, branding_json } = data;
    
    // Auto-generate organization ID if not provided
    let organizationId = id;
    if (!organizationId) {
      // Get generation mode from env or use 'slug' as default
      const mode = process.env.ORG_ID_GENERATION_MODE || 'slug';
      organizationId = await generateUniqueOrganizationId(name, Organization, mode);
    }
    
    if (!subdomain) {
      throw fromCode('VALIDATION_ERROR', ['Subdomain is required']);
    }
    
    // Validate subdomain
    const sanitizedSubdomain = validateSubdomain(subdomain);
    
    // Check if organization ID already exists (if manually provided)
    if (id) {
      const existingById = await Organization.findByPk(organizationId);
      if (existingById) {
        throw fromCode('VALIDATION_ERROR', ['Organization ID already exists']);
      }
    }
    
    // Check if subdomain already exists
    const existingBySubdomain = await Organization.findOne({ where: { subdomain: sanitizedSubdomain } });
    if (existingBySubdomain) {
      throw fromCode('VALIDATION_ERROR', ['Subdomain already exists']);
    }
    
    const orgData = {
      id: organizationId, // Use generated or provided ID
      subdomain: sanitizedSubdomain,
      name: name || 'New Organization',
      logo_url: logo_url || null,
      primary_color: primary_color || '#1890ff',
      app_name: app_name || null,
    };
    
    // Store extra fields in branding_json
    const extraFields = {};
    if (branding_json && typeof branding_json === 'object') {
      Object.assign(extraFields, branding_json);
    }
    
    // Add any other fields that aren't core fields
    Object.keys(data).forEach(key => {
      if (!['id', 'subdomain', 'name', 'logo_url', 'primary_color', 'app_name', 'branding_json'].includes(key)) {
        extraFields[key] = data[key];
      }
    });
    
    if (Object.keys(extraFields).length > 0) {
      orgData.branding_json = JSON.stringify(extraFields);
    }
    
    const newOrg = await Organization.create(orgData);
    
    return getOrganizationById(newOrg.id);
  } catch (error) {
    if (error.code) throw error;
    throw mapDbError(error);
  }
}

/**
 * Create or update organization (internal use - requires organization_id)
 */
async function createOrUpdateOrganization(organizationId, data) {
  try {
    if (!organizationId) {
      throw fromCode('VALIDATION_ERROR', ['Organization ID is required']);
    }
    
    const { branding_json, ...coreFields } = data;
    
    // Validate subdomain if provided
    let sanitizedSubdomain = null;
    if (data.subdomain) {
      sanitizedSubdomain = validateSubdomain(data.subdomain);
    } else {
      // If updating, get existing subdomain
      const existing = await Organization.findByPk(organizationId);
      if (!existing) {
        throw fromCode('NOT_FOUND', ['Organization not found']);
      }
      sanitizedSubdomain = existing.subdomain;
    }
    
    const orgData = {
      id: organizationId,
      subdomain: sanitizedSubdomain,
      name: data.name,
      logo_url: data.logo_url || null,
      primary_color: data.primary_color || '#1890ff',
      app_name: data.app_name || null,
    };
    
    // Store extra fields in branding_json
    const extraFields = {};
    if (branding_json && typeof branding_json === 'object') {
      Object.assign(extraFields, branding_json);
    }
    
    // Add any other fields that aren't core fields
    Object.keys(data).forEach(key => {
      if (!['id', 'subdomain', 'name', 'logo_url', 'primary_color', 'app_name', 'branding_json'].includes(key)) {
        extraFields[key] = data[key];
      }
    });
    
    if (Object.keys(extraFields).length > 0) {
      orgData.branding_json = JSON.stringify(extraFields);
    }
    
    await Organization.upsert(orgData, {
      returning: true
    });
    
    return getOrganizationById(organizationId);
  } catch (error) {
    if (error.code) throw error;
    throw mapDbError(error);
  }
}

module.exports = {
  getOrganizationBySubdomain,
  getOrganizationById,
  createOrUpdateOrganization,
  listOrganizations,
  createOrganization
};

