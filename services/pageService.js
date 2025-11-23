const { fromCode, createErrorWithContext, getColumnSuggestions } = require('../utils/errors');
const { mapDbError } = require('../utils/dbErrorMapper');
const { PageConfig } = require('../models/PageConfig');
const { dbMetadataService } = require('./dbMetadataService');
const { validateProcedureSql } = require('../utils/sqlSecurity');
const crypto = require('crypto');

/**
 * Escape column/identifier names to handle reserved keywords
 * MySQL uses backticks, SQL Server uses square brackets
 */
function escapeIdentifier(sequelize, identifier) {
  if (!identifier || typeof identifier !== 'string') {
    return identifier;
  }

  const segments = identifier.split('.').filter(Boolean);
  if (segments.length === 0) {
    return identifier;
  }

  const dialect = sequelize && typeof sequelize.getDialect === 'function'
    ? sequelize.getDialect()
    : null;

  const wrapSegment = (segment) => {
    if (!segment) return segment;
    if (dialect === 'mysql') {
      return `\`${segment}\``;
    } else if (dialect === 'mssql') {
      return `[${segment}]`;
    }
    // For other dialects, return as-is (PostgreSQL uses double quotes)
    return segment;
  };

  return segments.map(wrapSegment).join('.');
}

function parsePositiveInt(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function getSelectLimitClauses(sequelize, limit) {
  if (!sequelize || !limit) {
    return { selectPrefix: '', limitSuffix: '' };
  }
  const dialect = sequelize.getDialect();
  if (dialect === 'mssql') {
    return { selectPrefix: `TOP (${limit}) `, limitSuffix: '' };
  }
  return { selectPrefix: '', limitSuffix: ` LIMIT ${limit}` };
}

function parseJsonField(text, fallback) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch (e) {
    throw fromCode('PAGE_CONFIG_INVALID', [`Invalid JSON in page configuration: ${e.message}`]);
  }
}

function resolvePageNumber(queryParams = {}) {
  const page = queryParams.page;
  return Math.max(parseInt(page, 10) || 1, 1);
}

function resolvePageSize(config = {}, queryParams = {}) {
  const defaultPageSize = config.page_size_default || 20;
  let requestedPageSize = defaultPageSize;
  const pageSize = queryParams.pageSize;
  if (pageSize !== undefined && pageSize !== null && pageSize !== '') {
    const parsed = parseInt(pageSize, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      requestedPageSize = parsed;
    }
  }
  return Math.min(Math.max(requestedPageSize, 1), 100);
}

const SIMPLE_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const QUALIFIED_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;

function isSafeIdentifier(identifier, { allowQualified = false } = {}) {
  if (!identifier || typeof identifier !== 'string') {
    return false;
  }
  const pattern = allowQualified ? QUALIFIED_IDENTIFIER_PATTERN : SIMPLE_IDENTIFIER_PATTERN;
  return pattern.test(identifier);
}

function stripTrailingSemicolon(sql = '') {
  if (typeof sql !== 'string') return '';
  return sql.replace(/;\s*$/, '').trim();
}

function stripPaginationClauses(sql = '') {
  if (!sql) {
    return { sql: '', paginationClause: '' };
  }

  let cleaned = stripTrailingSemicolon(sql);
  const paginationPatterns = [
    /\boffset\s+\S+\s+rows\s+fetch\s+next\s+\S+\s+rows\s+only\s*$/i,
    /\blimit\s+\S+(?:\s+offset\s+\S+)?\s*$/i
  ];

  for (const pattern of paginationPatterns) {
    const match = pattern.exec(cleaned);
    if (match && match.index !== undefined) {
      const clause = match[0];
      const head = cleaned.slice(0, match.index).trim();
      return { sql: head, paginationClause: clause.trim() };
    }
  }

  return { sql: cleaned, paginationClause: '' };
}

