const { fromCode, createError } = require('./errors');

function mapDbError(error) {
  const message = (error && error.message) || '';
  const name = (error && error.name) || '';
  const code = (error && error.original && error.original.code) || (error && error.parent && error.parent.code) || '';
  const attachContext = (errObj) => {
    if (error && error.queryContext) {
      errObj.queryContext = error.queryContext;
    }
    return errObj;
  };

  if (name === 'SequelizeUniqueConstraintError') {
    // Sequelize provides details in `error.errors`
    let details = [];
    if (Array.isArray(error.errors)) {
      details = error.errors.map((err) => {
        return `${err.path} = "${err.value}" already exists`;
      });
    }

    const friendlyMessage =
      details.length > 0
        ? `Duplicate entry: ${details.join(', ')}`
        : 'Duplicate value violates unique constraint';

    return attachContext(fromCode('DB_DUPLICATE_KEY', [friendlyMessage]));
  }

  if (code === 'ER_ACCESS_DENIED_ERROR' || code === 'ELOGIN') {
    return attachContext(fromCode('DB_AUTH_FAILED', ['Database credentials are invalid']));
  }

  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'EHOSTUNREACH') {
    return attachContext(fromCode('DB_HOST_UNREACHABLE', ['Database host/port unreachable']));
  }

  if (code === 'ER_BAD_DB_ERROR') {
    return attachContext(fromCode('DB_NAME_NOT_FOUND', ['Database name does not exist']));
  }

  if (name && name.startsWith('SequelizeConnection')) {
    const details = message ? [message] : ['Database connection failed'];
    return attachContext(fromCode('DB_CONNECTION_FAILED', details));
  }

  if (name === 'SequelizeDatabaseError') {
    const lower = (message || '').toLowerCase();
    const details = message ? [message] : undefined;

    if (lower.includes('unknown column') || lower.includes("doesn't exist") && lower.includes('column')) {
      return attachContext(fromCode('DB_UNKNOWN_COLUMN', details || ['Unknown column referenced in query']));
    }

    if (lower.includes('unknown table') || lower.includes("doesn't exist") && lower.includes('table')) {
      return attachContext(fromCode('DB_UNKNOWN_TABLE', details || ['Unknown table referenced in query']));
    }

    if (lower.includes('syntax')) {
      return attachContext(fromCode('DB_SYNTAX_ERROR', details || ['SQL syntax error']));
    }

    return attachContext(fromCode('DB_QUERY_ERROR', details || ['Database query failed']));
  }

  const fallbackDetails = message ? [message] : ['Database operation failed'];
  return attachContext(createError('INTERNAL_ERROR', 'Database operation failed', 500, fallbackDetails));
}

module.exports = { mapDbError };


