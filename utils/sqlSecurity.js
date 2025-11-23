const { fromCode } = require('./errors');

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

// Maximum query complexity limits
const COMPLEXITY_LIMITS = {
  maxJoins: 10,
  maxSubqueries: 5,
  maxCTEs: 3,
  maxUnionClauses: 5,
  maxLength: 50000 // Maximum SQL length in characters
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
 */
function validateQueryComplexity(sql) {
  if (!sql || typeof sql !== 'string') {
    throw fromCode('PAGE_CONFIG_INVALID', ['SQL query is required']);
  }

  // Check length
  if (sql.length > COMPLEXITY_LIMITS.maxLength) {
    throw fromCode('PAGE_CONFIG_INVALID', [
      `SQL query exceeds maximum length of ${COMPLEXITY_LIMITS.maxLength} characters`
    ]);
  }

  const upperSql = sql.toUpperCase();

  // Count JOINs
  const joinCount = (upperSql.match(/\bJOIN\b/g) || []).length;
  if (joinCount > COMPLEXITY_LIMITS.maxJoins) {
    throw fromCode('PAGE_CONFIG_INVALID', [
      `Query contains ${joinCount} joins, maximum allowed is ${COMPLEXITY_LIMITS.maxJoins}`
    ]);
  }

  // Count subqueries (SELECT within parentheses)
  const subqueryPattern = /\([^)]*SELECT[^)]*\)/gi;
  const subqueryMatches = sql.match(subqueryPattern) || [];
  if (subqueryMatches.length > COMPLEXITY_LIMITS.maxSubqueries) {
    throw fromCode('PAGE_CONFIG_INVALID', [
      `Query contains ${subqueryMatches.length} subqueries, maximum allowed is ${COMPLEXITY_LIMITS.maxSubqueries}`
    ]);
  }

  // Count CTEs (WITH clauses)
  const cteCount = (upperSql.match(/\bWITH\s+\w+\s+AS\s*\(/g) || []).length;
  if (cteCount > COMPLEXITY_LIMITS.maxCTEs) {
    throw fromCode('PAGE_CONFIG_INVALID', [
      `Query contains ${cteCount} CTEs, maximum allowed is ${COMPLEXITY_LIMITS.maxCTEs}`
    ]);
  }

  // Count UNION clauses
  const unionCount = (upperSql.match(/\bUNION\b/g) || []).length;
  if (unionCount > COMPLEXITY_LIMITS.maxUnionClauses) {
    throw fromCode('PAGE_CONFIG_INVALID', [
      `Query contains ${unionCount} UNION clauses, maximum allowed is ${COMPLEXITY_LIMITS.maxUnionClauses}`
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
    throw fromCode('PAGE_CONFIG_INVALID', [
      `SQL query contains forbidden keyword: ${dangerousCheck.keyword}. Only read-only queries are allowed.`
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
 */
function validateProcedureSql(sql, options = {}) {
  const {
    checkReadOnly = true,
    checkComplexity = true,
    maxTimeout = 30000 // 30 seconds default
  } = options;

  if (!sql || typeof sql !== 'string' || !sql.trim()) {
    throw fromCode('PAGE_CONFIG_INVALID', ['p_sql parameter is required and must be a non-empty string']);
  }

  // Sanitize first
  const sanitized = sanitizeSql(sql);

  // Validate read-only
  if (checkReadOnly) {
    validateReadOnly(sanitized);
  }

  // Validate complexity
  if (checkComplexity) {
    validateQueryComplexity(sanitized);
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
  COMPLEXITY_LIMITS
};

