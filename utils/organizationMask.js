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
  const secret = process.env.ORG_MASK_SECRET || process.env.JWT_SECRET || 'changeme';
  
  // Create a consistent hash that can't be reversed
  const hash = crypto
    .createHmac('sha256', secret)
    .update(String(organizationId))
    .digest('hex')
    .substring(0, 16); // Use first 16 chars for shorter ID
  
  return `org_${hash}`;
}

module.exports = { generateMaskedOrgId };

