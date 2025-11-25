const { logger } = require('../config/logger');
const { ERROR_CATALOG } = require('../utils/errors');

function errorHandler(err, req, res, next) {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  
  // Determine error code and get message from ERROR_CATALOG (centralized source)
  const errorCode = err.code || 'INTERNAL_ERROR';
  const catalogEntry = ERROR_CATALOG[errorCode];
  
  // Use error's message if it exists (may be user-friendly from createErrorWithContext)
  // Otherwise fall back to ERROR_CATALOG message
  // This ensures all errors use centralized, user-friendly messages
  const message = err.message || (catalogEntry && catalogEntry.message) || ERROR_CATALOG.INTERNAL_ERROR.message;
  const status = err.status || (catalogEntry && catalogEntry.status) || 500;

  const response = {
    success: false,
    error: {
      message: message,
      code: errorCode
    }
  };

  // Include details if available (may contain user-friendly messages)
  if (err.details) {
    response.error.details = err.details;
  }

  // Include query context if available (for enhanced error messages with hints)
  if (err.queryContext) {
    response.error.queryContext = err.queryContext;
  }

  res.status(status).json(response);
}

module.exports = { errorHandler };


