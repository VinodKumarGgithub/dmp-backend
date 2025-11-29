const { DataTypes } = require('sequelize');
const { masterSequelize } = require('../config/db');

const License = masterSequelize.define('license', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false
  },
  organization_id: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    comment: 'Organization/Client ID that this license belongs to'
  },
  license_key: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    comment: 'Unique license key for this organization'
  },
  instance_id: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Domain/IP bound to this license (optional instance binding)'
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'License expiration date'
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'EXPIRED', 'SUSPENDED', 'REVOKED'),
    defaultValue: 'ACTIVE',
    allowNull: false,
    comment: 'Current license status'
  },
  max_users: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Maximum number of users allowed (null = unlimited)'
  },
  max_tenants: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Maximum number of tenants allowed (null = unlimited)'
  },
  features: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Enabled features array (e.g., ["export", "custom_branding", "api_access"])'
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
  tableName: 'licenses',
  timestamps: false,
  indexes: [
    { fields: ['organization_id'], unique: true },
    { fields: ['license_key'], unique: true },
    { fields: ['status', 'expires_at'] },
    { fields: ['status'] }
  ]
});

module.exports = { License };

