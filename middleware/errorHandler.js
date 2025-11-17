const { logger } = require('../config/logger');
const { ERROR_CATALOG } = require('../utils/errors');

function errorHandler(err, req, res, next) {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  const status = err.status || 500;

  const response = {
    success: false,
    error: {
      message: err.message || (ERROR_CATALOG[err.code] && ERROR_CATALOG[err.code].message) || 'Internal Server Error',
      code: err.code || 'INTERNAL_ERROR'
    }
  };

  if (err.details) {
    response.error.details = err.details;
  }

  res.status(status).json(response);
}

module.exports = { errorHandler };


