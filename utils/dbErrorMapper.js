const { fromCode, createError } = require('./errors');

function mapDbError(error) {
  const message = (error && error.message) || '';
  const name = (error && error.name) || '';
  const code = (error && error.original && error.original.code) || (error && error.parent && error.parent.code) || '';

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

    return fromCode('DB_DUPLICATE_KEY', [friendlyMessage]);
  }

  if (code === 'ER_ACCESS_DENIED_ERROR' || code === 'ELOGIN') {
    return fromCode('DB_AUTH_FAILED', ['Database credentials are invalid']);
  }

  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'EHOSTUNREACH') {
    return fromCode('DB_HOST_UNREACHABLE', ['Database host/port unreachable']);
  }

  if (code === 'ER_BAD_DB_ERROR') {
    return fromCode('DB_NAME_NOT_FOUND', ['Database name does not exist']);
  }

  if (name && name.startsWith('SequelizeConnection')) {
    return fromCode('DB_CONNECTION_FAILED', [message]);
  }

  if (name === 'SequelizeDatabaseError') {
    return fromCode('DB_INVALID_CONFIG', [message]);
  }

  return createError('INTERNAL_ERROR', 'Database operation failed', 500, [message]);
}

module.exports = { mapDbError };


