#!/usr/bin/env node

/**
 * Setup ClickHouse Schema
 * Creates database and tables for usage analytics
 * 
 * Usage: node scripts/setupClickHouse.js
 */

const { getClickHouseClient } = require('../config/clickhouse');
const fs = require('fs');
const path = require('path');

async function setupClickHouse() {
  try {
    const client = getClickHouseClient();
    if (!client) {
      console.error('❌ ClickHouse client not available. Please check your configuration.');
      process.exit(1);
    }

    console.log('📊 Setting up ClickHouse schema...\n');

    // Read SQL schema file
    const schemaPath = path.join(__dirname, '../sql/migrations/create_clickhouse_schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Split by semicolons and execute each statement
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.length === 0) continue;

      try {
        await client.exec({ query: statement });
        console.log(`✅ Statement ${i + 1}/${statements.length} executed successfully`);
      } catch (error) {
        // Ignore "already exists" errors
        if (error.message.includes('already exists') || error.message.includes('EXISTS')) {
          console.log(`⚠️  Statement ${i + 1}/${statements.length} skipped (already exists)`);
        } else {
          console.error(`❌ Error executing statement ${i + 1}:`, error.message);
          throw error;
        }
      }
    }

    console.log('\n✅ ClickHouse schema setup completed successfully!');
    console.log('\n📈 You can now start tracking usage metrics.');

    // Test connection (optional - may fail if auth not configured)
    try {
      const testResult = await client.query({ query: 'SELECT count() FROM analytics.usage_metrics' });
      const result = await testResult.json();
      console.log(`\n📊 Current usage_metrics count: ${result[0]?.count || 0}`);
    } catch (testError) {
      // Ignore test errors - schema is already created
      console.log('\n⚠️  Note: Test query failed (this is OK if authentication is not configured yet)');
      console.log('   Make sure to set CLICKHOUSE_PASSWORD in your .env file');
    }

  } catch (error) {
    console.error('\n❌ Failed to setup ClickHouse:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run setup
setupClickHouse()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  });

