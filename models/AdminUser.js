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
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'master_users',
  timestamps: false
});

module.exports = { AdminUser };