function stripOrderByClause(sql = '') {
  if (!sql) {
    return { head: '', orderClause: '' };
  }
  const orderRegex = /\border\s+by\b/gi;
  let match;
  let lastIndex = -1;
  while ((match = orderRegex.exec(sql)) !== null) {
    lastIndex = match.index;
  }

  if (lastIndex === -1) {
    return { head: sql.trim(), orderClause: '' };
  }

  return {
    head: sql.slice(0, lastIndex).trim(),
    orderClause: sql.slice(lastIndex).trim()
  };
}

function appendWhereClauseBody(sqlBody = '', whereClause = '') {
  if (!sqlBody) return '';
  if (!whereClause) return sqlBody.trim();

  const clause = whereClause.trim().replace(/^WHERE\s+/i, '').trim();
  if (!clause) {
    return sqlBody.trim();
  }

  const trimmedBody = sqlBody.trim();
  if (!trimmedBody) {
    return trimmedBody;
  }

  if (/\bwhere\b/i.test(trimmedBody)) {
    return `${trimmedBody} AND (${clause})`;
  }
  return `${trimmedBody} WHERE ${clause}`;
}

function extractProcedureSql(sourceParams = []) {
  if (!Array.isArray(sourceParams)) {
    return { baseSql: null, remainingParams: [] };
  }

  let baseSql = null;
  const remainingParams = [];

  sourceParams.forEach((param) => {
    if (!param || !param.name) return;
    if (param.name === 'p_sql' && baseSql === null) {
      const hasValue = Object.prototype.hasOwnProperty.call(param, 'value');
      const candidate = hasValue ? param.value : param.default_value;
      if (typeof candidate === 'string' && candidate.trim()) {
        baseSql = candidate.trim();
      }
    } else {
      remainingParams.push(param);
    }
  });

  return { baseSql, remainingParams };
}

/**
 * Hash SQL query for audit logging (SHA-256)
 */
function hashSql(sql) {
  if (!sql || typeof sql !== 'string') {
    return null;
  }
  return crypto.createHash('sha256').update(sql).digest('hex');
}

