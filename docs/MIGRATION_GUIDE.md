# Migration Guide: Making Tenants Table Extensible

## Overview

This migration updates the `tenants` table to support all database types (SQL and NoSQL) with an extensible schema.

## Migration Options

### Option 1: Using Node.js Script (Recommended)

If you don't have `mysql` command line tool:

```bash
cd dmp-backend
node scripts/runMigration.js
```

This script:
- Uses Sequelize to connect to your database
- Reads the SQL migration file
- Executes statements one by one
- Handles errors gracefully (skips if columns already exist)
- Provides progress feedback

### Option 2: Using MySQL Command Line

If you have MySQL command line tool installed:

```bash
mysql -u your_user -p your_database < dmp-backend/sql/migrations/make_tenants_extensible.sql
```

### Option 3: Using Database GUI Tool

1. Open your database GUI (MySQL Workbench, phpMyAdmin, DBeaver, etc.)
2. Open the migration file: `dmp-backend/sql/migrations/make_tenants_extensible.sql`
3. Copy and paste the SQL statements
4. Execute them one by one or all at once

### Option 4: Using Sequelize CLI (if configured)

If you have Sequelize CLI set up:

```bash
npx sequelize-cli db:migrate
```

## What the Migration Does

1. **Changes `dialect` from ENUM to VARCHAR**
   - Allows unlimited database types
   - No more ENUM constraint

2. **Adds New Extensible Fields**
   - `db_type` - SQL or NoSQL (auto-detected)
   - `connection_type` - direct, connection_string, or connection_options
   - `connection_string` - Full connection string
   - `connection_options` - JSON for database-specific options
   - `metadata` - JSON for database-specific metadata
   - `tags` - JSON array for categorization
   - `status_reason` - Reason for current status
   - `last_connection_at` - Last successful connection
   - `last_connection_error` - Last connection error

3. **Makes SQL Fields Nullable**
   - `db_host`, `db_port`, `db_user`, `db_password`, `db_name`
   - Allows NoSQL databases that don't need these fields

4. **Updates Existing Records**
   - Sets `db_type = 'SQL'` for existing MySQL/MSSQL tenants
   - Sets `connection_type = 'direct'`
   - Adds default `connection_options`

## Verification

After running the migration, verify:

```sql
-- Check if new columns exist
DESCRIBE tenants;

-- Check existing tenants
SELECT id, dialect, db_type, connection_type FROM tenants LIMIT 5;
```

## Rollback (if needed)

If you need to rollback, you can manually:

```sql
-- Remove new columns (be careful!)
ALTER TABLE tenants 
  DROP COLUMN db_type,
  DROP COLUMN connection_type,
  DROP COLUMN connection_string,
  DROP COLUMN connection_options,
  DROP COLUMN metadata,
  DROP COLUMN tags,
  DROP COLUMN status_reason,
  DROP COLUMN last_connection_at,
  DROP COLUMN last_connection_error;

-- Change dialect back to ENUM (if needed)
ALTER TABLE tenants MODIFY COLUMN dialect ENUM('mysql', 'mssql') DEFAULT 'mysql';
```

**Note:** Rollback is not recommended if you've already created tenants with new database types.

## Troubleshooting

### Error: "Duplicate column"
- This means the migration already ran
- The migration is idempotent (safe to run multiple times)
- You can safely ignore this error

### Error: "Table doesn't exist"
- Make sure you're connected to the correct database
- Check your `MASTER_DB_URL` environment variable

### Error: "Access denied"
- Check database user permissions
- Ensure user has ALTER TABLE permissions

## Post-Migration Checklist

- [ ] Verify new columns exist in `tenants` table
- [ ] Test creating a tenant with MySQL (existing)
- [ ] Test creating a tenant with PostgreSQL (new)
- [ ] Test creating a tenant with MongoDB (new)
- [ ] Verify existing tenants still work
- [ ] Test connection with different database types

