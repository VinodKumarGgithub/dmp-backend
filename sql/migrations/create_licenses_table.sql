-- Migration: Create licenses table
-- Description: Stores license information for organizations
-- Date: 2024

CREATE TABLE IF NOT EXISTS licenses (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL UNIQUE,
  license_key VARCHAR(255) NOT NULL UNIQUE,
  instance_id VARCHAR(255) NULL COMMENT 'Domain/IP bound to this license (optional instance binding)',
  expires_at DATETIME NOT NULL COMMENT 'License expiration date',
  status ENUM('ACTIVE', 'EXPIRED', 'SUSPENDED', 'REVOKED') NOT NULL DEFAULT 'ACTIVE' COMMENT 'Current license status',
  max_users INT NULL COMMENT 'Maximum number of users allowed (NULL = unlimited)',
  max_tenants INT NULL COMMENT 'Maximum number of tenants allowed (NULL = unlimited)',
  features JSON NULL COMMENT 'Enabled features array (e.g., ["export", "custom_branding", "api_access"])',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_organization_id (organization_id),
  INDEX idx_license_key (license_key),
  INDEX idx_status_expires (status, expires_at),
  INDEX idx_status (status),
  
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

