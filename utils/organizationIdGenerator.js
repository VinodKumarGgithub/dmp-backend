const { generateId } = require('./idGenerator');
const { v4: uuidv4 } = require('uuid');

/**
 * Generate organization ID from organization name (slug format)
 * @param {string} name - Organization name
 * @returns {string} - Generated organization ID (e.g., "org_acme_corporation_abc123")
 */
function generateOrganizationIdFromName(name) {
  if (!name || typeof name !== 'string') {
    // Fallback to UUID-based ID if no name
    return `org_${uuidv4().replace(/-/g, '_')}`;
  }
  
  // Convert to lowercase and replace spaces/special chars with underscores
  let slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_') // Replace non-alphanumeric with underscore
    .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
    .substring(0, 40); // Limit length
  
  // Ensure it starts with a letter or number
  if (!/^[a-z0-9]/.test(slug)) {
    slug = 'org_' + slug;
  }
  
  // Add prefix
  if (!slug.startsWith('org_')) {
    slug = 'org_' + slug;
  }
  
  // Add unique suffix using timestamp + random
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  slug = slug.substring(0, 35) + '_' + timestamp.substring(timestamp.length - 6) + random;
  
  return slug;
}

/**
 * Generate organization ID using UUID (alternative method)
 * @returns {string} - UUID-based organization ID
 */
function generateOrganizationIdUuid() {
  return `org_${uuidv4().replace(/-/g, '_')}`;
}

/**
 * Generate organization ID using high-resolution time (alternative method)
 * @returns {string} - Time-based organization ID
 */
function generateOrganizationIdTime() {
  return generateId('org');
}

/**
 * Generate unique organization ID
 * Checks database for uniqueness and retries if needed
 * @param {string} name - Organization name (for slug-based generation)
 * @param {object} Organization - Sequelize model
 * @param {string} mode - Generation mode: 'slug' (default), 'uuid', or 'time'
 * @returns {Promise<string>} - Unique organization ID
 */
async function generateUniqueOrganizationId(name, Organization, mode = 'slug') {
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    let id;
    
    // Generate ID based on mode
    switch (mode) {
      case 'uuid':
        id = generateOrganizationIdUuid();
        break;
      case 'time':
        id = generateOrganizationIdTime();
        break;
      case 'slug':
      default:
        id = generateOrganizationIdFromName(name);
        break;
    }
    
    // Check if ID already exists
    const existing = await Organization.findByPk(id);
    if (!existing) {
      return id; // Unique ID found
    }
    
    attempts++;
    
    // If slug-based and taken, add more randomness
    if (mode === 'slug' && attempts < maxAttempts) {
      const random = Math.random().toString(36).substring(2, 8);
      id = id.substring(0, id.lastIndexOf('_')) + '_' + random;
    }
  }
  
  // Fallback to UUID if all attempts failed
  return generateOrganizationIdUuid();
}

module.exports = {
  generateOrganizationIdFromName,
  generateOrganizationIdUuid,
  generateOrganizationIdTime,
  generateUniqueOrganizationId
};

