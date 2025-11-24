// Central error catalog: define messages and status by code here
const ERROR_CATALOG = {
  VALIDATION_ERROR: { message: 'Validation error', status: 400 },
  CREDS_REQUIRED: { message: 'username and password are required', status:400 },
  INVALID_CREDS: { message:"Invalid credentials", status:401},
  UNAUTHORIZED: { message: 'Unauthorized', status: 401 },
  INVALIDTOKEN: { message: 'Invalid token', status: 401 },
  FORBIDDEN: { message: 'Forbidden', status: 403 },
  AUTHFAILED: { message: 'Auth verification failed', status: 500 },
  NOT_FOUND: { message: 'Resource not found', status: 404 },
  CONFLICT: { message: 'Conflict', status: 409 },
  TENANT_NOT_FOUND: { message: 'Tenant not found', status: 404 },
  DB_CONNECTION_FAILED: { message: 'Database connection failed', status: 502 },
  DB_AUTH_FAILED: { message: 'Database authentication failed', status: 502 },
  DB_HOST_UNREACHABLE: { message: 'Database host unreachable', status: 502 },
  DB_NAME_NOT_FOUND: { message: 'Target database not found', status: 502 },
  DB_DUPLICATE_KEY: { message: 'Duplicate key violates unique constraint', status: 409 },
  DB_INVALID_CONFIG: { message: 'Invalid database configuration', status: 400 },
  INTERNAL_ERROR: { message: 'Internal Server Error', status: 500 },
  PAGE_NOT_FOUND: { message: 'Page not found', status: 404 },
  PAGE_DOWNLOAD_NOT_ALLOWED: { message: 'Download not allowed for this page', status: 403 },
  PAGE_NO_DATA_TO_DOWNLOAD: { message: 'No data available to download', status: 404 },
  PAGE_DATA_SOURCE_INVALID: { message: 'Page data source (table/view) does not exist or is invalid', status: 400 },
  PAGE_CONFIG_INVALID: { message: 'Page configuration is invalid or corrupted', status: 400 },
  PAGE_QUERY_ERROR: { message: 'Failed to execute page data query', status: 400 },
  TENANT_DB_NOT_AVAILABLE: { message: 'Tenant database not available', status: 502 },
  RATE_LIMIT_EXCEEDED: { message: 'Rate limit exceeded', status: 429 },
  UNSUPPORTED_DIALECT: { message: 'Unsupported database dialect', status: 400 },
  DB_SYNTAX_ERROR: { message: 'Database query syntax error', status: 400 },
  DB_UNKNOWN_COLUMN: { message: 'Referenced column does not exist', status: 400 },
  DB_UNKNOWN_TABLE: { message: 'Referenced table or view does not exist', status: 400 },
  DB_QUERY_ERROR: { message: 'Database query failed', status: 400 },
  USER_BLOCKED: { message: 'User account is blocked', status: 403 },
  DANGEROUS_SQL_DETECTED: { message: 'Dangerous SQL detected', status: 403 },
};

function createError(code, message, status, details) {
  const catalog = ERROR_CATALOG[code] || {};
  const err = new Error(message || catalog.message || 'Error');
  err.code = code || 'INTERNAL_ERROR';
  err.status = status || catalog.status || 500;
  if (details !== undefined) err.details = details;
  return err;
}

function fromCode(code, details) {
  const catalog = ERROR_CATALOG[code] || ERROR_CATALOG.INTERNAL_ERROR;
  const err = new Error(catalog.message);
  err.code = code;
  err.status = catalog.status;
  if (details !== undefined) err.details = details;
  return err;
}

/**
 * Sanitize SQL query for error display (remove sensitive data)
 */
function sanitizeSqlForError(sql, replacements = {}) {
  if (!sql || typeof sql !== 'string') {
    return null;
  }

  let sanitized = sql;

  // Replace parameter values with placeholders
  if (replacements && typeof replacements === 'object') {
    Object.keys(replacements).forEach(key => {
      const value = replacements[key];
      // Only replace if it's a string or number (not null/undefined)
      if (value !== null && value !== undefined) {
        const regex = new RegExp(`:${key}\\b`, 'g');
        sanitized = sanitized.replace(regex, `:${key}/*value*/`);
      }
    });
  }

  // Truncate very long queries
  const maxLength = 2000;
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '... [truncated]';
  }

  return sanitized;
}

/**
 * Categorize database errors
 */
function categorizeError(error) {
  if (!error || !error.message) {
    return { category: 'unknown', type: 'UNKNOWN_ERROR' };
  }

  const message = error.message.toLowerCase();
  const originalMessage = error.message;

  // Syntax errors
  if (message.includes('syntax') || message.includes('parse') || message.includes('invalid sql')) {
    return { category: 'syntax', type: 'SQL_SYNTAX_ERROR', lineNumber: extractLineNumber(originalMessage) };
  }

  // Column not found
  if (message.includes('unknown column') || message.includes("column doesn't exist") || 
      message.includes('invalid column name') || message.includes('column') && message.includes('not found')) {
    return { category: 'data', type: 'COLUMN_NOT_FOUND', column: extractColumnName(originalMessage) };
  }

  // Table/view not found
  if (message.includes('table') && (message.includes("doesn't exist") || message.includes('not found')) ||
      message.includes('object') && message.includes('not found')) {
    return { category: 'data', type: 'TABLE_NOT_FOUND' };
  }

  // Permission errors
  if (message.includes('permission') || message.includes('access denied') || 
      message.includes('forbidden') || message.includes('unauthorized')) {
    return { category: 'permission', type: 'PERMISSION_DENIED' };
  }

  // Timeout errors
  if (message.includes('timeout') || message.includes('timed out') || 
      message.includes('exceeded') && message.includes('time')) {
    return { category: 'timeout', type: 'QUERY_TIMEOUT' };
  }

  // Connection errors
  if (message.includes('connection') || message.includes('connect') || 
      message.includes('network') || message.includes('econnrefused')) {
    return { category: 'connection', type: 'CONNECTION_ERROR' };
  }

  return { category: 'data', type: 'DATABASE_ERROR' };
}

