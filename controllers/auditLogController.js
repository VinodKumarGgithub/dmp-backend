const { success } = require('../utils/responseHandler');
const auditLogService = require('../services/auditLogService');
const { Joi, validate } = require('../utils/validationUtils');

/**
 * List audit logs
 * GET /api/audit-logs
 */
async function listAuditLogsController(req, res, next) {
  try {
    const schema = Joi.object({
      organizationId: Joi.string().allow(null, '').optional(),
      pageKey: Joi.string().allow(null, '').optional(),
      tenantId: Joi.string().allow(null, '').optional(),
      userId: Joi.string().allow(null, '').optional(),
      success: Joi.boolean().optional(),
      severity: Joi.string().valid('normal', 'warning', 'error').optional(),
      actionType: Joi.string().optional(),
      startDate: Joi.date().optional(),
      endDate: Joi.date().optional(),
      search: Joi.string().allow(null, '').optional(),
      page: Joi.number().integer().min(1).default(1),
      pageSize: Joi.number().integer().min(1).max(100).default(50)
    });

    const filters = validate(schema, req.query);
    const userOrganizationId = req.user?.organization_id || null;
    const userRole = req.user?.role || null;

    const result = await auditLogService.listAuditLogs(filters, userOrganizationId, userRole);

    res.json(success(result, 'Audit logs fetched successfully'));
  } catch (error) {
    next(error);
  }
}

/**
 * Get audit log by ID
 * GET /api/audit-logs/:id
 */
async function getAuditLogByIdController(req, res, next) {
  try {
    const { id } = req.params;
    const userOrganizationId = req.user?.organization_id || null;
    const userRole = req.user?.role || null;

    const log = await auditLogService.getAuditLogById(id, userOrganizationId, userRole);

    // Include encrypted_sql for SUPER_ADMIN - frontend will decrypt it
    // No decryption on backend anymore

    res.json(success(log, 'Audit log fetched successfully'));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listAuditLogsController,
  getAuditLogByIdController
};

