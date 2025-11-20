const { fromCode } = require('../utils/errors');
const { mapDbError } = require('../utils/dbErrorMapper');
const { PageConfig } = require('../models/PageConfig');
const { dbMetadataService } = require('./dbMetadataService');

/**
 * Escape column/identifier names to handle reserved keywords
 * MySQL uses backticks, SQL Server uses square brackets
 */
function escapeIdentifier(sequelize, identifier) {
  if (!identifier || typeof identifier !== 'string') {
    return identifier;
  }
  
  const dialect = sequelize.getDialect();
  if (dialect === 'mysql') {
    return `\`${identifier}\``;
  } else if (dialect === 'mssql') {
    return `[${identifier}]`;
  }
  // For other dialects, return as-is (PostgreSQL uses double quotes)
  return identifier;
}

function parseJsonField(text, fallback) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch (e) {
    throw fromCode('PAGE_CONFIG_INVALID', [`Invalid JSON in page configuration: ${e.message}`]);
  }
}

const pageService = {
  async listPages() {
    try {
      const pages = await PageConfig.findAll({
        attributes: ['page_key', 'title', 'is_download_allowed']
      });
      return pages;
    } catch (error) {
      if (error.code) throw error; // Already mapped
      throw mapDbError(error);
    }
  },

  async getPageConfigByKey(pageKey) {
    if (!pageKey || typeof pageKey !== 'string') {
      throw fromCode('VALIDATION_ERROR', ['Page key is required and must be a string']);
    }

    try {
      const page = await PageConfig.findOne({ where: { page_key: pageKey } });
      if (!page) {
        throw fromCode('PAGE_NOT_FOUND', [`Page config not found for key: ${pageKey}`]);
      }

      try {
        return {
          id: page.id,
          page_key: page.page_key,
          title: page.title,
          data_source: page.data_source,
          source_type: page.source_type || 'TABLE',
          source_params: parseJsonField(page.source_params_json, []),
          columns: parseJsonField(page.columns_json, []),
          searchable_fields: parseJsonField(page.searchable_fields_json, []),
          filterable_fields: parseJsonField(page.filterable_fields_json, []),
          is_download_allowed: page.is_download_allowed,
          default_sort: parseJsonField(page.default_sort_json, null),
          page_size_default: page.page_size_default
        };
      } catch (parseError) {
        // parseJsonField already throws PAGE_CONFIG_INVALID
        throw parseError;
      }
    } catch (error) {
      if (error.code) throw error; // Already mapped
      throw mapDbError(error);
    }
  },

  buildQuery(config, queryParams, sequelize) {
    if (!config || !config.data_source) {
      throw fromCode('PAGE_CONFIG_INVALID', ['Page configuration is missing data_source']);
    }

    const { columns, searchable_fields, filterable_fields, default_sort, data_source } = config;
    
    // Validate data_source is a safe identifier (alphanumeric, underscore, no SQL injection)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(data_source)) {
      throw fromCode('PAGE_DATA_SOURCE_INVALID', [`Invalid data source name: ${data_source}`]);
    }

    const { search, sortBy, sortOrder, page = 1, pageSize } = queryParams;

    // Validate pagination params
    // Use pageSize if provided, otherwise use config.page_size_default, fallback to 20
    const defaultPageSize = config.page_size_default || 20;
    let requestedPageSize = defaultPageSize;
    if (pageSize !== undefined && pageSize !== null && pageSize !== '') {
      const parsed = parseInt(pageSize, 10);
      if (!isNaN(parsed) && parsed > 0) {
        requestedPageSize = parsed;
      }
    }
    const limit = Math.min(Math.max(requestedPageSize, 1), 100); // cap between 1 and 100
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (pageNum - 1) * limit;

    const where = [];
    const replacements = {};

    // Search across configured searchable fields
    if (search && typeof search === 'string' && search.trim()) {
      if (!Array.isArray(searchable_fields) || searchable_fields.length === 0) {
        throw fromCode('PAGE_CONFIG_INVALID', ['No searchable fields configured for this page']);
      }
      const likeClauses = [];
      searchable_fields.forEach((field, idx) => {
        // Validate field name is safe
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) {
          throw fromCode('PAGE_CONFIG_INVALID', [`Invalid searchable field name: ${field}`]);
        }
        const key = `search_${idx}`;
        const escapedField = sequelize ? escapeIdentifier(sequelize, field) : field;
        likeClauses.push(`${escapedField} LIKE :${key}`);
        replacements[key] = `%${search.trim()}%`;
      });
      if (likeClauses.length) {
        where.push(`(${likeClauses.join(' OR ')})`);
      }
    }

    // Filters based on filterable_fields config
    if (Array.isArray(filterable_fields)) {
      filterable_fields.forEach((f) => {
        if (!f || !f.name || typeof f.name !== 'string') {
          throw fromCode('PAGE_CONFIG_INVALID', ['Invalid filterable field configuration']);
        }
        // Validate field name is safe
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(f.name)) {
          throw fromCode('PAGE_CONFIG_INVALID', [`Invalid filterable field name: ${f.name}`]);
        }

        const value = queryParams[f.name];
        if (value === undefined || value === null || value === '') return;

        const paramKey = `f_${f.name}`;
        const escapedField = sequelize ? escapeIdentifier(sequelize, f.name) : f.name;
        switch (f.type) {
          case 'text':
          case 'string':
            where.push(`${escapedField} LIKE :${paramKey}`);
            replacements[paramKey] = `%${String(value)}%`;
            break;
          case 'select':
          case 'number':
            where.push(`${escapedField} = :${paramKey}`);
            replacements[paramKey] = value;
            break;
          default:
            where.push(`${escapedField} = :${paramKey}`);
            replacements[paramKey] = value;
        }
      });
    }

    // Sorting (whitelist field names if columns are specified, otherwise allow any field)
    const colNames = Array.isArray(columns) ? columns.map((c) => c && c.name).filter(Boolean) : [];
    let orderBy = '';
    if (sortBy && typeof sortBy === 'string') {
      // Validate field name is safe
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(sortBy)) {
        throw fromCode('VALIDATION_ERROR', [`Invalid sort field: ${sortBy}`]);
      }
      // If columns are specified, validate against them; otherwise allow any field
      if (colNames.length > 0 && !colNames.includes(sortBy)) {
        throw fromCode('VALIDATION_ERROR', [`Invalid sort field: ${sortBy}. Must be one of: ${colNames.join(', ')}`]);
      }
      const dir = (sortOrder || 'ASC').toString().toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      const escapedSortBy = sequelize ? escapeIdentifier(sequelize, sortBy) : sortBy;
      orderBy = `ORDER BY ${escapedSortBy} ${dir}`;
    } else if (default_sort && default_sort.field) {
      // Validate field name is safe
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(default_sort.field)) {
        throw fromCode('VALIDATION_ERROR', [`Invalid default sort field: ${default_sort.field}`]);
      }
      // If columns are specified, validate against them; otherwise allow any field
      if (colNames.length === 0 || colNames.includes(default_sort.field)) {
        const dir = (default_sort.order || 'ASC').toString().toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
        const escapedField = sequelize ? escapeIdentifier(sequelize, default_sort.field) : default_sort.field;
        orderBy = `ORDER BY ${escapedField} ${dir}`;
      }
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    return { whereClause, orderBy, limit, offset, replacements, data_source };
  },

  async getPageData(config, queryParams, reqDb) {
    // reqDb should be { sequelize, models, tenantId } from tenantResolver middleware
    if (!reqDb || !reqDb.sequelize) {
      throw fromCode('TENANT_DB_NOT_AVAILABLE');
    }

    const tenantSequelize = reqDb.sequelize;
    const { source_type = 'TABLE', source_params = [], data_source } = config;

    // Handle PROCEDURE type
    if (source_type === 'PROCEDURE') {
      try {
        // Build procedure parameters from config and query params
        const procedureParams = this.buildProcedureParams(source_params, queryParams);
        
        // Build procedure call - dialect specific
        const dialect = tenantSequelize.getDialect();
        let procedureCall;
        if (dialect === 'mysql') {
          // MySQL: CALL procedure_name(param1, param2, ...)
          const paramPlaceholders = procedureParams.map((_, idx) => `:param${idx}`).join(', ');
          procedureCall = `CALL ${data_source}(${paramPlaceholders})`;
        } else if (dialect === 'mssql') {
          // SQL Server: EXEC procedure_name @param1=value1, @param2=value2, ...
          const paramList = procedureParams.map((param, idx) => `@param${idx}=:param${idx}`).join(', ');
          procedureCall = `EXEC ${data_source} ${paramList}`;
        } else {
          throw fromCode('UNSUPPORTED_DIALECT', [`Unsupported database dialect: ${dialect}`]);
        }

        const procedureReplacements = {};
        procedureParams.forEach((param, idx) => {
          procedureReplacements[`param${idx}`] = param;
        });

        // Execute procedure
        const dataRows = await tenantSequelize.query(procedureCall, {
          replacements: procedureReplacements,
          type: tenantSequelize.QueryTypes.SELECT
        });

        // For procedures, we can't easily get count, so use data length
        // Apply pagination manually if needed
        const page = parseInt(queryParams.page || 1, 10);
        const defaultPageSize = config.page_size_default || 20;
        const requestedPageSize = queryParams.pageSize ? parseInt(queryParams.pageSize, 10) : defaultPageSize;
        const pageSize = Math.min(Math.max(parseInt(requestedPageSize, 10) || defaultPageSize, 1), 100);
        const offset = (page - 1) * pageSize;
        const paginatedData = Array.isArray(dataRows) ? dataRows.slice(offset, offset + pageSize) : [];
        const total = Array.isArray(dataRows) ? dataRows.length : 0;

        return { data: paginatedData, total };
      } catch (error) {
        if (error.code) throw error;
        throw mapDbError(error);
      }
    }

    // Handle TABLE and VIEW types
    let queryResult;
    try {
      queryResult = this.buildQuery(config, queryParams, tenantSequelize);
    } catch (error) {
      // buildQuery already throws mapped errors
      throw error;
    }

    const { whereClause, orderBy, limit, offset, replacements, data_source: queryDataSource } = queryResult;

    try {
      // Build the SQL queries
      // For views with parameters, we might need to handle them differently
      // For now, views are treated like tables
      const baseSql = `FROM ${queryDataSource} ${whereClause}`;
      const dataSql = `SELECT * ${baseSql} ${orderBy} LIMIT :limit OFFSET :offset`;

      // Execute data query
      const dataRows = await tenantSequelize.query(dataSql, {
        replacements: { ...replacements, limit, offset },
        type: tenantSequelize.QueryTypes.SELECT
      });

      const data = Array.isArray(dataRows) ? dataRows : [];

      // Get total count: always use metadata (never use COUNT(*) for performance)
      // For filtered queries, we still use metadata (approximate is better than expensive COUNT)
      let total = 0;
      try {
        const metadataCount = await dbMetadataService.getTableRowCount(tenantSequelize, queryDataSource, source_type);
        if (metadataCount !== null) {
          total = metadataCount;
        } else {
          // For views/procedures or when metadata not available, use a large default
          // This allows pagination to work, though total may be approximate
          // Frontend will handle "showing X-Y of many" appropriately
          total = 1000000; // Large default to indicate "many" records
        }
      } catch (metadataError) {
        // If metadata query fails, use large default
        total = 1000000;
      }

      return { data, total };
    } catch (error) {
      // Check for table/view not found errors
      const errorMessage = error.message || '';
      if (errorMessage.includes("doesn't exist") || 
          errorMessage.includes("does not exist") ||
          errorMessage.includes("Unknown table") ||
          errorMessage.includes("Invalid object name")) {
        throw fromCode('PAGE_DATA_SOURCE_INVALID', [`Data source '${data_source}' does not exist in tenant database`]);
      }
      
      // Check for SQL syntax errors
      if (errorMessage.includes("syntax") || 
          errorMessage.includes("SQL syntax") ||
          error.name === 'SequelizeDatabaseError') {
        throw fromCode('PAGE_QUERY_ERROR', [`Query execution failed: ${errorMessage}`]);
      }

      // Map other DB errors
      if (error.code) throw error; // Already mapped
      throw mapDbError(error);
    }
  },

  // Get all page data without pagination (for downloads)
  async getAllPageData(config, queryParams, reqDb) {
    // reqDb should be { sequelize, models, tenantId } from tenantResolver middleware
    if (!reqDb || !reqDb.sequelize) {
      throw fromCode('TENANT_DB_NOT_AVAILABLE');
    }

    const tenantSequelize = reqDb.sequelize;
    const { source_type = 'TABLE', source_params = [], data_source } = config;

    // Handle PROCEDURE type
    if (source_type === 'PROCEDURE') {
      try {
        // Build procedure parameters from config and query params
        const procedureParams = this.buildProcedureParams(source_params, queryParams);
        
        // Build procedure call - dialect specific
        const dialect = tenantSequelize.getDialect();
        let procedureCall;
        if (dialect === 'mysql') {
          const paramPlaceholders = procedureParams.map((_, idx) => `:param${idx}`).join(', ');
          procedureCall = `CALL ${data_source}(${paramPlaceholders})`;
        } else if (dialect === 'mssql') {
          const paramList = procedureParams.map((param, idx) => `@param${idx}=:param${idx}`).join(', ');
          procedureCall = `EXEC ${data_source} ${paramList}`;
        } else {
          throw fromCode('UNSUPPORTED_DIALECT', [`Unsupported database dialect: ${dialect}`]);
        }

        const procedureReplacements = {};
        procedureParams.forEach((param, idx) => {
          procedureReplacements[`param${idx}`] = param;
        });

        // Execute procedure
        const dataRows = await tenantSequelize.query(procedureCall, {
          replacements: procedureReplacements,
          type: tenantSequelize.QueryTypes.SELECT
        });

        const data = Array.isArray(dataRows) ? dataRows : [];
        return { data };
      } catch (error) {
        if (error.code) throw error;
        throw mapDbError(error);
      }
    }

    // Use buildQuery to ensure same conditions as getPageData (but without pagination)
    let queryResult;
    try {
      queryResult = this.buildQuery(config, queryParams, tenantSequelize);
    } catch (error) {
      // buildQuery already throws mapped errors
      throw error;
    }

    const { whereClause, orderBy, replacements, data_source: queryDataSource } = queryResult;
    const { columns } = config;

    // Extract and validate column names (optional - if not specified, use *)
    const colNames = Array.isArray(columns) && columns.length > 0
      ? columns
          .map((c) => c && c.name)
          .filter(Boolean)
          .filter((name) => {
            // Validate column name is safe (alphanumeric, underscore, no SQL injection)
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
              return false;
            }
            return true;
          })
      : [];

    try {
      // Build SQL query - use specific columns if provided, otherwise use *
      // Use same conditions from buildQuery (whereClause, orderBy, replacements) - no pagination
      // Escape column names to handle reserved keywords
      let selectColumns = '*';
      if (colNames.length > 0) {
        const escapedColumns = colNames.map(col => escapeIdentifier(tenantSequelize, col));
        selectColumns = escapedColumns.join(', ');
      }
      const dataSql = `SELECT ${selectColumns} FROM ${queryDataSource} ${whereClause} ${orderBy}`;

      // Execute query using req.db.sequelize.query to get all data
      // Sequelize query returns [results, metadata], so we destructure to get the results
      const dataRows = await tenantSequelize.query(dataSql, {
        replacements,
        type: tenantSequelize.QueryTypes.SELECT
      });

      // dataRows is already an array of row objects
      const data = Array.isArray(dataRows) ? dataRows : [];

      return { data };
    } catch (error) {
      // Check for table/view not found errors
      const errorMessage = error.message || '';
      if (errorMessage.includes("doesn't exist") || 
          errorMessage.includes("does not exist") ||
          errorMessage.includes("Unknown table") ||
          errorMessage.includes("Invalid object name")) {
        throw fromCode('PAGE_DATA_SOURCE_INVALID', [`Data source '${data_source}' does not exist in tenant database`]);
      }
      
      // Check for SQL syntax errors
      if (errorMessage.includes("syntax") || 
          errorMessage.includes("SQL syntax") ||
          error.name === 'SequelizeDatabaseError') {
        throw fromCode('PAGE_QUERY_ERROR', [`Query execution failed: ${errorMessage}`]);
      }

      // Map other DB errors
      if (error.code) throw error; // Already mapped
      throw mapDbError(error);
    }
  }
};

module.exports = { pageService };


