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

    const { columns, searchable_fields, filterable_fields, default_sort, data_source, source_type = 'TABLE' } = config;
    
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

    // Search across configured searchable fields (or all columns if not configured for VIEWs)
    if (search && typeof search === 'string' && search.trim()) {
      let fieldsToSearch = searchable_fields;
      
      // For VIEWs, if no searchable_fields configured, we can't search in SQL
      // This will be handled in-memory after fetching data
      // For TABLEs, we still require searchable_fields to be configured
      if (!Array.isArray(fieldsToSearch) || fieldsToSearch.length === 0) {
        // For VIEWs, skip SQL search (will be done in-memory)
        // For TABLEs, throw error
        if (source_type === 'TABLE') {
          throw fromCode('PAGE_CONFIG_INVALID', ['No searchable fields configured for this page']);
        }
        // For VIEWs, skip SQL search - will be handled in-memory
        fieldsToSearch = [];
      }
      
      if (fieldsToSearch.length > 0) {
        const likeClauses = [];
        fieldsToSearch.forEach((field, idx) => {
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
    // For VIEWs, if columns aren't configured, we'll validate against actual data later
    const colNames = Array.isArray(columns) ? columns.map((c) => c && c.name).filter(Boolean) : [];
    let orderBy = '';
    if (sortBy && typeof sortBy === 'string') {
      // Validate field name is safe
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(sortBy)) {
        throw fromCode('VALIDATION_ERROR', [`Invalid sort field: ${sortBy}`]);
      }
      // If columns are specified, validate against them; otherwise allow any field (for VIEWs, will validate in-memory)
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

  /**
   * Build procedure parameters from config and query params
   * Merges default values from config with overrides from query params
   * Handles both 'value' and 'default_value' field names (frontend may use 'value')
   */
  buildProcedureParams(sourceParamsConfig, queryParams) {
    if (!Array.isArray(sourceParamsConfig) || sourceParamsConfig.length === 0) {
      return [];
    }

    return sourceParamsConfig.map((paramConfig) => {
      const paramName = paramConfig.name;
      // Check if query params override the default value
      if (queryParams && queryParams[paramName] !== undefined && queryParams[paramName] !== null) {
        // Convert based on type
        const paramType = paramConfig.type || 'string';
        let value = queryParams[paramName];
        
        if (paramType === 'number') {
          value = parseFloat(value);
          if (isNaN(value)) {
            // Try to get default from either 'default_value' or 'value' field
            const defaultValue = paramConfig.default_value !== undefined ? paramConfig.default_value : paramConfig.value;
            value = defaultValue !== undefined ? parseFloat(defaultValue) : null;
          }
        } else if (paramType === 'boolean') {
          value = value === 'true' || value === true || value === 1 || value === '1';
        } else if (paramType === 'date') {
          // Keep as string, database will handle conversion
          value = String(value);
        } else {
          value = String(value);
        }
        
        return value;
      }
      
      // Use default value from config (handle both 'default_value' and 'value' field names)
      const paramType = paramConfig.type || 'string';
      let defaultValue = paramConfig.default_value !== undefined ? paramConfig.default_value : paramConfig.value;
      
      if (defaultValue === undefined || defaultValue === null || defaultValue === '') {
        // Return null for missing defaults
        return null;
      }
      
      // Convert default value based on type
      if (paramType === 'number') {
        defaultValue = parseFloat(defaultValue);
        if (isNaN(defaultValue)) {
          return null;
        }
      } else if (paramType === 'boolean') {
        defaultValue = defaultValue === 'true' || defaultValue === true || defaultValue === 1 || defaultValue === '1';
      } else {
        defaultValue = String(defaultValue);
      }
      
      return defaultValue;
    });
  },

  /**
   * Apply in-memory filtering, search, and sorting to procedure results
   * Since procedures return a fixed result set, we can't use SQL WHERE/ORDER BY
   * If searchable_fields/filterable_fields aren't configured, uses all columns from data
   */
  applyInMemoryFilters(data, config, queryParams) {
    if (!Array.isArray(data)) {
      return data;
    }

    let filteredData = [...data];
    
    // Auto-detect columns from data if not configured
    const detectedColumns = this.detectColumnsFromData(data);
    const hasConfiguredColumns = Array.isArray(config.columns) && config.columns.length > 0;
    const availableColumns = hasConfiguredColumns 
      ? config.columns.map((c) => c && c.name).filter(Boolean)
      : detectedColumns;

    // Apply search across searchable fields (or all columns if not configured)
    const { search } = queryParams || {};
    let searchableFields = config?.searchable_fields;
    
    // If no searchable_fields configured, use all available columns
    if (!Array.isArray(searchableFields) || searchableFields.length === 0) {
      searchableFields = availableColumns;
    }
    
    if (search && typeof search === 'string' && search.trim() && searchableFields.length > 0) {
      const searchLower = search.trim().toLowerCase();
      filteredData = filteredData.filter(row => {
        return searchableFields.some(field => {
          const value = row[field];
          if (value === null || value === undefined) return false;
          return String(value).toLowerCase().includes(searchLower);
        });
      });
    }

    // Apply filters based on filterable_fields config (or all columns if not configured)
    let filterableFields = config?.filterable_fields;
    
    // If no filterable_fields configured, allow filtering on all available columns
    // Check queryParams for any column names that exist in availableColumns
    if (!Array.isArray(filterableFields) || filterableFields.length === 0) {
      // Auto-create filterable_fields from query params that match available columns
      if (queryParams && availableColumns.length > 0) {
        const dynamicFilters = [];
        availableColumns.forEach(colName => {
          if (queryParams[colName] !== undefined && queryParams[colName] !== null && queryParams[colName] !== '') {
            dynamicFilters.push({ name: colName, type: 'text' }); // Default to text filter
          }
        });
        filterableFields = dynamicFilters;
      }
    }
    
    if (Array.isArray(filterableFields) && filterableFields.length > 0 && queryParams) {
      filteredData = filteredData.filter(row => {
        return filterableFields.every(f => {
          if (!f || !f.name) return true;
          const filterValue = queryParams[f.name];
          if (filterValue === undefined || filterValue === null || filterValue === '') return true;
          
          const rowValue = row[f.name];
          if (rowValue === null || rowValue === undefined) return false;
          
          switch (f.type) {
            case 'text':
            case 'string':
              return String(rowValue).toLowerCase().includes(String(filterValue).toLowerCase());
            case 'select':
            case 'number':
              return String(rowValue) === String(filterValue);
            default:
              return String(rowValue) === String(filterValue);
          }
        });
      });
    }

    // Apply sorting
    const { sortBy, sortOrder } = queryParams || {};
    const { default_sort, columns } = config;
    const colNames = Array.isArray(columns) ? columns.map((c) => c && c.name).filter(Boolean) : [];
    
    let sortField = sortBy;
    let sortDir = (sortOrder || 'ASC').toString().toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    
    if (!sortField && default_sort && default_sort.field) {
      sortField = default_sort.field;
      sortDir = (default_sort.order || 'ASC').toString().toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    }
    
    if (sortField) {
      // Validate sort field exists in data or is in configured columns
      if (filteredData.length > 0 && (filteredData[0].hasOwnProperty(sortField) || colNames.length === 0 || colNames.includes(sortField))) {
        filteredData.sort((a, b) => {
          const aVal = a[sortField];
          const bVal = b[sortField];
          
          // Handle null/undefined
          if (aVal === null || aVal === undefined) return sortDir === 'ASC' ? 1 : -1;
          if (bVal === null || bVal === undefined) return sortDir === 'ASC' ? -1 : 1;
          
          // Compare values
          let comparison = 0;
          if (typeof aVal === 'number' && typeof bVal === 'number') {
            comparison = aVal - bVal;
          } else {
            comparison = String(aVal).localeCompare(String(bVal), undefined, { numeric: true, sensitivity: 'base' });
          }
          
          return sortDir === 'ASC' ? comparison : -comparison;
        });
      }
    }

    return filteredData;
  },

  /**
   * Detect columns from a result set (first row)
   * Returns array of column names
   */
  detectColumnsFromData(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }
    // Get column names from first row
    return Object.keys(data[0]);
  },

  /**
   * Select only specified columns from result set
   */
  selectColumns(data, columns) {
    if (!Array.isArray(data) || data.length === 0) {
      return data;
    }

    // If no columns specified, return all columns
    if (!Array.isArray(columns) || columns.length === 0) {
      return data;
    }

    const colNames = columns.map((c) => c && c.name).filter(Boolean);
    if (colNames.length === 0) {
      return data;
    }

    return data.map(row => {
      const selectedRow = {};
      colNames.forEach(colName => {
        if (row.hasOwnProperty(colName)) {
          selectedRow[colName] = row[colName];
        }
      });
      return selectedRow;
    });
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
        const procedureReplacements = {};
        
        // Escape procedure name to handle reserved keywords
        const escapedProcedureName = escapeIdentifier(tenantSequelize, data_source);
        
        if (dialect === 'mysql') {
          // MySQL: CALL procedure_name(param1, param2, ...)
          const paramPlaceholders = procedureParams.map((_, idx) => `:param${idx}`).join(', ');
          procedureCall = `CALL ${escapedProcedureName}(${paramPlaceholders})`;
          procedureParams.forEach((param, idx) => {
            procedureReplacements[`param${idx}`] = param;
          });
        } else if (dialect === 'mssql') {
          // SQL Server: EXEC procedure_name @paramName1=:paramName1, @paramName2=:paramName2, ...
          // Use actual parameter names from source_params config
          const paramList = source_params.map((paramConfig, idx) => {
            const paramName = paramConfig.name;
            procedureReplacements[paramName] = procedureParams[idx];
            return `@${paramName}=:${paramName}`;
          }).join(', ');
          procedureCall = `EXEC ${escapedProcedureName} ${paramList}`;
        } else {
          throw fromCode('UNSUPPORTED_DIALECT', [`Unsupported database dialect: ${dialect}`]);
        }

        // Execute procedure
        const dataRows = await tenantSequelize.query(procedureCall, {
          replacements: procedureReplacements,
          type: tenantSequelize.QueryTypes.SELECT
        });

        if (!Array.isArray(dataRows)) {
          return { data: [], total: 0 };
        }

        // Apply column selection (if columns are specified)
        let processedData = this.selectColumns(dataRows, config.columns);

        // Apply in-memory filtering, search, and sorting
        processedData = this.applyInMemoryFilters(processedData, config, queryParams);

        // Get total count before pagination
        const total = processedData.length;

        // Apply pagination
        const page = parseInt(queryParams.page || 1, 10);
        const defaultPageSize = config.page_size_default || 20;
        const requestedPageSize = queryParams.pageSize ? parseInt(queryParams.pageSize, 10) : defaultPageSize;
        const pageSize = Math.min(Math.max(parseInt(requestedPageSize, 10) || defaultPageSize, 1), 100);
        const offset = (page - 1) * pageSize;
        processedData = processedData?.length > 0 ? [...Object.values(processedData[0])] : [];
        const paginatedData = processedData.slice(offset, offset + pageSize);

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
      // For VIEWs, if searchable_fields/filterable_fields aren't configured,
      // fetch all data and apply filters in-memory (similar to procedures)
      const needsInMemoryFiltering = source_type === 'VIEW' && 
        (!Array.isArray(config.searchable_fields) || config.searchable_fields.length === 0) &&
        (!Array.isArray(config.filterable_fields) || config.filterable_fields.length === 0);
      
      let dataRows;
      let data;
      
      if (needsInMemoryFiltering) {
        // Fetch all data without WHERE clause (will filter in-memory)
        const baseSql = `FROM ${queryDataSource}`;
        const dataSql = `SELECT * ${baseSql} ${orderBy || ''}`;
        dataRows = await tenantSequelize.query(dataSql, {
          replacements: { ...replacements },
          type: tenantSequelize.QueryTypes.SELECT
        });
        
        data = Array.isArray(dataRows) ? dataRows : [];
        
        // Apply in-memory filtering, search, and sorting
        data = this.applyInMemoryFilters(data, config, queryParams);
        
        // Get total count before pagination
        const total = data.length;
        
        // Apply pagination in-memory
        const page = parseInt(queryParams.page || 1, 10);
        const defaultPageSize = config.page_size_default || 20;
        const requestedPageSize = queryParams.pageSize ? parseInt(queryParams.pageSize, 10) : defaultPageSize;
        const pageSize = Math.min(Math.max(parseInt(requestedPageSize, 10) || defaultPageSize, 1), 100);
        const offset = (page - 1) * pageSize;
        data = data.slice(offset, offset + pageSize);
        
        return { data, total };
      } else {
        // Normal SQL-based filtering for TABLEs or VIEWs with configured fields
        const baseSql = `FROM ${queryDataSource} ${whereClause}`;
        const dataSql = `SELECT * ${baseSql} ${orderBy} LIMIT :limit OFFSET :offset`;

        // Execute data query
        dataRows = await tenantSequelize.query(dataSql, {
          replacements: { ...replacements, limit, offset },
          type: tenantSequelize.QueryTypes.SELECT
        });

        data = Array.isArray(dataRows) ? dataRows : [];

        // Get total count: always use metadata (never use COUNT(*) for performance)
        // For filtered queries, we still use metadata (approximate is better than expensive COUNT)
        let total = 0;
        try {
          if (whereClause) {
            const countSql = `SELECT count(*) as count ${baseSql}`;

            // Execute data query
            let resCount = await tenantSequelize.query(countSql, {
              replacements: { ...replacements },
              type: tenantSequelize.QueryTypes.SELECT,
            });
            total = resCount.length>0 ? resCount[0]?.count : 0;
          }
          if(total <= 0){
          const metadataCount = await dbMetadataService.getTableRowCount(
            tenantSequelize,
            queryDataSource,
            source_type
          );
          if (metadataCount !== null) {
            total = metadataCount;
          }
        }
        } catch (metadataError) {
          // If metadata query fails, use large default
          total = 1000000;
        }

        return { data, total };
      }
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
        const procedureReplacements = {};
        
        // Escape procedure name to handle reserved keywords
        const escapedProcedureName = escapeIdentifier(tenantSequelize, data_source);
        
        if (dialect === 'mysql') {
          // MySQL: CALL procedure_name(param1, param2, ...)
          const paramPlaceholders = procedureParams.map((_, idx) => `:param${idx}`).join(', ');
          procedureCall = `CALL ${escapedProcedureName}(${paramPlaceholders})`;
          procedureParams.forEach((param, idx) => {
            procedureReplacements[`param${idx}`] = param;
          });
        } else if (dialect === 'mssql') {
          // SQL Server: EXEC procedure_name @paramName1=:paramName1, @paramName2=:paramName2, ...
          // Use actual parameter names from source_params config
          const paramList = source_params.map((paramConfig, idx) => {
            const paramName = paramConfig.name;
            procedureReplacements[paramName] = procedureParams[idx];
            return `@${paramName}=:${paramName}`;
          }).join(', ');
          procedureCall = `EXEC ${escapedProcedureName} ${paramList}`;
        } else {
          throw fromCode('UNSUPPORTED_DIALECT', [`Unsupported database dialect: ${dialect}`]);
        }

        // Execute procedure
        const dataRows = await tenantSequelize.query(procedureCall, {
          replacements: procedureReplacements,
          type: tenantSequelize.QueryTypes.SELECT
        });

        if (!Array.isArray(dataRows)) {
          return { data: [] };
        }

        // Apply column selection (if columns are specified)
        let processedData = this.selectColumns(dataRows, config.columns);

        // Apply in-memory filtering, search, and sorting (same as getPageData but without pagination)
        processedData = this.applyInMemoryFilters(processedData, config, queryParams);
        processedData = processedData?.length > 0 ? [...Object.values(processedData[0])] : [];

        return { data: processedData };
      } catch (error) {
        if (error.code) throw error;
        throw mapDbError(error);
      }
    }

    // For VIEWs, if searchable_fields/filterable_fields aren't configured,
    // use in-memory filtering (same as getPageData)
    const needsInMemoryFiltering = source_type === 'VIEW' && 
      (!Array.isArray(config.searchable_fields) || config.searchable_fields.length === 0) &&
      (!Array.isArray(config.filterable_fields) || config.filterable_fields.length === 0);
    
    if (needsInMemoryFiltering) {
      // Fetch all data without WHERE clause (will filter in-memory)
      const escapedDataSource = escapeIdentifier(tenantSequelize, data_source);
      const dataSql = `SELECT * FROM ${escapedDataSource}`;
      const dataRows = await tenantSequelize.query(dataSql, {
        type: tenantSequelize.QueryTypes.SELECT
      });
      
      if (!Array.isArray(dataRows)) {
        return { data: [] };
      }
      
      // Apply column selection (if columns are specified)
      let processedData = this.selectColumns(dataRows, config.columns);
      
      // Apply in-memory filtering, search, and sorting (same as getPageData but without pagination)
      processedData = this.applyInMemoryFilters(processedData, config, queryParams);
      
      return { data: processedData };
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


