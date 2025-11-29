/**
 * Migration Script: Encrypt existing tenant database credentials
 * 
 * This script:
 * 1. Finds all tenants with plain-text passwords
 * 2. Encrypts them using AES-256-GCM
 * 3. Updates the database records
 * 
 * Usage:
 *   node scripts/migrateEncryptTenantCredentials.js
 * 
 * Prerequisites:
 *   - Set TENANT_CREDENTIALS_ENCRYPTION_KEY environment variable
 *   - Backup database before running
 */

require('dotenv').config();
const { masterSequelize } = require('../config/db');
const Tenant = require('../models/Tenant');
const encryptionService = require('../services/encryptionService');

(async () => {
  try {
    console.log('🔄 Starting tenant credentials encryption migration...\n');

    // Check if encryption key is set
    if (!process.env.TENANT_CREDENTIALS_ENCRYPTION_KEY) {
      console.error('❌ ERROR: TENANT_CREDENTIALS_ENCRYPTION_KEY environment variable is required');
      console.error('   Please set it in your .env file before running this migration.\n');
      process.exit(1);
    }

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
      await Tenant.sync();
      console.log('✅ Models synced\n');
    } catch (error) {
      console.error('❌ Model sync failed:', error.message);
      process.exit(1);
    }

    // Find all tenants
    const tenants = await Tenant.findAll({
      attributes: ['id', 'name', 'db_password', 'organization_id']
    });

    if (tenants.length === 0) {
      console.log('⚠️  No tenants found. Nothing to migrate.\n');
      process.exit(0);
    }

    console.log(`📊 Found ${tenants.length} tenant(s)\n`);

    let encrypted = 0;
    let skipped = 0;
    let errors = 0;

    // Process each tenant
    for (let i = 0; i < tenants.length; i++) {
      const tenant = tenants[i];
      
      try {
        // Check if already encrypted
        if (encryptionService.isEncrypted(tenant.db_password)) {
          // Verify it can be decrypted
          try {
            encryptionService.decrypt(tenant.db_password);
            console.log(`⏭️  [${i + 1}/${tenants.length}] Tenant '${tenant.name}' (${tenant.id}) already encrypted, skipping`);
            skipped++;
            continue;
          } catch (decryptError) {
            // Decryption failed - might be corrupted, re-encrypt
            console.log(`⚠️  [${i + 1}/${tenants.length}] Tenant '${tenant.name}' (${tenant.id}) has corrupted encryption, will re-encrypt`);
          }
        }

        // Get plain text password (might already be decrypted by hook, or plain text)
        let plainPassword = tenant.db_password;
        
        // If it looks encrypted but decryption fails, we can't proceed
        if (tenant.db_password.includes(':') && tenant.db_password.split(':').length === 3) {
          try {
            plainPassword = encryptionService.decrypt(tenant.db_password);
          } catch (e) {
            console.error(`❌ [${i + 1}/${tenants.length}] Cannot decrypt password for tenant '${tenant.name}' (${tenant.id}):`, e.message);
            errors++;
            continue;
          }
        }

        // Encrypt password
        const encryptedPassword = encryptionService.encrypt(plainPassword);
        
        // Update tenant (bypass hooks to avoid double encryption)
        await Tenant.update(
          { db_password: encryptedPassword },
          { where: { id: tenant.id }, hooks: false }
        );
        
        console.log(`✅ [${i + 1}/${tenants.length}] Encrypted credentials for tenant '${tenant.name}' (${tenant.id})`);
        encrypted++;

      } catch (error) {
        console.error(`❌ [${i + 1}/${tenants.length}] Error encrypting tenant '${tenant.name}' (${tenant.id}):`, error.message);
        errors++;
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`   ✅ Encrypted: ${encrypted}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   📊 Total: ${tenants.length}\n`);

    if (errors === 0) {
      console.log('✅ Credentials encryption migration completed successfully!');
      console.log('   All tenant passwords are now encrypted.\n');
    } else {
      console.log('⚠️  Migration completed with errors. Please review the output above.');
      console.log('   Some tenants may still have plain-text passwords.\n');
    }

    // Verify encryption by testing a few tenants
    if (encrypted > 0) {
      console.log('🔍 Verifying encryption...');
      const testTenants = await Tenant.findAll({
        limit: Math.min(3, tenants.length),
        attributes: ['id', 'name', 'db_password']
      });
      
      let verified = 0;
      for (const testTenant of testTenants) {
        if (encryptionService.isEncrypted(testTenant.db_password)) {
          try {
            const decrypted = encryptionService.decrypt(testTenant.db_password);
            if (decrypted && decrypted.length > 0) {
              verified++;
            }
          } catch (e) {
            console.error(`   ⚠️  Verification failed for tenant ${testTenant.id}`);
          }
        }
      }
      console.log(`   ✅ Verified ${verified}/${testTenants.length} sample tenants\n`);
    }

    process.exit(errors > 0 ? 1 : 0);

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();

