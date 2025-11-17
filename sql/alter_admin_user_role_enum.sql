-- Alter admin_users table to update role ENUM values
-- This query updates the role column to include ADMIN, MANAGER, and USER

ALTER TABLE `admin_users` 
MODIFY COLUMN `role` ENUM('ADMIN', 'MANAGER', 'USER') NOT NULL DEFAULT 'USER';

-- Note: If the table doesn't exist yet, you can create it with:
CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(255) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('ADMIN', 'MANAGER', 'USER') NOT NULL DEFAULT 'USER',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
);

