const { DataTypes } = require('sequelize');
const { masterSequelize } = require('../config/db');

// Admin users in master DB to control tenant registry
const AdminUser = masterSequelize.define('master_user', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password_hash: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('ADMIN', 'MANAGER', 'USER'),
    allowNull: false,
    defaultValue: 'USER'
  },
  is_blocked: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  blocked_reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  blocked_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  createdon: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'createdon'
  },
  updatedon: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'updatedon'
  }
}, {
  tableName: 'master_users',
  timestamps: false
});

// DO NOT use sync({ alter: true }) in production - it can cause issues with existing tables
// Use migrations instead. This sync is disabled to prevent "Too many keys" errors.
// AdminUser.sync({ alter: true });

module.exports = { AdminUser };


