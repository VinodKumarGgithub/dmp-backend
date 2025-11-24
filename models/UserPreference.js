const { DataTypes } = require('sequelize');
const { masterSequelize } = require('../config/db');

const UserPreference = masterSequelize.define('user_preference', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
  },
  preferences_json: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  createdon: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'createdon',
  },
  updatedon: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'updatedon',
  },
}, {
  tableName: 'user_preferences',
  timestamps: false,
  indexes: [
    { fields: ['user_id'], unique: true },
  ],
});

module.exports = { UserPreference };

