const { fromCode } = require('./errors');
const { userBlockingService } = require('../services/userBlockingService');

/**
 * SQL Security Utility
 * Validates and sanitizes SQL queries to prevent injection and malicious operations
 */

// Dangerous SQL statements that should never be allowed in p_sql
const DANGEROUS_KEYWORDS = [
  'DROP', 'ALTER', 'TRUNCATE', 'DELETE', 'INSERT', 'UPDATE', 'CREATE', 'REPLACE',
  'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'CALL', 'DECLARE', 'SET', 'USE',
  'SHUTDOWN', 'KILL', 'BACKUP', 'RESTORE'
];

// Allowed SQL statements for read-only queries
const ALLOWED_KEYWORDS = [
  'SELECT', 'WITH', 'FROM', 'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL',
  'OUTER', 'ON', 'GROUP', 'BY', 'HAVING', 'ORDER', 'LIMIT', 'OFFSET', 'UNION',
  'ALL', 'DISTINCT', 'AS', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'LIKE', 'BETWEEN',
  'IS', 'NULL', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'COUNT', 'SUM', 'AVG',
  'MAX', 'MIN', 'CAST', 'CONVERT', 'TOP', 'FETCH', 'NEXT', 'ROWS', 'ONLY'
];

// Maximum query complexity limits for PROCEDURE
const COMPLEXITY_LIMITS = {
  maxJoins: 10,
  maxSubqueries: 5,
  maxCTEs: 3,
  maxUnionClauses: 5,
  maxLength: 50000 // Maximum SQL length in characters
};

// Higher limits for CUSTOM_QUERY (allows more complex queries)
const CUSTOM_QUERY_LIMITS = {
  maxJoins: 20,
  maxSubqueries: 10,
  maxCTEs: 5,
  maxUnionClauses: 10,
  maxLength: 100000 // Maximum SQL length in characters
};

/**
 * Check if SQL contains dangerous keywords
 */
function containsDangerousKeywords(sql) {
  if (!sql || typeof sql !== 'string') {
    return false;
  }

  const upperSql = sql.toUpperCase();
  const sqlWords = upperSql.split(/\s+/);

  for (const keyword of DANGEROUS_KEYWORDS) {
    // Check for keyword as whole word (not part of another word)
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(sql)) {
      return { dangerous: true, keyword };
    }
  }

  return { dangerous: false };
}

/**
 * Validate SQL query complexity
 * @param {string} sql - SQL query to validate
 * @param {object} limits - Complexity limits to use (defaults to COMPLEXITY_LIMITS)
 */
function validateQueryComplexity(sql, limits = COMPLEXITY_LIMITS) {
  if (!sql || typeof sql !== 'string') {
    throw fromCode('PAGE_CONFIG_INVALID', ['SQL query is required']);
  }

  // Check length
  if (sql.length > limits.maxLength) {
    throw fromCode('PAGE_CONFIG_INVALID', [
      `SQL query exceeds maximum length of ${limits.maxLength} characters`
    ]);
  }

  const upperSql = sql.toUpperCase();

  // Count JOINs
  const joinCount = (upperSql.match(/\bJOIN\b/g) || []).length;
  if (joinCount > limits.maxJoins) {
    throw fromCode('PAGE_CONFIG_INVALID', [
      `Query contains ${joinCount} joins, maximum allowed is ${limits.maxJoins}`
    ]);
  }

  // Count subqueries (SELECT within parentheses)
  const subqueryPattern = /\([^)]*SELECT[^)]*\)/gi;
  const subqueryMatches = sql.match(subqueryPattern) || [];
  if (subqueryMatches.length > limits.maxSubqueries) {
    throw fromCode('PAGE_CONFIG_INVALID', [
      `Query contains ${subqueryMatches.length} subqueries, maximum allowed is ${limits.maxSubqueries}`
    ]);
  }

  // Count CTEs (WITH clauses)
  const cteCount = (upperSql.match(/\bWITH\s+\w+\s+AS\s*\(/g) || []).length;
  if (cteCount > limits.maxCTEs) {
    throw fromCode('PAGE_CONFIG_INVALID', [
      `Query contains ${cteCount} CTEs, maximum allowed is ${limits.maxCTEs}`
    ]);
  }

  // Count UNION clauses
  const unionCount = (upperSql.match(/\bUNION\b/g) || []).length;
  if (unionCount > limits.maxUnionClauses) {
    throw fromCode('PAGE_CONFIG_INVALID', [
      `Query contains ${unionCount} UNION clauses, maximum allowed is ${limits.maxUnionClauses}`
    ]);
  }

  return true;
}

