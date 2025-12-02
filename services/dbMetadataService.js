const { fromCode } = require('../utils/errors');
const { mapDbError } = require('../utils/dbErrorMapper');
const { cacheService } = require('./cacheService');
const { CACHE } = require('../config/constants');

const dbMetadataService = {
  /**
   * Get list of tables, views, and procedures from tenant database
   * @param {Object} sequelize - Sequelize instance for tenant database
   * @returns {Promise<Array>} Array of objects with name and type { name, type }
   */
  async getTables(sequelize) {
    if (!sequelize) {
      throw fromCode('TENANT_DB_NOT_AVAILABLE', ['Database connection not available']);
    }

    // Get database name for cache key
    const dbName = sequelize.config.database || 'unknown';
    const cacheKey = cacheService.key('metadata', 'tables', dbName);
    
    // Try cache first
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const dialect = sequelize.getDialect();
      let query;

      if (dialect === 'mysql') {
        query = `
          (
            SELECT TABLE_NAME AS name,
                   CASE 
                     WHEN TABLE_TYPE = 'BASE TABLE' THEN 'TABLE'
                     WHEN TABLE_TYPE = 'VIEW' THEN 'VIEW'
                     ELSE TABLE_TYPE
                   END AS type
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
            AND (TABLE_TYPE = 'BASE TABLE' OR TABLE_TYPE = 'VIEW')
          )
          UNION ALL
          (
            SELECT ROUTINE_NAME AS name,
                   CASE 
                     WHEN ROUTINE_TYPE = 'PROCEDURE' THEN 'PROCEDURE'
                     WHEN ROUTINE_TYPE = 'FUNCTION' THEN 'FUNCTION'
                     ELSE ROUTINE_TYPE
                   END AS type
            FROM INFORMATION_SCHEMA.ROUTINES
            WHERE ROUTINE_SCHEMA = DATABASE()
            AND ROUTINE_TYPE = 'PROCEDURE'
          )
          ORDER BY name
        `;
      } else if (dialect === 'mssql') {
        query = `
          (
            SELECT TABLE_NAME AS name,
                   CASE 
                     WHEN TABLE_TYPE = 'BASE TABLE' THEN 'TABLE'
                     WHEN TABLE_TYPE = 'VIEW' THEN 'VIEW'
                     ELSE TABLE_TYPE
                   END AS type
            FROM INFORMATION_SCHEMA.TABLES
            WHERE (TABLE_TYPE = 'BASE TABLE' OR TABLE_TYPE = 'VIEW')
          )
          UNION ALL
          (
            SELECT ROUTINE_NAME AS name,
                   CASE 
                     WHEN ROUTINE_TYPE = 'PROCEDURE' THEN 'PROCEDURE'
                     WHEN ROUTINE_TYPE = 'FUNCTION' THEN 'FUNCTION'
                     ELSE ROUTINE_TYPE
                   END AS type
            FROM INFORMATION_SCHEMA.ROUTINES
            WHERE ROUTINE_TYPE = 'PROCEDURE'
          )
          ORDER BY name
        `;
      } else {
        throw fromCode('UNSUPPORTED_DIALECT', [`Unsupported database dialect: ${dialect}`]);
      }

      const results = await sequelize.query(query, {
        type: sequelize.QueryTypes.SELECT
      });

      // Return array of objects with name and type
      const tables = results.map(row => ({
        name: row.name,
        type: row.type
      }));
      
      // Cache results (30 minutes TTL)
      await cacheService.set(cacheKey, tables, CACHE.METADATA_TTL);
      
      return tables;
    } catch (error) {
      if (error.code) throw error;
      throw mapDbError(error);
    }
  },

  /**
   * Get columns from a specific table or view
   * @param {Object} sequelize - Sequelize instance for tenant database
   * @param {string} tableName - Name of the table or view
   * @returns {Promise<Array>} Array of column information
   */
  async getTableColumns(sequelize, tableName) {
    if (!sequelize) {
      throw fromCode('TENANT_DB_NOT_AVAILABLE', ['Database connection not available']);
    }

    if (!tableName || typeof tableName !== 'string') {
      throw fromCode('VALIDATION_ERROR', ['Table or view name is required']);
    }

    // Validate table/view name to prevent SQL injection
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      throw fromCode('VALIDATION_ERROR', ['Invalid table or view name format']);
    }

    // Get database name for cache key
    const dbName = sequelize.config.database || 'unknown';
    const cacheKey = cacheService.key('metadata', 'columns', dbName, tableName);
    
    // Try cache first
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const dialect = sequelize.getDialect();
      let query;

      if (dialect === 'mysql') {
        query = `
          SELECT 
            COLUMN_NAME as name,
            DATA_TYPE as type,
            IS_NULLABLE as nullable,
            COLUMN_DEFAULT as default_value,
            CHARACTER_MAXIMUM_LENGTH as max_length
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = :tableName
          ORDER BY ORDINAL_POSITION
        `;
      } else if (dialect === 'mssql') {
        query = `
          SELECT 
            COLUMN_NAME as name,
            DATA_TYPE as type,
            IS_NULLABLE as nullable,
            COLUMN_DEFAULT as default_value,
            CHARACTER_MAXIMUM_LENGTH as max_length
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = :tableName
          ORDER BY ORDINAL_POSITION
        `;
      } else {
        throw fromCode('UNSUPPORTED_DIALECT', [`Unsupported database dialect: ${dialect}`]);
      }

      const results = await sequelize.query(query, {
        type: sequelize.QueryTypes.SELECT,
        replacements: { tableName }
      });

      const columns = results.map(col => ({
        name: col.name,
        type: this.mapDataType(col.type),
        nullable: col.nullable === 'YES',
        default_value: col.default_value,
        max_length: col.max_length
      }));
      
      // Cache results (30 minutes TTL)
      await cacheService.set(cacheKey, columns, CACHE.METADATA_TTL);
      
      return columns;
    } catch (error) {
      if (error.code) throw error;
      throw mapDbError(error);
    }
  },

  /**
   * Get index information for columns in a table or view
   * Note: Views typically don't have indexes, but this method works for tables
   * @param {Object} sequelize - Sequelize instance for tenant database
   * @param {string} tableName - Name of the table or view
   * @returns {Promise<Object>} Object mapping column names to index information
   */
  async getTableIndexes(sequelize, tableName) {
    if (!sequelize) {
      throw fromCode('TENANT_DB_NOT_AVAILABLE', ['Database connection not available']);
    }

    if (!tableName || typeof tableName !== 'string') {
      throw fromCode('VALIDATION_ERROR', ['Table or view name is required']);
    }

    // Validate table/view name to prevent SQL injection
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      throw fromCode('VALIDATION_ERROR', ['Invalid table or view name format']);
    }

    // Get database name for cache key
    const dbName = sequelize.config.database || 'unknown';
    const cacheKey = cacheService.key('metadata', 'indexes', dbName, tableName);
    
    // Try cache first
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const dialect = sequelize.getDialect();
      let query;

      if (dialect === 'mysql') {
        query = `
          SELECT 
            COLUMN_NAME as column_name,
            INDEX_NAME as index_name,
            NON_UNIQUE as non_unique,
            SEQ_IN_INDEX as seq_in_index
          FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = :tableName
          AND INDEX_NAME != 'PRIMARY'
          ORDER BY COLUMN_NAME, SEQ_IN_INDEX
        `;
      } else if (dialect === 'mssql') {
        query = `
          SELECT 
            c.COLUMN_NAME as column_name,
            i.name as index_name,
            i.is_unique as is_unique,
            ic.key_ordinal as seq_in_index
          FROM INFORMATION_SCHEMA.COLUMNS c
          LEFT JOIN sys.indexes i ON OBJECT_ID(c.TABLE_NAME) = i.object_id
          LEFT JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
            AND c.ORDINAL_POSITION = ic.column_id
          WHERE c.TABLE_NAME = :tableName
          AND i.name IS NOT NULL
          AND i.is_primary_key = 0
          ORDER BY c.COLUMN_NAME, ic.key_ordinal
        `;
      } else {
        throw fromCode('UNSUPPORTED_DIALECT', [`Unsupported database dialect: ${dialect}`]);
      }

      const results = await sequelize.query(query, {
        type: sequelize.QueryTypes.SELECT,
        replacements: { tableName }
      });

      // Build a map of column names to index information
      const indexMap = {};
      results.forEach(row => {
        const colName = row.column_name;
        if (!indexMap[colName]) {
          indexMap[colName] = {
            hasIndex: true,
            isUnique: dialect === 'mysql' ? row.non_unique === 0 : row.is_unique === 1,
            indexName: row.index_name
          };
        }
      });

      // Cache results (30 minutes TTL)
      await cacheService.set(cacheKey, indexMap, CACHE.METADATA_TTL);
      
      return indexMap;
    } catch (error) {
      if (error.code) throw error;
      throw mapDbError(error);
    }
  },

  /**
   * Get parameters for a stored procedure
   * @param {Object} sequelize - Sequelize instance for tenant database
   * @param {string} procedureName - Name of the stored procedure
   * @returns {Promise<Array>} Array of parameter information { name, type, nullable, default_value }
   */
  async getProcedureParameters(sequelize, procedureName) {
    if (!sequelize) {
      throw fromCode('TENANT_DB_NOT_AVAILABLE', ['Database connection not available']);
    }

    if (!procedureName || typeof procedureName !== 'string') {
      throw fromCode('VALIDATION_ERROR', ['Procedure name is required']);
    }

    // Validate procedure name to prevent SQL injection
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(procedureName)) {
      throw fromCode('VALIDATION_ERROR', ['Invalid procedure name format']);
    }

    // Get database name for cache key
    const dbName = sequelize.config.database || 'unknown';
    const cacheKey = cacheService.key('metadata', 'params', dbName, procedureName);
    
    // Try cache first
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const dialect = sequelize.getDialect();
      let query;

      if (dialect === 'mysql') {
        // MySQL INFORMATION_SCHEMA.PARAMETERS doesn't have PARAMETER_DEFAULT column
        // Default values are not available through INFORMATION_SCHEMA for MySQL procedures
        // Users will need to set default values manually in the UI
        query = `
          SELECT 
            PARAMETER_NAME as name,
            DATA_TYPE as type,
            NULL as default_value,
            PARAMETER_MODE as mode,
            ORDINAL_POSITION as ordinal_position
          FROM INFORMATION_SCHEMA.PARAMETERS
          WHERE SPECIFIC_SCHEMA = DATABASE()
          AND SPECIFIC_NAME = :procedureName
          AND PARAMETER_MODE = 'IN'
          ORDER BY ORDINAL_POSITION
        `;
      } else if (dialect === 'mssql') {
        query = `
          SELECT 
            p.name as name,
            t.name as type,
            p.is_nullable as nullable,
            ISNULL(OBJECT_DEFINITION(p.default_object_id), '') as default_value,
            'IN' as mode
          FROM sys.parameters p
          INNER JOIN sys.types t ON p.user_type_id = t.user_type_id
          INNER JOIN sys.objects o ON p.object_id = o.object_id
          WHERE o.name = :procedureName
          AND o.type = 'P'
          AND p.parameter_id > 0
          ORDER BY p.parameter_id
        `;
      } else {
        throw fromCode('UNSUPPORTED_DIALECT', [`Unsupported database dialect: ${dialect}`]);
      }

      const results = await sequelize.query(query, {
        type: sequelize.QueryTypes.SELECT,
        replacements: { procedureName }
      });

      return results.map(param => {
        // For MySQL, IS_NULLABLE doesn't exist in PARAMETERS table
        // We can infer nullability: if default_value is NULL, parameter is likely nullable
        // For SQL Server, we have is_nullable directly
        const nullable = dialect === 'mysql' 
          ? (param.default_value === null || param.default_value === 'NULL')
          : (param.nullable === 'YES' || param.nullable === 1 || param.nullable === true);
        
        return {
          name: param.name,
          type: this.mapDataType(param.type),
          nullable: nullable,
          default_value: param.default_value && param.default_value !== 'NULL' ? param.default_value : null,
          mode: param.mode || 'IN'
        };
      });
      
      // Cache results (30 minutes TTL)
      await cacheService.set(cacheKey, params, CACHE.METADATA_TTL);
      
      return params;
    } catch (error) {
      if (error.code) throw error;
      throw mapDbError(error);
    }
  },

  /**
   * Get approximate row count from metadata (faster than COUNT(*) on large tables)
   * Works for tables. For views, returns null as views don't have metadata row counts.
   * @param {Object} sequelize - Sequelize instance for tenant database
   * @param {string} tableName - Name of the table or view
   * @param {string} sourceType - Type of source: 'TABLE', 'VIEW', or 'PROCEDURE'
   * @returns {Promise<number|null>} Approximate row count or null if not available
   */
  async getTableRowCount(sequelize, tableName, sourceType = 'TABLE') {
    if (!sequelize) {
      throw fromCode('TENANT_DB_NOT_AVAILABLE', ['Database connection not available']);
    }

    if (!tableName || typeof tableName !== 'string') {
      throw fromCode('VALIDATION_ERROR', ['Table name is required']);
    }

    // Validate table name to prevent SQL injection
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      throw fromCode('VALIDATION_ERROR', ['Invalid table name format']);
    }

    // Views and procedures don't have metadata row counts
    if (sourceType === 'VIEW' || sourceType === 'PROCEDURE') {
      return null;
    }

    // Get database name for cache key
    const dbName = sequelize.config.database || 'unknown';
    const cacheKey = cacheService.key('metadata', 'rowcount', dbName, tableName);
    
    // Try cache first
    const cached = await cacheService.get(cacheKey);
    if (cached !== null) {
      return cached;
    }

    try {
      const dialect = sequelize.getDialect();
      let query;

      if (dialect === 'mysql') {
        query = `
          SELECT TABLE_ROWS as row_count
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = :tableName
          AND TABLE_TYPE = 'BASE TABLE'
        `;
      } else if (dialect === 'mssql') {
        query = `
          SELECT SUM(p.rows) as row_count
          FROM sys.tables t
          INNER JOIN sys.partitions p ON t.object_id = p.object_id
          WHERE t.name = :tableName
          AND p.index_id IN (0, 1)
          GROUP BY t.name
        `;
      } else {
        throw fromCode('UNSUPPORTED_DIALECT', [`Unsupported database dialect: ${dialect}`]);
      }

      const results = await sequelize.query(query, {
        type: sequelize.QueryTypes.SELECT,
        replacements: { tableName }
      });

      let rowCount = null;
      if (Array.isArray(results) && results.length > 0 && results[0].row_count !== null) {
        rowCount = parseInt(results[0].row_count, 10) || 0;
      }
      
      // Cache results (30 minutes TTL, even if null)
      await cacheService.set(cacheKey, rowCount, CACHE.METADATA_TTL);
      
      return rowCount;
    } catch (error) {
      if (error.code) throw error;
      throw mapDbError(error);
    }
  },

  /**
   * Map database-specific data types to generic types
   * @param {string} dbType - Database-specific type
   * @returns {string} Generic type (string, number, date, boolean)
   */
  mapDataType(dbType) {
    if (!dbType) return 'string';
    
    const type = dbType.toLowerCase();
    
    // Date types
    if (type.includes('date') || type.includes('time') || type.includes('timestamp')) {
      return 'date';
    }
    
    // Number types
    if (type.includes('int') || type.includes('decimal') || type.includes('float') || 
        type.includes('double') || type.includes('numeric') || type.includes('real') ||
        type.includes('money') || type.includes('smallmoney')) {
      return 'number';
    }
    
    // Boolean types
    if (type.includes('bit') || type.includes('bool')) {
      return 'boolean';
    }
    
    // Default to string
    return 'string';
  }
};

module.exports = { dbMetadataService };

