const { DataTypes } = require('sequelize');
const { masterSequelize } = require('../config/db');

// Config for dynamic data pages - stored in master DB
const PageConfig = masterSequelize.define('page_config', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false
  },
  page_key: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  data_source: {
    // table or view name in tenant DB
    type: DataTypes.STRING,
    allowNull: false
  },
  source_type:{
    type: DataTypes.ENUM('TABLE', 'VIEW', 'PROCEDURE'),
    allowNull:false,
    defaultValue:'TABLE'
  },
  source_params_json: {
    // JSON string: [{ name, value, type? }] - parameters for views/procedures
    type: DataTypes.TEXT,
    allowNull: true
  },
  columns_json: {
    // JSON string: [{ name, label, type, width? }]
    type: DataTypes.TEXT,
    allowNull: false
  },
  searchable_fields_json: {
    // JSON string: ["field1","field2"]
    type: DataTypes.TEXT,
    allowNull: false
  },
  filterable_fields_json: {
    // JSON string: [{ name, label, type, options? }]
    type: DataTypes.TEXT,
    allowNull: false
  },
  is_download_allowed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  default_sort_json: {
    // JSON string: { field, order }
    type: DataTypes.TEXT,
    allowNull: true
  },
  page_size_default: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 20
  }
}, {
  tableName: 'page_configs',
  timestamps: false
});

module.exports = { PageConfig };


