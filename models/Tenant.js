const { DataTypes } = require('sequelize');
const { masterSequelize } = require('../config/db');
const encryptionService = require('../services/encryptionService');

const Tenant = masterSequelize.define('tenant', {
  id: { 
    type: DataTypes.STRING, 
    primaryKey: true,
    allowNull: false
  },
  organization_id: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Organization/Client ID that this tenant belongs to'
  },
  name: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  dialect: {
    type: DataTypes.ENUM('mysql', 'mssql'),
    defaultValue: 'mysql',
    allowNull: false
  },
  db_host: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  db_port: { 
    type: DataTypes.INTEGER, 
    allowNull: false,
    defaultValue: 3306
  },
  db_user: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  db_password: { 
    type: DataTypes.TEXT, 
    allowNull: false,
    comment: 'Encrypted database password (AES-256-GCM)'
  },
  db_name: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED'),
    defaultValue: 'ACTIVE',
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  }
}, { 
  timestamps: false,
  tableName: 'tenants',
  indexes: [
    { fields: ['organization_id'] },
  ]
});

// Encryption hooks: Encrypt password before saving
Tenant.addHook('beforeSave', async (tenant) => {
  // Always check if password needs encryption (not just when "changed")
  // This handles cases where changed() doesn't detect the change properly
  if (tenant.db_password) {
    // Only encrypt if not already encrypted
    if (!encryptionService.isEncrypted(tenant.db_password)) {
      try {
        tenant.db_password = encryptionService.encrypt(tenant.db_password);
      } catch (error) {
        // Log error but don't fail save (allows migration to proceed)
        console.error(`Failed to encrypt password for tenant ${tenant.id}:`, error.message);
      }
    }
  }
});

// Decryption hook: Decrypt password after retrieving
Tenant.addHook('afterFind', async (tenants) => {
  if (!tenants) return;
  
  const tenantArray = Array.isArray(tenants) ? tenants : [tenants];
  
  tenantArray.forEach(tenant => {
    if (tenant && tenant.db_password) {
      // Ensure dataValues exists
      if (!tenant.dataValues) {
        tenant.dataValues = {};
      }
      
      try {
        // Decrypt password for use
        const decrypted = encryptionService.decrypt(tenant.db_password);
        tenant.dataValues.db_password = decrypted;
        // Also update the main object
        tenant.db_password = decrypted;
      } catch (error) {
        // If decryption fails, might be plain text (old record)
        // Log but don't fail - migration will handle it
        console.warn(`Failed to decrypt password for tenant ${tenant.id}:`, error.message);
      }
    }
  });
  
  return Array.isArray(tenants) ? tenants : tenants[0];
});

module.exports = Tenant;
