const { DataTypes } = require('sequelize');
const { masterSequelize } = require('../config/db');

const Organization = masterSequelize.define('organization', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false,
    comment: 'Internal organization ID (matches organization_id in other tables)'
  },
  subdomain: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      is: {
        args: /^[a-z0-9][a-z0-9_-]{0,62}$/i,
        msg: 'Subdomain must be 1-63 characters, alphanumeric with hyphens/underscores'
      },
      notIn: {
        args: [['www', 'api', 'admin', 'app', 'mail', 'ftp', 'localhost']],
        msg: 'Subdomain is reserved'
      }
    },
    comment: 'Public subdomain identifier (e.g., acme for acme.app.com)'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Organization display name'
  },
  // Branding fields
  logo_url: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Logo URL or base64'
  },
  primary_color: {
    type: DataTypes.STRING(7),
    allowNull: true,
    defaultValue: '#1890ff',
    comment: 'Primary brand color (hex)'
  },
  app_name: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Custom app name (defaults to env var if null)'
  },
  // Flexible JSON for future extensions
  branding_json: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON: { app_short_name, favicon_url, custom_css, etc. }'
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
  tableName: 'organizations',
  timestamps: false,
  indexes: [
    { fields: ['subdomain'], unique: true },
    { fields: ['id'] }
  ]
});

module.exports = { Organization };

