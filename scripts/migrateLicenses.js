/**
 * Migration Script: Create licenses for existing organizations
 * 
 * This script:
 * 1. Finds all organizations without licenses
 * 2. Creates licenses for them with default settings
 * 3. Optionally sets expiration date (default: 1 year from now)
 * 
 * Usage:
 *   node scripts/migrateLicenses.js
 *   node scripts/migrateLicenses.js --expires-in-days 365
 *   node scripts/migrateLicenses.js --expires-in-days 365 --max-users 100 --max-tenants 10
 */

require('dotenv').config();
const { masterSequelize } = require('../config/db');
const { Organization } = require('../models/Organization');
const { License } = require('../models/License');
const licenseService = require('../services/licenseService');

// Parse command line arguments
const args = process.argv.slice(2);
const expiresInDays = parseInt(args.find(arg => arg.startsWith('--expires-in-days'))?.split('=')[1] || '365', 10);
const maxUsers = args.find(arg => arg.startsWith('--max-users'))?.split('=')[1] ? parseInt(args.find(arg => arg.startsWith('--max-users'))?.split('=')[1], 10) : null;
const maxTenants = args.find(arg => arg.startsWith('--max-tenants'))?.split('=')[1] ? parseInt(args.find(arg => arg.startsWith('--max-tenants'))?.split('=')[1], 10) : null;
const features = args.find(arg => arg.startsWith('--features'))?.split('=')[1]?.split(',') || [];

(async () => {
  try {
    console.log('🔄 Starting license migration for existing organizations...\n');
    console.log('Configuration:');
    console.log(`   Expires in: ${expiresInDays} days`);
    console.log(`   Max users: ${maxUsers || 'unlimited'}`);
    console.log(`   Max tenants: ${maxTenants || 'unlimited'}`);
    console.log(`   Features: ${features.length > 0 ? features.join(', ') : 'none'}\n`);

    // Test database connection
    try {
      await masterSequelize.authenticate();
      console.log('✅ Database connection established\n');
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      process.exit(1);
    }

    // Sync models to ensure tables exist
    try {
      await Organization.sync();
      await License.sync();
      console.log('✅ Models synced\n');
    } catch (error) {
      console.error('❌ Model sync failed:', error.message);
      process.exit(1);
    }

    // Find all organizations
    const organizations = await Organization.findAll({
      attributes: ['id', 'name'],
      order: [['created_at', 'ASC']]
    });

    if (organizations.length === 0) {
      console.log('⚠️  No organizations found. Nothing to migrate.\n');
      process.exit(0);
    }

    console.log(`📊 Found ${organizations.length} organization(s)\n`);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    // Process each organization
    for (let i = 0; i < organizations.length; i++) {
      const org = organizations[i];
      
      try {
        // Check if license already exists
        const existingLicense = await License.findOne({
          where: { organization_id: org.id }
        });

        if (existingLicense) {
          console.log(`⏭️  [${i + 1}/${organizations.length}] License already exists for '${org.name}' (${org.id}), skipping`);
          skipped++;
          continue;
        }

        // Create license
        const license = await licenseService.createLicense(org.id, {
          expiresInDays,
          maxUsers,
          maxTenants,
          features: features.length > 0 ? features : []
        });

        console.log(`✅ [${i + 1}/${organizations.length}] Created license for '${org.name}' (${org.id})`);
        console.log(`   License Key: ${license.license_key}`);
        console.log(`   Expires: ${new Date(license.expires_at).toLocaleDateString()}\n`);
        created++;

      } catch (err) {
        console.error(`❌ [${i + 1}/${organizations.length}] Error creating license for '${org.name}' (${org.id}):`, err.message);
        errors++;
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`   ✅ Created: ${created}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   📊 Total: ${organizations.length}\n`);

    if (errors === 0) {
      console.log('✅ License migration completed successfully!');
    } else {
      console.log('⚠️  License migration completed with errors. Please review the output above.');
    }

    process.exit(errors > 0 ? 1 : 0);

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();

