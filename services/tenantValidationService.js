/**
 * Tenant Validation Service
 * Validates tenant configuration based on database type and connection method
 */
const { fromCode } = require('../utils/errors');

class TenantValidationService {
  /**
   * Get list of supported database dialects
   * @returns {Array<string>} Array of supported dialect names
   */
  static getSupportedDialects() {
    return ['mysql', 'mariadb', 'mssql', 'sqlserver'];
  }

  /**
   * Check if a dialect is supported
   * @param {string} dialect - Database dialect to check
   * @returns {boolean} True if supported, false otherwise
   */
  static isSupported(dialect) {
    if (!dialect) return false;
    const supported = this.getSupportedDialects();
    const normalizedDialect = dialect.toLowerCase();
    return supported.includes(normalizedDialect) || 
           (normalizedDialect === 'mariadb' && supported.includes('mysql')) ||
           (normalizedDialect === 'sqlserver' && supported.includes('mssql'));
  }

  /**
   * Validate tenant configuration based on database type
   * @param {Object} tenant - Tenant configuration
   * @throws {Error} If validation fails
   */
  static validate(tenant) {
    const { dialect, db_type, connection_type, connection_options } = tenant;
    
    // Check if dialect is supported
    if (!dialect) {
      throw fromCode('DB_INVALID_CONFIG', ['Database dialect is required']);
    }
    
    if (!this.isSupported(dialect)) {
      throw fromCode('UNSUPPORTED_DIALECT');
    }
    
    // Validate connection method
    if (connection_type === 'connection_string') {
      if (!tenant.connection_string) {
        throw fromCode('DB_INVALID_CONFIG', [
          'connection_string is required when connection_type is "connection_string"'
        ]);
      }
    } else if (connection_type === 'direct') {
      // For SQL databases, require host/port/user/pass/name
      const detectedType = db_type || this.detectDbType(dialect);
      if (detectedType === 'SQL') {
        this.validateSQLConnection(tenant);
      } else {
        // For NoSQL, requirements vary by database
        this.validateNoSQLConnection(tenant, dialect);
      }
    } else if (connection_type && connection_type !== 'connection_options') {
      throw fromCode('DB_INVALID_CONFIG', [
        `Invalid connection_type: ${connection_type}. Must be 'direct', 'connection_string', or 'connection_options'`
      ]);
    }
    
    // Validate connection_options structure if provided
    if (connection_options) {
      this.validateConnectionOptions(dialect, connection_options);
    }
  }
  
  /**
   * Validate SQL connection requirements
   */
  static validateSQLConnection(tenant) {
    const required = ['db_host', 'db_port', 'db_user', 'db_password', 'db_name'];
    const missing = required.filter(field => !tenant[field]);
    
    if (missing.length > 0) {
      throw fromCode('DB_INVALID_CONFIG', [
        `Missing required fields for SQL database: ${missing.join(', ')}`
      ]);
    }
    
    // Validate port is a number
    if (tenant.db_port && (isNaN(tenant.db_port) || tenant.db_port < 1 || tenant.db_port > 65535)) {
      throw fromCode('DB_INVALID_CONFIG', [
        'db_port must be a number between 1 and 65535'
      ]);
    }
  }
  
  /**
   * Validate NoSQL connection requirements
   */
  static validateNoSQLConnection(tenant, dialect) {
    // MongoDB requires host, port, db_name
    if (dialect === 'mongodb') {
      if (!tenant.db_host || !tenant.db_name) {
        throw fromCode('DB_INVALID_CONFIG', [
          'MongoDB requires db_host and db_name for direct connections'
        ]);
      }
      // Port defaults to 27017 if not provided
    }
    // Add validation for other NoSQL databases as needed
  }
  
  /**
   * Validate connection options structure
   */
  static validateConnectionOptions(dialect, options) {
    if (typeof options !== 'object' || Array.isArray(options)) {
      throw fromCode('DB_INVALID_CONFIG', [
        'connection_options must be a JSON object'
      ]);
    }
    
    // Validate SSL options if provided
    if (options.ssl && typeof options.ssl !== 'object') {
      throw fromCode('DB_INVALID_CONFIG', [
        'connection_options.ssl must be an object'
      ]);
    }
    
    // Validate pool options if provided
    if (options.pool && typeof options.pool !== 'object') {
      throw fromCode('DB_INVALID_CONFIG', [
        'connection_options.pool must be an object'
      ]);
    }
  }
  
  /**
   * Detect database type from dialect
   */
  static detectDbType(dialect) {
    const sqlDialects = [
      'mysql', 'mariadb', 'postgres', 'postgresql', 'mssql', 'sqlserver',
      'oracle', 'sqlite', 'db2', 'snowflake'
    ];
    return sqlDialects.includes(dialect.toLowerCase()) ? 'SQL' : 'NoSQL';
  }
  
  /**
   * Get default port for a dialect
   */
  static getDefaultPort(dialect) {
    const defaults = {
      mysql: 3306,
      mariadb: 3306,
      postgres: 5432,
      postgresql: 5432,
      mssql: 1433,
      sqlserver: 1433,
      oracle: 1521,
      mongodb: 27017,
      redis: 6379
    };
    return defaults[dialect.toLowerCase()] || null;
  }
}

module.exports = TenantValidationService;

