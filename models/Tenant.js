const { DataTypes } = require('sequelize');
const { masterSequelize } = require('../config/db');

const Tenant = masterSequelize.define('tenant', {
  id: { 
    type: DataTypes.STRING, 
    primaryKey: true,
    allowNull: false
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
    type: DataTypes.STRING, 
    allowNull: false 
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
  tableName: 'tenants'
});

module.exports = Tenant;
