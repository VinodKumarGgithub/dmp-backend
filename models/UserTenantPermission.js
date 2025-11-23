const { DataTypes } = require('sequelize');
const { masterSequelize } = require('../config/db');

const UserTenantPermission = masterSequelize.define('user_tenant_permission', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  tenant_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  tableName: 'user_tenant_permissions',
  timestamps: false,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['tenant_id'] },
    { fields: ['user_id', 'tenant_id'], unique: true },
  ],
});

module.exports = { UserTenantPermission };

