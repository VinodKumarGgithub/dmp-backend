-- Migration: Create organizations table for white labeling
-- This migration creates the organizations table with subdomain-based branding

-- Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id VARCHAR(255) PRIMARY KEY COMMENT 'Internal organization ID (matches organization_id in other tables)',
  subdomain VARCHAR(255) NOT NULL UNIQUE COMMENT 'Public subdomain identifier (e.g., acme for acme.app.com)',
  name VARCHAR(255) NOT NULL COMMENT 'Organization display name',
  logo_url TEXT COMMENT 'Logo URL or base64',
  primary_color VARCHAR(7) DEFAULT '#1890ff' COMMENT 'Primary brand color (hex)',
  app_name VARCHAR(255) COMMENT 'Custom app name (defaults to env var if null)',
  branding_json TEXT COMMENT 'JSON: { app_short_name, favicon_url, custom_css, etc. }',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_subdomain (subdomain),
  INDEX idx_id (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Note: After creating organizations, you need to:
-- 1. Create organization records for each existing organization_id
-- 2. Set subdomain for each organization
-- 3. Configure branding (logo, colors, app_name, etc.)
--
-- Example:
-- INSERT INTO organizations (id, subdomain, name, primary_color, app_name)
-- VALUES ('org_123', 'acme', 'Acme Corporation', '#FF5733', 'Acme Portal');

