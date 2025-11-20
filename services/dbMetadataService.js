const { fromCode } = require('../utils/errors');
const { mapDbError } = require('../utils/dbErrorMapper');

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
      return results.map(row => ({
        name: row.name,
        type: row.type
      }));
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

      return results.map(col => ({
        name: col.name,
        type: this.mapDataType(col.type),
        nullable: col.nullable === 'YES',
        default_value: col.default_value,
        max_length: col.max_length
      }));
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

      return indexMap;
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

