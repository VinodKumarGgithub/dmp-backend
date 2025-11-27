const { Organization } = require('../models/Organization');

/**
 * Generate subdomain from organization name
 */
function generateSubdomainFromName(name) {
  if (!name || typeof name !== 'string') return null;
  
  let subdomain = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .substring(0, 63);
  
  if (!/^[a-z0-9]/.test(subdomain)) {
    subdomain = 'org-' + subdomain;
  }
  
  return subdomain.length > 0 ? subdomain : null;
}

/**
 * Check subdomain availability and generate suggestions
 */
async function checkSubdomainAvailability(subdomain) {
  if (!subdomain || subdomain.trim().length < 2) {
    return { available: null, suggestions: [] };
  }
  
  try {
    const sanitized = subdomain.toLowerCase().trim();
    const existing = await Organization.findOne({ where: { subdomain: sanitized } });
    
    if (existing) {
      // Generate suggestions
      const suggestions = [];
      for (let i = 1; i <= 3; i++) {
        const suggestion = `${sanitized}-${i}`;
        const taken = await Organization.findOne({ where: { subdomain: suggestion } });
        if (!taken) suggestions.push(suggestion);
      }
      return { available: false, suggestions };
    }
    
    return { available: true, suggestions: [] };
  } catch (error) {
    return { available: false, suggestions: [] };
  }
}

module.exports = {
  generateSubdomainFromName,
  checkSubdomainAvailability
};