function splitSelectList(selectClause = '') {
  const parts = [];
  let current = '';
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < selectClause.length; i += 1) {
    const char = selectClause[i];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (!inSingle && !inDouble) {
      if (char === '(') depth += 1;
      if (char === ')') depth = Math.max(depth - 1, 0);
      if (char === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
        continue;
      }
    }
    current += char;
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

function stripIdentifierQuotes(identifier = '') {
  return identifier.replace(/^[`"'[]+|[`"'\]]+$/g, '');
}

function parseSelectAlias(part = '') {
  if (!part) return null;
  let expression = part;
  let alias = '';
  const asMatch = part.match(/\s+AS\s+([`"'[]?[\w]+[`"'\]]?)$/i);
  if (asMatch) {
    alias = stripIdentifierQuotes(asMatch[1]);
    expression = part.slice(0, asMatch.index).trim();
  } else {
    const tokens = part.split(/\s+/);
    if (tokens.length > 1) {
      alias = stripIdentifierQuotes(tokens[tokens.length - 1]);
      expression = tokens.slice(0, -1).join(' ');
    } else {
      alias = stripIdentifierQuotes(expression);
    }
  }
  const qualifiedMatch = expression.match(/([`"'[]?[\w]+[`"'\]]?)\s*\.\s*([`"'[]?[\w]+[`"'\]]?)/);
  const qualified = qualifiedMatch
    ? `${stripIdentifierQuotes(qualifiedMatch[1])}.${stripIdentifierQuotes(qualifiedMatch[2])}`
    : null;
  return { alias: alias.toLowerCase(), qualified };
}

function buildAliasMapFromSql(sql) {
  const map = new Map();
  if (!sql || typeof sql !== 'string') return map;
  const normalized = stripTrailingSemicolon(sql);
  const selectMatch = normalized.match(/select\s+([\s\S]+?)\s+from\s/i);
  if (!selectMatch) return map;
  const selectClause = selectMatch[1];
  const parts = splitSelectList(selectClause);
  parts.forEach((part) => {
    const info = parseSelectAlias(part);
    if (info && info.alias && info.qualified) {
      map.set(info.alias, info.qualified);
    }
  });
  return map;
}

function inferDataTypeFromValue(value) {
  if (value === null || value === undefined) {
    return 'string';
  }
  if (value instanceof Date) {
    return 'date';
  }
  if (typeof value === 'number') {
    return 'number';
  }
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  // Attempt to detect ISO date strings
  if (typeof value === 'string') {
    const date = Date.parse(value);
    if (!Number.isNaN(date)) {
      return 'date';
    }
  }
  return 'string';
}

function inferDataTypeFromField(field = {}) {
  const rawType = (field.type || field.dataType || '').toString().toLowerCase();
  if (rawType.includes('int') || rawType.includes('decimal') || rawType.includes('numeric') || rawType.includes('float') || rawType.includes('double')) {
    return 'number';
  }
  if (rawType.includes('date') || rawType.includes('time')) {
    return 'date';
  }
  if (rawType.includes('bool')) {
    return 'boolean';
  }
  return 'string';
}

/**
 * Log query execution to audit log (async, non-blocking)
 */
async function logQueryExecution(auditData) {
  try {
    const { QueryAuditLog } = require('../models/QueryAuditLog');
    const { generateId } = require('../utils/idGenerator');
    
    const logEntry = {
      id: generateId('audit'),
      page_key: auditData.pageKey,
      tenant_id: auditData.tenantId,
      user_id: auditData.userId,
      ip_address: auditData.ipAddress,
      sql_hash: auditData.sqlHash,
      execution_time_ms: auditData.executionTime,
      rows_returned: auditData.rowsReturned,
      success: auditData.success,
      error_message: auditData.errorMessage,
      query_params: auditData.queryParams ? JSON.stringify(auditData.queryParams) : null
    };

    await QueryAuditLog.create(logEntry);
  } catch (error) {
    // Don't throw - audit logging failures shouldn't break the main flow
    console.error('Failed to log query execution:', error);
  }
}

function applyPaginationClause(sql, limit, offset, sequelize, replacements = {}, keyPrefix = 'proc') {
  if (!Number.isFinite(limit) || limit <= 0) {
    return { sql, replacements: { ...replacements } };
  }

  const limitKey = `${keyPrefix}_limit`;
  const offsetKey = `${keyPrefix}_offset`;

  const nextReplacements = { ...replacements };
  nextReplacements[limitKey] = limit;
  nextReplacements[offsetKey] = Number.isFinite(offset) ? offset : 0;

  const dialect = sequelize && typeof sequelize.getDialect === 'function'
    ? sequelize.getDialect()
    : null;

  let paginatedSql = sql.trim();
  if (!paginatedSql) {
    return { sql, replacements: nextReplacements };
  }

  if (dialect === 'mssql') {
    if (!/\border\s+by\b/i.test(paginatedSql)) {
      paginatedSql = `${paginatedSql} ORDER BY (SELECT NULL)`;
    }
    paginatedSql = `${paginatedSql} OFFSET :${offsetKey} ROWS FETCH NEXT :${limitKey} ROWS ONLY`;
  } else {
    paginatedSql = `${paginatedSql} LIMIT :${limitKey} OFFSET :${offsetKey}`;
  }

  return { sql: paginatedSql, replacements: nextReplacements };
}

async function countSqlRows(sql, replacements, sequelize) {
  if (!sql || !sequelize) {
    return 0;
  }

  const countSql = `SELECT COUNT(*) as count FROM (${sql}) AS count_alias`;
  const rows = await sequelize.query(countSql, {
    replacements,
    type: sequelize.QueryTypes.SELECT
  });

  if (Array.isArray(rows) && rows.length > 0) {
    const row = rows[0];
    const value =
      row.count ??
      row.COUNT ??
      row['COUNT(*)'] ??
      Object.values(row)[0];
    const parsed = typeof value === 'number' ? value : parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

const pageService = {
  async listPages() {
    try {
      const pages = await PageConfig.findAll({
        attributes: ['page_key', 'title', 'is_download_allowed', 'download_row_limit']
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
          download_row_limit: page.download_row_limit,
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
    if (!isSafeIdentifier(data_source)) {
      throw fromCode('PAGE_DATA_SOURCE_INVALID', [`Invalid data source name: ${data_source}`]);
    }

    const { search, sortBy, sortOrder } = queryParams;

    const limit = resolvePageSize(config, queryParams);
    const pageNum = resolvePageNumber(queryParams);
    const offset = (pageNum - 1) * limit;

    const where = [];
    const replacements = {};
    const createParamKey = (prefix, identifier) => {
      const sanitizedIdentifier = (identifier || '').replace(/[^a-zA-Z0-9_]/g, '_') || 'field';
      const baseKey = `${prefix}${sanitizedIdentifier}`;
      let key = baseKey;
      let counter = 1;
      while (Object.prototype.hasOwnProperty.call(replacements, key)) {
        key = `${baseKey}_${counter++}`;
      }
      return key;
    };

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
          if (!isSafeIdentifier(field, { allowQualified: true })) {
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
        if (!isSafeIdentifier(f.name, { allowQualified: true })) {
          throw fromCode('PAGE_CONFIG_INVALID', [`Invalid filterable field name: ${f.name}`]);
        }

        const value = queryParams[f.name];
        if (value === undefined || value === null || value === '') return;

        const paramKey = createParamKey('f_', f.name);
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
      if (!isSafeIdentifier(sortBy, { allowQualified: true })) {
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
      if (!isSafeIdentifier(default_sort.field, { allowQualified: true })) {
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

  buildProcedureSql(config, queryParams, sequelize, options = {}, baseSqlOverride) {
    if (!sequelize) {
      throw fromCode('TENANT_DB_NOT_AVAILABLE');
    }

    const sourceParams = config?.source_params || [];
    const resolvedBaseSql = typeof baseSqlOverride === 'string' && baseSqlOverride.trim()
      ? baseSqlOverride.trim()
      : extractProcedureSql(sourceParams).baseSql;

    if (!resolvedBaseSql) {
      throw fromCode('PAGE_CONFIG_INVALID', ['Procedure configuration must include a p_sql parameter']);
    }

    // Security validation: validate p_sql is safe and read-only
    try {
      validateProcedureSql(resolvedBaseSql, {
        checkReadOnly: true,
        checkComplexity: true,
        maxTimeout: 30000
      });
    } catch (validationError) {
      // Re-throw validation errors as-is
      throw validationError;
    }

    const {
      sql: baseWithoutPagination,
      paginationClause: existingPaginationClause
    } = stripPaginationClauses(resolvedBaseSql);
    const { head: baseWithoutOrder, orderClause: existingOrderClause } = stripOrderByClause(baseWithoutPagination);

    const queryFragments = this.buildQuery(config, queryParams, sequelize);
    const filteredSql = appendWhereClauseBody(baseWithoutOrder, queryFragments.whereClause);
    const effectiveOrderClause =
      queryFragments.orderBy && queryFragments.orderBy.trim()
        ? queryFragments.orderBy.trim()
        : existingOrderClause;

    const orderedSql = effectiveOrderClause ? `${filteredSql} ${effectiveOrderClause}`.trim() : filteredSql;

    const {
      pagination = true,
      limitOverride,
      offsetOverride,
      paginationKeyPrefix = 'proc',
      extraRows = 0
    } = options;

    const limitToUse =
      limitOverride !== undefined && limitOverride !== null ? limitOverride : queryFragments.limit;
    const offsetToUse =
      offsetOverride !== undefined && offsetOverride !== null ? offsetOverride : queryFragments.offset;
    const extraRowCount = Number.isFinite(extraRows) && extraRows > 0 ? extraRows : 0;

    let finalSql = orderedSql;
    let finalReplacements = { ...queryFragments.replacements };
    const hadExistingPagination = Boolean(existingPaginationClause);

    if (hadExistingPagination) {
      finalSql = `${orderedSql} ${existingPaginationClause}`.trim();
    } else if (pagination && Number.isFinite(limitToUse) && limitToUse > 0) {
      const limitForQuery = limitToUse + extraRowCount;
      const paginationResult = applyPaginationClause(
        orderedSql,
        limitForQuery,
        Number.isFinite(offsetToUse) ? offsetToUse : 0,
        sequelize,
        queryFragments.replacements,
        paginationKeyPrefix
      );
      finalSql = paginationResult.sql;
      finalReplacements = paginationResult.replacements;
    }

    return {
      sql: finalSql,
      filteredSql,
      orderedSql,
      replacements: finalReplacements,
      baseReplacements: { ...queryFragments.replacements },
      limit: limitToUse,
      offset: offsetToUse,
      hadExistingPagination
    };
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
    const usableParams = sourceParamsConfig.filter(
      (paramConfig) => paramConfig && paramConfig.name && paramConfig.name !== 'p_sql'
    );

    if (usableParams.length === 0) {
      return [];
    }

    return usableParams.map((paramConfig) => {
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
   * Detect columns by executing provided SQL with LIMIT/TOP 1
   */
  async detectColumnsFromSql(pSql, sequelize) {
    if (!sequelize) {
      throw fromCode('TENANT_DB_NOT_AVAILABLE');
    }

    const trimmedSql = stripTrailingSemicolon(pSql || '').trim();
    if (!trimmedSql) {
      throw fromCode('PAGE_CONFIG_INVALID', ['p_sql is required for column detection']);
    }

    // Validate SQL safety
    validateProcedureSql(trimmedSql, {
      checkReadOnly: true,
      checkComplexity: true,
      maxTimeout: 30000
    });

    const dialect = sequelize.getDialect();
    const detectionQuery = dialect === 'mssql'
      ? `SELECT TOP 1 * FROM (${trimmedSql}) AS detection_subquery`
      : `SELECT * FROM (${trimmedSql}) AS detection_subquery LIMIT 1`;
    const aliasMap = buildAliasMapFromSql(trimmedSql);

    try {
      const startTime = Date.now();
      const [results, metadata] = await sequelize.query(detectionQuery, {
        logging: false,
        raw: true
      });

      const rows = Array.isArray(results) ? results : [];
      let columns = [];

      if (rows.length > 0) {
        const sampleRow = rows[0];
        columns = Object.keys(sampleRow).map((colName) => {
          const qualified = aliasMap.get(colName.toLowerCase());
          return {
            name: qualified || colName,
            type: inferDataTypeFromValue(sampleRow[colName]),
            nullable: sampleRow[colName] === null || sampleRow[colName] === undefined
          };
        });
      } else if (metadata && Array.isArray(metadata.fields)) {
        columns = metadata.fields
          .map((field) => {
            const name = field.name || field.orgName || field.columnName;
            if (!name) {
              return null;
            }
            return {
              name: aliasMap.get(name.toLowerCase()) || name,
              type: inferDataTypeFromField(field),
              nullable: field.nullable !== undefined ? field.nullable : true
            };
          })
          .filter(Boolean);
      }

      if (columns.length === 0) {
        throw fromCode('PAGE_QUERY_ERROR', ['Could not detect columns from SQL query. Ensure the query returns data.']);
      }

      const executionTime = Date.now() - startTime;
      return { columns, executionTime };
    } catch (error) {
      const enhancedError = createErrorWithContext(error, {
        sql: detectionQuery,
        replacements: {},
        executionTime: null,
        pageKey: null,
        sourceType: 'PROCEDURE'
      });
      throw enhancedError;
    }
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

    const getPossibleKeys = (colName) => {
      if (!colName) return [];
      const keys = [colName];
      const stripped = stripIdentifierQuotes(colName);
      if (stripped !== colName) {
        keys.push(stripped);
      }
      if (stripped.includes('.')) {
        const lastSegment = stripped.split('.').pop();
        keys.push(lastSegment);
      } else if (colName.includes('.')) {
        const lastSegment = colName.split('.').pop();
        keys.push(lastSegment);
      }
      return Array.from(new Set(keys.filter(Boolean)));
    };

    const colNames = columns.map((c) => c && c.name).filter(Boolean);
    if (colNames.length === 0) {
      return data;
    }

    return data.map(row => {
      const selectedRow = {};
      colNames.forEach(colName => {
        const possibleKeys = getPossibleKeys(colName);
        for (let i = 0; i < possibleKeys.length; i += 1) {
          const key = possibleKeys[i];
          if (Object.prototype.hasOwnProperty.call(row, key)) {
            selectedRow[colName] = row[key];
            break;
          }
        }
      });
      return selectedRow;
    });
  },

  async getPageData(config, queryParams, reqDb, auditContext = {}) {
    // reqDb should be { sequelize, models, tenantId } from tenantResolver middleware
    if (!reqDb || !reqDb.sequelize) {
      throw fromCode('TENANT_DB_NOT_AVAILABLE');
    }

    const tenantSequelize = reqDb.sequelize;
    const { source_type = 'TABLE', source_params = [], data_source } = config;

    // Handle PROCEDURE type
    if (source_type === 'PROCEDURE') {
      try {
        const { baseSql, remainingParams } = extractProcedureSql(source_params);
        if (baseSql) {
          const procedureQuery = this.buildProcedureSql(
            config,
            queryParams,
            tenantSequelize,
            { extraRows: 1 },
            baseSql
          );
          
          // Audit logging: track query execution
          const startTime = Date.now();
          let executionSuccess = true;
          let errorMessage = null;
          let dataRows = [];
          
          try {
            dataRows = await tenantSequelize.query(procedureQuery.sql, {
              replacements: procedureQuery.replacements,
              type: tenantSequelize.QueryTypes.SELECT,
              timeout: 30000 // 30 second timeout
            });
          } catch (queryError) {
            executionSuccess = false;
            errorMessage = queryError.message || String(queryError);
            
            // Enhance error with query context
            const executionTime = Date.now() - startTime;
            const enhancedError = createErrorWithContext(queryError, {
              sql: procedureQuery.sql,
              replacements: procedureQuery.replacements,
              executionTime,
              pageKey: config.page_key,
              sourceType: 'PROCEDURE'
            });
            
            throw enhancedError;
          } finally {
            // Log query execution (non-blocking)
            const executionTime = Date.now() - startTime;
            logQueryExecution({
              pageKey: config.page_key,
              tenantId: reqDb.tenantId,
              userId: auditContext.userId,
              ipAddress: auditContext.ipAddress,
              sqlHash: hashSql(procedureQuery.sql),
              executionTime,
              rowsReturned: Array.isArray(dataRows) ? dataRows.length : 0,
              success: executionSuccess,
              errorMessage,
              queryParams: Object.keys(queryParams).length > 0 ? queryParams : null
            }).catch(() => {
              // Ignore audit logging errors
            });
          }

          let data = Array.isArray(dataRows) ? dataRows : [];
          data = this.selectColumns(data, config.columns);

          const pageLimit = Number.isFinite(procedureQuery.limit) ? procedureQuery.limit : resolvePageSize(config, queryParams);
          const pageNum = resolvePageNumber(queryParams);
          let hasMore = false;
          if (!procedureQuery.hadExistingPagination && Number.isFinite(pageLimit) && pageLimit > 0) {
            if (data.length > pageLimit) {
              hasMore = true;
              data = data.slice(0, pageLimit);
            }
          }

          const totalBase = ((pageNum - 1) * (Number.isFinite(pageLimit) ? pageLimit : data.length)) + data.length;
          const total = hasMore ? totalBase + 1 : totalBase;

          return { data, total, hasMore };
        }

        // Fallback to executing the stored procedure directly when p_sql is not provided
        const procedureParams = this.buildProcedureParams(remainingParams, queryParams);
        
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
          // Use actual parameter names from source params config
          const paramList = remainingParams.map((paramConfig, idx) => {
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
          return { data: [], total: 0, hasMore: false };
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
        const hasMore = total > offset + pageSize;
        processedData = processedData?.length > 0 ? [...Object.values(processedData[0])] : [];
        const paginatedData = processedData.slice(offset, offset + pageSize);

        return { data: paginatedData, total, hasMore };
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
        
        return { data, total, hasMore: false };
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

        return { data, total, hasMore: false };
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
  async getAllPageData(config, queryParams, reqDb, auditContext = {}) {
    // reqDb should be { sequelize, models, tenantId } from tenantResolver middleware
    if (!reqDb || !reqDb.sequelize) {
      throw fromCode('TENANT_DB_NOT_AVAILABLE');
    }

    const tenantSequelize = reqDb.sequelize;
    const { source_type = 'TABLE', source_params = [], data_source } = config;
    const downloadLimit = parsePositiveInt(config.download_row_limit);

    // Handle PROCEDURE type
    if (source_type === 'PROCEDURE') {
      try {
        const { baseSql, remainingParams } = extractProcedureSql(source_params);
        if (baseSql) {
          const procedureQuery = this.buildProcedureSql(
            config,
            queryParams,
            tenantSequelize,
            {
              pagination: Boolean(downloadLimit),
              limitOverride: downloadLimit ?? undefined,
              offsetOverride: 0,
              paginationKeyPrefix: 'download'
            },
            baseSql
          );
          
          // Audit logging for download queries
          const startTime = Date.now();
          let executionSuccess = true;
          let errorMessage = null;
          let dataRows = [];
          
          try {
            dataRows = await tenantSequelize.query(procedureQuery.sql, {
              replacements: procedureQuery.replacements,
              type: tenantSequelize.QueryTypes.SELECT,
              timeout: 30000
            });
          } catch (queryError) {
            executionSuccess = false;
            errorMessage = queryError.message || String(queryError);
            throw queryError;
          } finally {
            const executionTime = Date.now() - startTime;
            logQueryExecution({
              pageKey: config.page_key,
              tenantId: reqDb.tenantId,
              userId: auditContext.userId,
              ipAddress: auditContext.ipAddress,
              sqlHash: hashSql(procedureQuery.sql),
              executionTime,
              rowsReturned: Array.isArray(dataRows) ? dataRows.length : 0,
              success: executionSuccess,
              errorMessage,
              queryParams: Object.keys(queryParams).length > 0 ? queryParams : null
            }).catch(() => {
              // Ignore audit logging errors
            });
          }

          if (!Array.isArray(dataRows)) {
            return { data: [] };
          }

          let data = this.selectColumns(dataRows, config.columns);
          if (downloadLimit && Array.isArray(data)) {
            data = data.slice(0, downloadLimit);
          }
          return { data };
        }

        // Build procedure parameters from config and query params
        const procedureParams = this.buildProcedureParams(remainingParams, queryParams);
        
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
          const paramList = remainingParams.map((paramConfig, idx) => {
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
        if (downloadLimit && Array.isArray(processedData)) {
          processedData = processedData.slice(0, downloadLimit);
        }

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
      if (downloadLimit && Array.isArray(processedData)) {
        processedData = processedData.slice(0, downloadLimit);
      }
      
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
      const { selectPrefix, limitSuffix } = getSelectLimitClauses(tenantSequelize, downloadLimit);
      // Build SQL query - use specific columns if provided, otherwise use *
      // Use same conditions from buildQuery (whereClause, orderBy, replacements) - no pagination
      // Escape column names to handle reserved keywords
      let selectColumns = '*';
      if (colNames.length > 0) {
        const escapedColumns = colNames.map(col => escapeIdentifier(tenantSequelize, col));
        selectColumns = escapedColumns.join(', ');
      }
      const dataSql = `SELECT ${selectPrefix}${selectColumns} FROM ${queryDataSource} ${whereClause} ${orderBy}${limitSuffix}`;

      // Execute query using req.db.sequelize.query to get all data
      // Sequelize query returns [results, metadata], so we destructure to get the results
      const dataRows = await tenantSequelize.query(dataSql, {
        replacements,
        type: tenantSequelize.QueryTypes.SELECT
      });

      // dataRows is already an array of row objects
      let data = Array.isArray(dataRows) ? dataRows : [];
      if (downloadLimit && data.length > downloadLimit) {
        data = data.slice(0, downloadLimit);
      }

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


