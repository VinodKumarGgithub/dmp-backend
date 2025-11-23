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
  sql_hash: {
    // SHA-256 hash of the executed SQL for privacy
    type: DataTypes.STRING,
    allowNull: false,
    index: true
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
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'query_audit_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { fields: ['page_key', 'created_at'] },
    { fields: ['tenant_id', 'created_at'] },
    { fields: ['user_id', 'created_at'] },
    { fields: ['created_at'] }
  ]
});

module.exports = { QueryAuditLog };

