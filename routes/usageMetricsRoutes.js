const express = require('express');
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/roleMiddleware');
const {
  getUsageMetrics,
  getLicenseComplianceMetrics,
  getTopPages,
  getDailyUsageSummary
} = require('../controllers/usageMetricsController');

const router = express.Router();

// All usage metrics routes require authentication and admin access
router.use(authMiddleware);
router.use(requireAdmin);

/**
 * GET /api/usage/metrics
 * Get usage metrics for organization
 * Query params:
 *   - organizationId (optional, SUPER_ADMIN only)
 *   - metricType (optional: 'query', 'export', 'page_view', etc.)
 *   - startDate (optional: YYYY-MM-DD)
 *   - endDate (optional: YYYY-MM-DD)
 *   - groupBy (optional: 'hour', 'day', 'week', 'month', default: 'day')
 */
router.get('/metrics', getUsageMetrics);

/**
 * GET /api/usage/compliance
 * Get license compliance metrics
 * Query params:
 *   - organizationId (optional, SUPER_ADMIN only)
 *   - startDate (optional: YYYY-MM-DD, default: 30 days ago)
 *   - endDate (optional: YYYY-MM-DD, default: today)
 */
router.get('/compliance', getLicenseComplianceMetrics);

/**
 * GET /api/usage/top-pages
 * Get top pages by usage
 * Query params:
 *   - organizationId (optional, SUPER_ADMIN only)
 *   - limit (optional, default: 10)
 *   - startDate (optional: YYYY-MM-DD)
 *   - endDate (optional: YYYY-MM-DD)
 */
router.get('/top-pages', getTopPages);

/**
 * GET /api/usage/summary
 * Get daily usage summary (uses materialized view for performance)
 * Query params:
 *   - organizationId (optional, SUPER_ADMIN only)
 *   - startDate (optional: YYYY-MM-DD, default: 30 days ago)
 *   - endDate (optional: YYYY-MM-DD, default: today)
 */
router.get('/summary', getDailyUsageSummary);

module.exports = router;

