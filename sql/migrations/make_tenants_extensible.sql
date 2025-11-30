-- Migration: Make tenants table extensible for all database types
-- This migration updates the tenants table to support SQL and NoSQL databases
-- Run this script on your master database

-- Step 1: Change dialect from ENUM to VARCHAR (supports unlimited database types)
ALTER TABLE tenants 
  MODIFY COLUMN dialect VARCHAR(50) NOT NULL DEFAULT 'mysql',
  COMMENT 'Database dialect: mysql, postgres, mongodb, dynamodb, etc.';

-- Step 2: Add database type (SQL/NoSQL) for categorization
ALTER TABLE tenants 
  ADD COLUMN db_type VARCHAR(20) NULL AFTER dialect,
  ADD INDEX idx_tenants_db_type (db_type),
  COMMENT 'Database type: SQL or NoSQL (auto-detected from dialect)';

-- Step 3: Make SQL-specific fields nullable (NoSQL may not need them)
ALTER TABLE tenants 
  MODIFY COLUMN db_host VARCHAR(255) NULL,
  MODIFY COLUMN db_port INT NULL,
  MODIFY COLUMN db_user VARCHAR(255) NULL,
  MODIFY COLUMN db_password TEXT NULL,
  MODIFY COLUMN db_name VARCHAR(255) NULL;

-- Step 4: Add connection_string field (alternative to host/port/user/pass)
ALTER TABLE tenants 
  ADD COLUMN connection_string TEXT NULL AFTER db_name,
  COMMENT 'Full connection string (alternative to host/port/user/pass). Used for complex connection scenarios.';

-- Step 5: Add connection_options JSON field (SSL, timezone, pool settings, etc.)
ALTER TABLE tenants 
  ADD COLUMN connection_options JSON NULL AFTER connection_string,
  COMMENT 'Database-specific connection options: { ssl: {...}, timezone: "...", pool: {...}, etc. }';

-- Step 6: Add metadata JSON field (database-specific metadata)
ALTER TABLE tenants 
  ADD COLUMN metadata JSON NULL AFTER connection_options,
  COMMENT 'Database-specific metadata: { version: "...", features: [...], capabilities: {...} }';

-- Step 7: Add connection_type field (direct, connection_string, connection_options)
ALTER TABLE tenants 
  ADD COLUMN connection_type VARCHAR(20) NOT NULL DEFAULT 'direct' AFTER db_type,
  COMMENT 'Connection method: direct (host/port/user/pass), connection_string, or connection_options';

-- Step 8: Add status_reason field (why tenant is inactive/suspended)
ALTER TABLE tenants 
  ADD COLUMN status_reason TEXT NULL AFTER status,
  COMMENT 'Reason for current status (e.g., "License expired", "Maintenance")';

-- Step 10: Add last_connection_at and last_connection_error
ALTER TABLE tenants 
  ADD COLUMN last_connection_at DATETIME NULL AFTER updated_at,
  ADD COLUMN last_connection_error TEXT NULL AFTER last_connection_at,
  ADD INDEX idx_tenants_last_connection (last_connection_at);

-- Step 11: Add tags JSON field (for categorization/filtering)
ALTER TABLE tenants 
  ADD COLUMN tags JSON NULL AFTER last_connection_error,
  COMMENT 'Tags for categorization: ["production", "analytics", "backup"]';

-- Step 12: Update existing records
UPDATE tenants 
SET 
  db_type = 'SQL',
  connection_type = 'direct',
  connection_options = JSON_OBJECT(
    'ssl', JSON_OBJECT('require', true, 'rejectUnauthorized', false)
  )
WHERE dialect IN ('mysql', 'mssql');

-- Step 13: Add comments to existing columns for clarity
ALTER TABLE tenants 
  MODIFY COLUMN db_host VARCHAR(255) NULL COMMENT 'Database host (for direct connections)',
  MODIFY COLUMN db_port INT NULL COMMENT 'Database port (for direct connections)',
  MODIFY COLUMN db_user VARCHAR(255) NULL COMMENT 'Database user (for direct connections)',
  MODIFY COLUMN db_password TEXT NULL COMMENT 'Encrypted database password (AES-256-GCM)',
  MODIFY COLUMN db_name VARCHAR(255) NULL COMMENT 'Database name (for direct connections)';

-- Note: After running this migration:
-- 1. Update Tenant model to use new fields
-- 2. Update validation logic in tenantService
-- 3. Existing tenants will continue to work (backward compatible)
-- 4. New tenants can use connection_string or connection_options

