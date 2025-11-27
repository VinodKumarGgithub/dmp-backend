-- Migration: Add organization_id support to all tables
-- This migration adds organization_id field to all models and updates constraints
-- Run this script on your master database

-- Step 1: Update role ENUM to include SUPER_ADMIN
ALTER TABLE master_users MODIFY COLUMN role ENUM('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER', 'DEVELOPER') NOT NULL DEFAULT 'USER';

-- Step 2: Add organization_id to master_users table (after id)
ALTER TABLE master_users ADD COLUMN organization_id VARCHAR(255) NULL AFTER id;
CREATE INDEX idx_master_users_organization_id ON master_users(organization_id);

-- Step 3: Add organization_id to tenants table (after id)
ALTER TABLE tenants ADD COLUMN organization_id VARCHAR(255) NOT NULL AFTER id;
CREATE INDEX idx_tenants_organization_id ON tenants(organization_id);

-- Step 4: Add organization_id to page_configs table (after id)
ALTER TABLE page_configs ADD COLUMN organization_id VARCHAR(255) NULL AFTER id;
CREATE INDEX idx_page_configs_organization_id ON page_configs(organization_id);

-- Step 5: Add organization_id to user_page_permissions table (after id)
ALTER TABLE user_page_permissions ADD COLUMN organization_id VARCHAR(255) NOT NULL AFTER id;
CREATE INDEX idx_user_page_permissions_organization_id ON user_page_permissions(organization_id);

-- Drop old unique constraint and add new one with organization_id
-- Note: Adjust constraint name based on your actual constraint name
ALTER TABLE user_page_permissions DROP INDEX IF EXISTS user_page_permissions_user_id_page_key_unique;
ALTER TABLE user_page_permissions ADD UNIQUE KEY unique_user_org_page (user_id, organization_id, page_key);

-- Step 6: Add organization_id to user_page_preferences table (after id)
ALTER TABLE user_page_preferences ADD COLUMN organization_id VARCHAR(255) NOT NULL AFTER id;
CREATE INDEX idx_user_page_preferences_organization_id ON user_page_preferences(organization_id);

-- Drop old unique constraint and add new one with organization_id
ALTER TABLE user_page_preferences DROP INDEX IF EXISTS user_page_preferences_user_id_page_key_unique;
ALTER TABLE user_page_preferences ADD UNIQUE KEY unique_user_org_page_pref (user_id, organization_id, page_key);

-- Step 7: Add organization_id to user_preferences table (after id)
ALTER TABLE user_preferences ADD COLUMN organization_id VARCHAR(255) NOT NULL AFTER id;
CREATE INDEX idx_user_preferences_organization_id ON user_preferences(organization_id);

-- Drop old unique constraint and add new one with organization_id
ALTER TABLE user_preferences DROP INDEX IF EXISTS user_preferences_user_id_unique;
ALTER TABLE user_preferences ADD UNIQUE KEY unique_user_org_pref (user_id, organization_id);

-- Step 8: Add organization_id to user_tenant_permissions table (after id)
ALTER TABLE user_tenant_permissions ADD COLUMN organization_id VARCHAR(255) NOT NULL AFTER id;
CREATE INDEX idx_user_tenant_permissions_organization_id ON user_tenant_permissions(organization_id);

-- Drop old unique constraint and add new one with organization_id
ALTER TABLE user_tenant_permissions DROP INDEX IF EXISTS user_tenant_permissions_user_id_tenant_id_unique;
ALTER TABLE user_tenant_permissions ADD UNIQUE KEY unique_user_org_tenant (user_id, organization_id, tenant_id);

-- Step 9: Add organization_id to query_audit_logs table (after id)
ALTER TABLE query_audit_logs ADD COLUMN organization_id VARCHAR(255) NULL AFTER id;
CREATE INDEX idx_query_audit_logs_organization_id ON query_audit_logs(organization_id);

-- Note: After running this migration, you may need to:
-- 1. Backfill organization_id for existing records (if not starting fresh)
-- 2. Update existing data to assign organization_id values
-- 3. For SUPER_ADMIN users, organization_id should remain NULL

