const express = require('express');
const { listAuditLogsController, getAuditLogByIdController } = require('../controllers/auditLogController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/roleMiddleware');

const router = express.Router();

// All audit log routes require authentication and admin access
router.get('/audit-logs', authMiddleware, requireAdmin, listAuditLogsController);
router.get('/audit-logs/:id', authMiddleware, requireAdmin, getAuditLogByIdController);

module.exports = router;

