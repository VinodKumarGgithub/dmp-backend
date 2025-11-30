const { DataTypes } = require('sequelize');
const { masterSequelize } = require('../config/db');

// Config for dynamic data pages - stored in master DB
const PageConfig = masterSequelize.define('page_config', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false
  },
  organization_id: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Organization/Client ID. NULL = available to all organizations'
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
    // table or view name in tenant DB (optional for CUSTOM_QUERY)
    type: DataTypes.STRING,
    allowNull: true
  },
  source_type:{
    type: DataTypes.ENUM('TABLE', 'VIEW', 'PROCEDURE', 'CUSTOM_QUERY'),
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
  download_row_limit: {
    // Optional cap on how many rows can be downloaded at once
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null
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
  },
  tenant_access_json: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON array of tenant IDs. NULL or empty = available to all tenants'
  }
}, {
  tableName: 'page_configs',
  timestamps: false,
  indexes: [
    { fields: ['organization_id'] },
  ]
});

module.exports = { PageConfig };


