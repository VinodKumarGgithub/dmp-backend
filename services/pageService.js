const { fromCode } = require('../utils/errors');
const { mapDbError } = require('../utils/dbErrorMapper');
const { PageConfig } = require('../models/PageConfig');

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

  buildQuery(config, queryParams) {
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
    const limit = Math.min(parseInt(pageSize || config.page_size_default, 10) || 20, 100); // cap
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
        likeClauses.push(`${field} LIKE :${key}`);
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
        switch (f.type) {
          case 'text':
          case 'string':
            where.push(`${f.name} LIKE :${paramKey}`);
            replacements[paramKey] = `%${String(value)}%`;
            break;
          case 'select':
          case 'number':
            where.push(`${f.name} = :${paramKey}`);
            replacements[paramKey] = value;
            break;
          default:
            where.push(`${f.name} = :${paramKey}`);
            replacements[paramKey] = value;
        }
      });
    }

    // Sorting (whitelist field names)
    const colNames = Array.isArray(columns) ? columns.map((c) => c && c.name).filter(Boolean) : [];
    let orderBy = '';
    if (sortBy && typeof sortBy === 'string') {
      if (!colNames.includes(sortBy)) {
        throw fromCode('VALIDATION_ERROR', [`Invalid sort field: ${sortBy}. Must be one of: ${colNames.join(', ')}`]);
      }
      const dir = (sortOrder || 'ASC').toString().toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      orderBy = `ORDER BY ${sortBy} ${dir}`;
    } else if (default_sort && default_sort.field && colNames.includes(default_sort.field)) {
      const dir = (default_sort.order || 'ASC').toString().toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      orderBy = `ORDER BY ${default_sort.field} ${dir}`;
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

    let queryResult;
    try {
      queryResult = this.buildQuery(config, queryParams);
    } catch (error) {
      // buildQuery already throws mapped errors
      throw error;
    }

    const { whereClause, orderBy, limit, offset, replacements, data_source } = queryResult;

    try {
      // Build the SQL queries
      const baseSql = `FROM ${data_source} ${whereClause}`;
      const dataSql = `SELECT * ${baseSql} ${orderBy} LIMIT :limit OFFSET :offset`;
      const countSql = `SELECT COUNT(*) as cnt ${baseSql}`;

      // Execute queries using req.db.sequelize.query
      // Sequelize query returns [results, metadata], so we destructure to get the results
      const dataRows = await tenantSequelize.query(dataSql, {
        replacements: { ...replacements, limit, offset },
        type: tenantSequelize.QueryTypes.SELECT
      });

      const [countRows] = await tenantSequelize.query(countSql, {
        replacements,
        type: tenantSequelize.QueryTypes.SELECT
      });

      const total = Array.isArray(countRows) && countRows.length ? parseInt(countRows[0].cnt, 10) || 0 : 0;
      const data = Array.isArray(dataRows) ? dataRows : [];

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

    // Build query without pagination
    if (!config || !config.data_source) {
      throw fromCode('PAGE_CONFIG_INVALID', ['Page configuration is missing data_source']);
    }

    const { columns, searchable_fields, filterable_fields, default_sort, data_source } = config;
    
    // Validate data_source is a safe identifier
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(data_source)) {
      throw fromCode('PAGE_DATA_SOURCE_INVALID', [`Invalid data source name: ${data_source}`]);
    }

    // Validate and extract column names from config.columns
    if (!Array.isArray(columns) || columns.length === 0) {
      throw fromCode('PAGE_CONFIG_INVALID', ['Page columns configuration is missing or invalid']);
    }

    // Extract and validate column names
    const colNames = columns
      .map((c) => c && c.name)
      .filter(Boolean)
      .filter((name) => {
        // Validate column name is safe (alphanumeric, underscore, no SQL injection)
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
          return false;
        }
        return true;
      });

    if (colNames.length === 0) {
      throw fromCode('PAGE_CONFIG_INVALID', ['No valid columns found in page configuration']);
    }

    const { search, sortBy, sortOrder } = queryParams;

    const where = [];
    const replacements = {};

    // Search across configured searchable fields
    if (search && typeof search === 'string' && search.trim()) {
      if (!Array.isArray(searchable_fields) || searchable_fields.length === 0) {
        throw fromCode('PAGE_CONFIG_INVALID', ['No searchable fields configured for this page']);
      }
      const likeClauses = [];
      searchable_fields.forEach((field, idx) => {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) {
          throw fromCode('PAGE_CONFIG_INVALID', [`Invalid searchable field name: ${field}`]);
        }
        const key = `search_${idx}`;
        likeClauses.push(`${field} LIKE :${key}`);
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
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(f.name)) {
          throw fromCode('PAGE_CONFIG_INVALID', [`Invalid filterable field name: ${f.name}`]);
        }

        const value = queryParams[f.name];
        if (value === undefined || value === null || value === '') return;

        const paramKey = `f_${f.name}`;
        switch (f.type) {
          case 'text':
          case 'string':
            where.push(`${f.name} LIKE :${paramKey}`);
            replacements[paramKey] = `%${String(value)}%`;
            break;
          case 'select':
          case 'number':
            where.push(`${f.name} = :${paramKey}`);
            replacements[paramKey] = value;
            break;
          default:
            where.push(`${f.name} = :${paramKey}`);
            replacements[paramKey] = value;
        }
      });
    }

    // Sorting (whitelist field names)
    let orderBy = '';
    if (sortBy && typeof sortBy === 'string') {
      if (!colNames.includes(sortBy)) {
        throw fromCode('VALIDATION_ERROR', [`Invalid sort field: ${sortBy}. Must be one of: ${colNames.join(', ')}`]);
      }
      const dir = (sortOrder || 'ASC').toString().toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      orderBy = `ORDER BY ${sortBy} ${dir}`;
    } else if (default_sort && default_sort.field && colNames.includes(default_sort.field)) {
      const dir = (default_sort.order || 'ASC').toString().toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      orderBy = `ORDER BY ${default_sort.field} ${dir}`;
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    try {
      // Build SQL query with specific columns from config instead of SELECT *
      // Join column names with comma (they're already validated as safe identifiers)
      const selectColumns = colNames.join(', ');
      const dataSql = `SELECT ${selectColumns} FROM ${data_source} ${whereClause} ${orderBy}`;

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


