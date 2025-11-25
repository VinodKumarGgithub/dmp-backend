const { fromCode, createError, ERROR_CATALOG } = require('./errors');

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

    // Use ERROR_CATALOG message as base, add specific details if available
    const baseMessage = ERROR_CATALOG.DB_DUPLICATE_KEY.message;
    const friendlyDetails = details.length > 0 ? details : [baseMessage];
    return attachContext(fromCode('DB_DUPLICATE_KEY', friendlyDetails));
  }

  if (code === 'ER_ACCESS_DENIED_ERROR' || code === 'ELOGIN') {
    return attachContext(fromCode('DB_AUTH_FAILED'));
  }

  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'EHOSTUNREACH') {
    return attachContext(fromCode('DB_HOST_UNREACHABLE'));
  }

  if (code === 'ER_BAD_DB_ERROR') {
    return attachContext(fromCode('DB_NAME_NOT_FOUND'));
  }

  if (name && name.startsWith('SequelizeConnection')) {
    // Use ERROR_CATALOG message, but include original message in details if available
    const details = message ? [ERROR_CATALOG.DB_CONNECTION_FAILED.message] : undefined;
    return attachContext(fromCode('DB_CONNECTION_FAILED', details));
  }

  if (name === 'SequelizeDatabaseError') {
    const lower = (message || '').toLowerCase();

    if (lower.includes('unknown column') || lower.includes("doesn't exist") && lower.includes('column')) {
      return attachContext(fromCode('DB_UNKNOWN_COLUMN'));
    }

    if (lower.includes('unknown table') || lower.includes("doesn't exist") && lower.includes('table')) {
      return attachContext(fromCode('DB_UNKNOWN_TABLE'));
    }

    if (lower.includes('syntax')) {
      return attachContext(fromCode('DB_SYNTAX_ERROR'));
    }

    // Default database error - use ERROR_CATALOG message
    return attachContext(fromCode('DB_QUERY_ERROR'));
  }

  // Fallback to INTERNAL_ERROR with user-friendly message from ERROR_CATALOG
  const fallbackDetails = message ? [message] : [ERROR_CATALOG.INTERNAL_ERROR.message];
  return attachContext(createError('INTERNAL_ERROR', ERROR_CATALOG.INTERNAL_ERROR.message, 500, fallbackDetails));
}

module.exports = { mapDbError };


