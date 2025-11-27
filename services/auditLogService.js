const { QueryAuditLog } = require('../models/QueryAuditLog');
const { Op } = require('sequelize');
const { fromCode } = require('../utils/errors');

/**
 * List audit logs with filtering and pagination
 * @param {Object} filters - Filter options
 * @param {string} filters.organizationId - Filter by organization ID
 * @param {string} filters.pageKey - Filter by page key
 * @param {string} filters.tenantId - Filter by tenant ID
 * @param {string} filters.userId - Filter by user ID
 * @param {boolean} filters.success - Filter by success status
 * @param {string} filters.severity - Filter by severity (normal, warning, error)
 * @param {string} filters.actionType - Filter by action type
 * @param {Date} filters.startDate - Filter by start date
 * @param {Date} filters.endDate - Filter by end date
 * @param {string} filters.search - Search in page_key, error_message
 * @param {number} filters.page - Page number (default: 1)
 * @param {number} filters.pageSize - Page size (default: 50)
 * @param {string} userOrganizationId - User's organization ID (for filtering)
 * @param {string} userRole - User's role (SUPER_ADMIN sees all)
 * @returns {Promise<{logs: Array, total: number, page: number, pageSize: number}>}
 */
async function listAuditLogs(filters = {}, userOrganizationId = null, userRole = null) {
  try {
    const {
      organizationId,
      pageKey,
      tenantId,
      userId,
      success,
      severity,
      actionType,
      startDate,
      endDate,
      search,
      page = 1,
      pageSize = 50
    } = filters;

    // Build where clause
    const where = {};

    // Organization filtering: SUPER_ADMIN sees all, others see only their org
    if (userRole !== 'SUPER_ADMIN' && userOrganizationId) {
      where.organization_id = userOrganizationId;
    } else if (organizationId) {
      where.organization_id = organizationId;
    }

    if (pageKey) {
      where.page_key = pageKey;
    }

    if (tenantId) {
      where.tenant_id = tenantId;
    }

    if (userId) {
      where.user_id = userId;
    }

    if (success !== undefined && success !== null) {
      where.success = success === true || success === 'true';
    }

    if (severity) {
      where.severity = severity;
    }

    if (actionType) {
      where.action_type = actionType;
    }

    // Date range filtering
    if (startDate || endDate) {
      where.createdOn = {};
      if (startDate) {
        where.createdOn[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        where.createdOn[Op.lte] = new Date(endDate);
      }
    }

    // Search in page_key and error_message
    if (search) {
      where[Op.or] = [
        { page_key: { [Op.like]: `%${search}%` } },
        { error_message: { [Op.like]: `%${search}%` } }
      ];
    }

    // Calculate pagination
    const offset = (page - 1) * pageSize;
    const limit = parseInt(pageSize, 10);

    // Build attributes list - include encrypted_sql for ADMIN and SUPER_ADMIN
    const attributes = [
      'id',
      'organization_id',
      'page_key',
      'tenant_id',
      'user_id',
      'ip_address',
      'execution_time_ms',
      'rows_returned',
      'success',
      'error_message',
      'action_type',
      'severity',
      'error_code',
      'source_type',
      'data_source',
      'createdOn'
    ];

    // Include encrypted_sql for ADMIN and SUPER_ADMIN
    if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
      attributes.push('encrypted_sql');
    }

    // Fetch logs and total count
    const { count, rows } = await QueryAuditLog.findAndCountAll({
      where,
      order: [['createdOn', 'DESC']],
      limit,
      offset,
      attributes
    });

    return {
      logs: rows.map(log => log.toJSON()),
      total: count,
      page: parseInt(page, 10),
      pageSize: limit
    };
  } catch (error) {
    throw fromCode('DB_ERROR', [`Failed to fetch audit logs: ${error.message}`]);
  }
}

/**
 * Get audit log by ID
 * @param {string} logId - Audit log ID
 * @param {string} userOrganizationId - User's organization ID
 * @param {string} userRole - User's role
 * @returns {Promise<Object>}
 */
async function getAuditLogById(logId, userOrganizationId = null, userRole = null) {
  try {
    const where = { id: logId };

    // Organization filtering: SUPER_ADMIN sees all, others see only their org
    if (userRole !== 'SUPER_ADMIN' && userOrganizationId) {
      where.organization_id = userOrganizationId;
    }

    const log = await QueryAuditLog.findOne({
      where,
      attributes: [
        'id',
        'organization_id',
        'page_key',
        'tenant_id',
        'user_id',
        'ip_address',
        'encrypted_sql',
        'execution_time_ms',
        'rows_returned',
        'success',
        'error_message',
        'query_params',
        'action_type',
        'severity',
        'error_code',
        'source_type',
        'data_source',
        'query_context',
        'createdOn'
      ]
    });

    if (!log) {
      throw fromCode('NOT_FOUND', ['Audit log not found']);
    }

    return log.toJSON();
  } catch (error) {
    if (error.code) throw error;
    throw fromCode('DB_ERROR', [`Failed to fetch audit log: ${error.message}`]);
  }
}

/**
 * Decrypt SQL from audit log (for SUPER_ADMIN only)
 * @param {string} encryptedSql - Encrypted SQL string
 * @returns {string|null} - Decrypted SQL or null
 */
function decryptSql(encryptedSql) {
  if (!encryptedSql) return null;

  const crypto = require('crypto');
  const LOG_ENCRYPTION_KEY = process.env.LOG_ENCRYPTION_KEY || '';
  
  if (!LOG_ENCRYPTION_KEY) {
    return null; // No encryption key configured
  }

  try {
    const key = crypto.createHash('sha256').update(LOG_ENCRYPTION_KEY).digest();
    const [ivBase64, encrypted] = encryptedSql.split(':');
    if (!ivBase64 || !encrypted) return null;

    const iv = Buffer.from(ivBase64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    return null; // Failed to decrypt
  }
}

module.exports = {
  listAuditLogs,
  getAuditLogById,
  decryptSql
};