/**
 * Extract line number from SQL error message
 */
function extractLineNumber(message) {
  const match = message.match(/line\s+(\d+)/i) || message.match(/at\s+line\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Extract column name from error message
 */
function extractColumnName(message) {
  const match = message.match(/['"`]([^'"`]+)['"`]/) || message.match(/column\s+['"`]?([^'"`\s]+)['"`]?/i);
  return match ? match[1] : null;
}

/**
 * Create enhanced error with query context
 */
function createErrorWithContext(error, context = {}) {
  const {
    sql,
    replacements,
    executionTime,
    pageKey,
    sourceType,
    dataSource,
    queryParams
  } = context;

  const categorized = categorizeError(error);
  const sanitizedSql = sql ? sanitizeSqlForError(sql, replacements) : null;

  // Generate helpful hints based on error type
  const hints = generateErrorHints(categorized, { pageKey, sourceType, dataSource, queryParams });

  // Create enhanced error
  const enhancedError = {
    ...error,
    queryContext: {
      category: categorized.category,
      type: categorized.type,
      lineNumber: categorized.lineNumber,
      column: categorized.column,
      sanitizedSql: sanitizedSql,
      executionTime,
      pageKey,
      sourceType,
      dataSource,
      queryParams: queryParams ? JSON.stringify(queryParams) : null,
      hints
    }
  };

  return enhancedError;
}

/**
 * Generate helpful hints based on error type and context
 */
function generateErrorHints(categorized, context = {}) {
  const { pageKey, sourceType, dataSource, queryParams } = context;
  const hints = [];

  switch (categorized.type) {
    case 'SQL_SYNTAX_ERROR':
      hints.push('Check for missing commas, parentheses, or quotes in your SQL query.');
      hints.push('Verify that all table and column names are correctly spelled.');
      if (categorized.lineNumber) {
        hints.push(`Error detected near line ${categorized.lineNumber}. Review the SQL around this line.`);
      }
      break;

    case 'COLUMN_NOT_FOUND':
      hints.push(`The column "${categorized.column}" does not exist in the data source.`);
      hints.push('Check if the column name is correct or if it needs a table alias prefix (e.g., `table.column`).');
      if (sourceType === 'PROCEDURE') {
        hints.push('For procedure-based pages, ensure the column exists in the SELECT statement of your p_sql.');
      }
      break;

    case 'TABLE_NOT_FOUND':
      hints.push(`The table or view "${dataSource || 'specified'}" does not exist.`);
      hints.push('Verify the table name is correct and accessible in the current database.');
      if (sourceType === 'PROCEDURE') {
        hints.push('For procedure-based pages, check that all tables in your p_sql exist.');
      }
      break;

    case 'QUERY_TIMEOUT':
      hints.push('The query took too long to execute. Consider:');
      hints.push('- Adding or refining filters to reduce the dataset size');
      hints.push('- Checking if indexes exist on filtered columns');
      hints.push('- Optimizing the underlying SQL query');
      break;

    case 'PERMISSION_DENIED':
      hints.push('You do not have permission to access this resource.');
      hints.push('Contact your administrator to request access.');
      break;

    case 'CONNECTION_ERROR':
      hints.push('Unable to connect to the database. This may be a temporary issue.');
      hints.push('Please try again in a few moments or contact support if the problem persists.');
      break;

    default:
      if (sourceType === 'PROCEDURE') {
        hints.push('For procedure-based pages, verify your p_sql syntax is correct.');
        hints.push('Test your query using the "Test Query" button in page configuration.');
      }
      break;
  }

  return hints;
}

/**
 * Get column suggestions for "column not found" errors
 */
function getColumnSuggestions(error, availableColumns = []) {
  if (!error || !error.queryContext || error.queryContext.type !== 'COLUMN_NOT_FOUND') {
    return [];
  }

  const missingColumn = error.queryContext.column;
  if (!missingColumn || !Array.isArray(availableColumns) || availableColumns.length === 0) {
    return [];
  }

  // Find similar column names (fuzzy match)
  const suggestions = availableColumns
    .map(col => {
      const colName = typeof col === 'string' ? col : (col.name || col);
      if (!colName) return null;

      // Exact match (case insensitive)
      if (colName.toLowerCase() === missingColumn.toLowerCase()) {
        return { name: colName, score: 100 };
      }

      // Contains match
      if (colName.toLowerCase().includes(missingColumn.toLowerCase()) || 
          missingColumn.toLowerCase().includes(colName.toLowerCase())) {
        return { name: colName, score: 50 };
      }

      // Levenshtein distance (simple version)
      const distance = levenshteinDistance(colName.toLowerCase(), missingColumn.toLowerCase());
      const maxLength = Math.max(colName.length, missingColumn.length);
      const similarity = maxLength > 0 ? (1 - distance / maxLength) * 100 : 0;

      if (similarity > 60) {
        return { name: colName, score: similarity };
      }

      return null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(s => s.name);

  return suggestions;
}

/**
 * Simple Levenshtein distance calculation
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];
  const len1 = str1.length;
  const len2 = str2.length;

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1
        );
      }
    }
  }

  return matrix[len1][len2];
}

module.exports = { 
  createError, 
  fromCode, 
  ERROR_CATALOG,
  sanitizeSqlForError,
  categorizeError,
  createErrorWithContext,
  getColumnSuggestions
};


