const { DataTypes } = require('sequelize');
const { masterSequelize } = require('../config/db');

/**
 * Query Audit Log Model
 * Tracks all p_sql executions for security and debugging purposes
 */
const QueryAuditLog = masterSequelize.define('query_audit_log', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false
  },
  page_key: {
    type: DataTypes.STRING,
    allowNull: false,
    index: true
  },
  tenant_id: {
    type: DataTypes.STRING,
    allowNull: true,
    index: true
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: true,
    index: true
  },
  ip_address: {
    type: DataTypes.STRING,
    allowNull: true
  },
  encrypted_sql: {
    // AES-encrypted SQL text for troubleshooting
    type: DataTypes.TEXT,
    allowNull: true
  },
  execution_time_ms: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  rows_returned: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  success: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  query_params: {
    // JSON string of query parameters used
    type: DataTypes.TEXT,
    allowNull: true
  },
  action_type: {
    type: DataTypes.STRING,
    allowNull: true
  },
  severity: {
    type: DataTypes.STRING,
    allowNull: true
  },
  error_code: {
    type: DataTypes.STRING,
    allowNull: true
  },
  source_type: {
    type: DataTypes.STRING,
    allowNull: true
  },
  data_source: {
    type: DataTypes.STRING,
    allowNull: true
  },
  query_context: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  createdOn: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'query_audit_logs',
  timestamps: true,
  createdAt: 'createdOn',
  updatedAt: false,
  indexes: [
    { fields: ['page_key', 'createdOn'] },
    { fields: ['tenant_id', 'createdOn'] },
    { fields: ['user_id', 'createdOn'] },
    { fields: ['createdOn'] }
  ]
});

module.exports = { QueryAuditLog };

