const crypto = require('crypto');

/**
 * Generate a masked/hashed ID for organization (for branding cache validation)
 * Uses HMAC to create a consistent, non-reversible hash
 * 
 * @param {string} organizationId - Internal organization ID
 * @returns {string|null} - Masked organization ID (e.g., "org_a1b2c3d4e5f6g7h8") or null
 */
function generateMaskedOrgId(organizationId) {
  if (!organizationId) return null;
  
  // Use dedicated secret or fallback to JWT_SECRET
  // Security: Warn if using default in production
  const jwtSecret = process.env.JWT_SECRET;
  const orgMaskSecret = process.env.ORG_MASK_SECRET;
  const secret = orgMaskSecret || jwtSecret;
  
  if (!secret || secret === 'changeme') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('System configuration error. Please contact your system administrator.');
    }
    // Allow 'changeme' only in development
    console.warn('⚠️  WARNING: Using default security configuration. This is insecure and should only be used in development.');
  }
  
  const finalSecret = secret || 'changeme';
  
  // Create a consistent hash that can't be reversed
  const hash = crypto
    .createHmac('sha256', finalSecret)
    .update(String(organizationId))
    .digest('hex')
    .substring(0, 16); // Use first 16 chars for shorter ID
  
  return `org_${hash}`;
}

module.exports = { generateMaskedOrgId };

