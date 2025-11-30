-- Migration: Add CUSTOM_QUERY support to page_configs
-- This migration:
-- 1. Makes data_source nullable (optional for CUSTOM_QUERY)
-- 2. Updates source_type ENUM to include CUSTOM_QUERY
-- Run this script on your master database

-- Step 1: Make data_source nullable (for CUSTOM_QUERY type)
ALTER TABLE page_configs MODIFY COLUMN data_source VARCHAR(100) NULL;

-- Step 2: Update source_type ENUM to include CUSTOM_QUERY
-- Note: MySQL doesn't support direct ENUM modification, so we need to:
-- 1. Add a temporary column
-- 2. Copy data
-- 3. Drop old column
-- 4. Rename new column

-- Check current ENUM values first (this is informational)
-- SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'page_configs' AND COLUMN_NAME = 'source_type';

-- Add temporary column with new ENUM
ALTER TABLE page_configs 
ADD COLUMN source_type_new ENUM('TABLE', 'VIEW', 'PROCEDURE', 'CUSTOM_QUERY') NOT NULL DEFAULT 'TABLE' 
AFTER source_type;

-- Copy data from old column to new column
UPDATE page_configs SET source_type_new = source_type;

-- Drop old column
ALTER TABLE page_configs DROP COLUMN source_type;

-- Rename new column to original name
ALTER TABLE page_configs CHANGE COLUMN source_type_new source_type ENUM('TABLE', 'VIEW', 'PROCEDURE', 'CUSTOM_QUERY') NOT NULL DEFAULT 'TABLE';