/**
 * Validate that SQL is read-only (SELECT only)
 */
function validateReadOnly(sql) {
  if (!sql || typeof sql !== 'string') {
    throw fromCode('PAGE_CONFIG_INVALID', ['SQL query is required']);
  }

  const upperSql = sql.trim().toUpperCase();

  // Must start with SELECT or WITH (for CTEs)
  if (!upperSql.startsWith('SELECT') && !upperSql.startsWith('WITH')) {
    throw fromCode('PAGE_CONFIG_INVALID', [
      'SQL query must start with SELECT or WITH (for CTEs). Only read-only queries are allowed.'
    ]);
  }

  // Check for dangerous keywords
  const dangerousCheck = containsDangerousKeywords(sql);
  if (dangerousCheck.dangerous) {
    throw fromCode('DANGEROUS_SQL_DETECTED', [
      `SQL query contains forbidden keyword: ${dangerousCheck.keyword}`,
      'Only read-only queries (SELECT statements) are allowed'
    ]);
  }

  return true;
}

/**
 * Sanitize SQL by removing comments and normalizing whitespace
 * Note: This doesn't prevent injection, but helps with validation
 */
function sanitizeSql(sql) {
  if (!sql || typeof sql !== 'string') {
    return '';
  }

  // Remove SQL comments (-- and /* */)
  let sanitized = sql
    .replace(/--.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments

  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

/**
 * Comprehensive SQL validation for p_sql
 * @param {string} sql - SQL query to validate
 * @param {object} options - Validation options
 * @param {string} options.userId - User ID for blocking on dangerous SQL (optional)
 * @param {string} options.username - Username for blocking on dangerous SQL (optional)
 * @param {string} options.sourceType - Source type ('PROCEDURE' or 'CUSTOM_QUERY') to determine limits
 */
async function validateProcedureSql(sql, options = {}) {
  const {
    checkReadOnly = true,
    checkComplexity = true,
    maxTimeout = 30000, // 30 seconds default
    userId = null,
    username = null,
    sourceType = 'PROCEDURE'
  } = options;

  if (!sql || typeof sql !== 'string' || !sql.trim()) {
    throw fromCode('PAGE_CONFIG_INVALID', ['p_sql parameter is required and must be a non-empty string']);
  }

  // Sanitize first
  const sanitized = sanitizeSql(sql);

  // Check for dangerous keywords first (before other validations)
  if (checkReadOnly) {
    const dangerousCheck = containsDangerousKeywords(sanitized);
    if (dangerousCheck.dangerous) {
      // Block user if dangerous SQL detected
      let blockingReason = null;
      if (username) {
        blockingReason = `Attempted to use dangerous SQL keyword: ${dangerousCheck.keyword}. This is a security violation.`;
        await userBlockingService.blockUserByUsername(username, blockingReason).catch(err => {
          console.error('Failed to block user after dangerous SQL detection:', err);
        });
      }
      
      // Throw proper error with details
      const errorDetails = [
        `SQL query contains forbidden keyword: ${dangerousCheck.keyword}`,
        'Only read-only queries (SELECT statements) are allowed',
        username ? 'Your account has been automatically blocked for security reasons. Please contact an administrator.' : null
      ].filter(Boolean);
      
      throw fromCode('DANGEROUS_SQL_DETECTED', errorDetails);
    }
  }

  // Validate read-only
  if (checkReadOnly) {
    validateReadOnly(sanitized);
  }

  // Validate complexity (use higher limits for CUSTOM_QUERY)
  if (checkComplexity) {
    const limits = sourceType === 'CUSTOM_QUERY' ? CUSTOM_QUERY_LIMITS : COMPLEXITY_LIMITS;
    validateQueryComplexity(sanitized, limits);
  }

  return {
    valid: true,
    sanitized,
    maxTimeout
  };
}

module.exports = {
  validateProcedureSql,
  validateReadOnly,
  validateQueryComplexity,
  containsDangerousKeywords,
  sanitizeSql,
  DANGEROUS_KEYWORDS,
  ALLOWED_KEYWORDS,
  COMPLEXITY_LIMITS,
  CUSTOM_QUERY_LIMITS
};

