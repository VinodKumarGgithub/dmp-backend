require('dotenv').config();
const { masterSequelize } = require('../config/db');
const { AdminUser } = require('../models/AdminUser');
const { Organization } = require('../models/Organization');

/**
 * Generate a safe subdomain from organization ID
 * Converts org_123_abc to org-123-abc or similar
 */
function generateSubdomain(organizationId) {
  if (!organizationId) return null;
  
  // Remove 'org_' prefix if present
  let subdomain = organizationId.replace(/^org_/i, '');
  
  // Replace underscores and other invalid chars with hyphens
  subdomain = subdomain.replace(/[^a-z0-9-]/gi, '-');
  
  // Convert to lowercase
  subdomain = subdomain.toLowerCase();
  
  // Remove consecutive hyphens
  subdomain = subdomain.replace(/-+/g, '-');
  
  // Remove leading/trailing hyphens
  subdomain = subdomain.replace(/^-+|-+$/g, '');
  
  // Ensure it starts with alphanumeric
  if (!/^[a-z0-9]/.test(subdomain)) {
    subdomain = 'org-' + subdomain;
  }
  
  // Truncate to 63 chars (DNS limit)
  if (subdomain.length > 63) {
    subdomain = subdomain.substring(0, 63);
    // Remove trailing hyphen if truncated
    subdomain = subdomain.replace(/-+$/, '');
  }
  
  // Ensure minimum length
  if (subdomain.length < 1) {
    subdomain = 'org-' + Math.random().toString(36).substring(2, 8);
  }
  
  return subdomain;
}

/**
 * Generate organization name from ID or use default
 */
function generateOrgName(organizationId, index) {
  // Try to extract meaningful name from ID
  const cleanId = organizationId.replace(/^org_/i, '').replace(/[_-]/g, ' ');
  const words = cleanId.split(/\s+/).filter(w => w.length > 0);
  
  if (words.length > 0) {
    // Capitalize first letter of each word
    const capitalized = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    return capitalized + ' Organization';
  }
  
  return `Organization ${index + 1}`;
}

/**
 * Check if subdomain is already taken
 */
async function isSubdomainTaken(subdomain, excludeOrgId = null) {
  const where = { subdomain };
  if (excludeOrgId) {
    where.id = { [require('sequelize').Op.ne]: excludeOrgId };
  }
  const existing = await Organization.findOne({ where });
  return !!existing;
}

/**
 * Generate unique subdomain
 */
async function generateUniqueSubdomain(baseSubdomain, organizationId) {
  let subdomain = baseSubdomain;
  let counter = 1;
  
  while (await isSubdomainTaken(subdomain, organizationId)) {
    // Append counter to make it unique
    const suffix = `-${counter}`;
    const maxLength = 63 - suffix.length;
    subdomain = baseSubdomain.substring(0, maxLength) + suffix;
    counter++;
    
    // Prevent infinite loop
    if (counter > 1000) {
      // Use random suffix as fallback
      subdomain = baseSubdomain.substring(0, 50) + '-' + Math.random().toString(36).substring(2, 8);
      break;
    }
  }
  
  return subdomain;
}

(async () => {
  try {
    console.log('🔄 Starting organization migration...\n');
    
    // Authenticate database connection
    await masterSequelize.authenticate();
    console.log('✅ Database connection established');
    
    // Sync models
    await Organization.sync();
    console.log('✅ Organization model synced');
    
    // Find all unique organization_id values from users (excluding NULL)
    const users = await AdminUser.findAll({
      attributes: ['organization_id'],
      where: {
        organization_id: { [require('sequelize').Op.ne]: null }
      },
      raw: true
    });
    
    const uniqueOrgIds = [...new Set(users.map(u => u.organization_id).filter(Boolean))];
    
    if (uniqueOrgIds.length === 0) {
      console.log('ℹ️  No users with organization_id found. Nothing to migrate.');
      process.exit(0);
    }
    
    console.log(`📊 Found ${uniqueOrgIds.length} unique organization IDs to migrate\n`);
    
    let created = 0;
    let skipped = 0;
    let errors = 0;
    
    // Process each organization_id
    for (let i = 0; i < uniqueOrgIds.length; i++) {
      const organizationId = uniqueOrgIds[i];
      
      try {
        // Check if organization already exists
        const existing = await Organization.findByPk(organizationId);
        
        if (existing) {
          console.log(`⏭️  [${i + 1}/${uniqueOrgIds.length}] Organization '${organizationId}' already exists, skipping`);
          skipped++;
          continue;
        }
        
        // Generate subdomain
        const baseSubdomain = generateSubdomain(organizationId);
        const subdomain = await generateUniqueSubdomain(baseSubdomain, organizationId);
        
        // Generate name
        const name = generateOrgName(organizationId, i);
        
        // Create organization with default values
        await Organization.create({
          id: organizationId,
          subdomain: subdomain,
          name: name,
          logo_url: null,
          primary_color: '#1890ff',
          app_name: null,
          branding_json: null,
          created_at: new Date(),
          updated_at: new Date()
        });
        
        console.log(`✅ [${i + 1}/${uniqueOrgIds.length}] Created organization: ${name} (${organizationId}) -> ${subdomain}`);
        created++;
        
      } catch (err) {
        console.error(`❌ [${i + 1}/${uniqueOrgIds.length}] Error processing '${organizationId}':`, err.message);
        errors++;
      }
    }
    
    console.log('\n📈 Migration Summary:');
    console.log(`   ✅ Created: ${created}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   📊 Total: ${uniqueOrgIds.length}\n`);
    
    if (errors === 0) {
      console.log('✅ Migration completed successfully!');
    } else {
      console.log('⚠️  Migration completed with errors. Please review the output above.');
    }
    
    process.exit(errors > 0 ? 1 : 0);
    
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();

