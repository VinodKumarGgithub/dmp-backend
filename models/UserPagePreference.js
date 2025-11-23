const { DataTypes } = require('sequelize');
const { masterSequelize } = require('../config/db');

const UserPagePreference = masterSequelize.define('user_page_preference', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  page_key: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  table_columns_json: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  download_columns_json: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  createdOn: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updatedOn: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'user_page_preferences',
  timestamps: false,
  indexes: [
    { fields: ['user_id', 'page_key'], unique: true },
  ],
});

module.exports = { UserPagePreference };

