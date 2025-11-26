const { DataTypes } = require('sequelize');
const { masterSequelize } = require('../config/db');

const UserPagePermission = masterSequelize.define('user_page_permission', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  organization_id: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Organization/Client ID for this permission'
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  page_key: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  tableName: 'user_page_permissions',
  timestamps: false,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['organization_id'] },
    { fields: ['page_key'] },
    { fields: ['user_id', 'organization_id', 'page_key'], unique: true },
  ],
});

module.exports = { UserPagePermission };

