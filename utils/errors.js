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

module.exports = { createError, fromCode, ERROR_CATALOG };


