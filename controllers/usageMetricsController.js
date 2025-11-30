const UsageTrackingService = require('../services/usageTrackingService');
const { fromCode } = require('../utils/errors');
const { success } = require('../utils/responseHandler');
const { isSuperAdmin } = require('../middleware/roleMiddleware');
const { License } = require('../models/License');
const { AdminUser } = require('../models/AdminUser');
const Tenant = require('../models/Tenant'); // Tenant is exported directly, not as { Tenant }

/**
 * Get usage metrics for organization
 * GET /api/usage/metrics
 */
async function getUsageMetrics(req, res, next) {
  try {
    const organizationId = req.user?.organization_id;

    // SUPER_ADMIN can query any organization or all organizations (null = all)
    // Regular users can only query their own organization
    const targetOrgId = req.query.organizationId !== undefined 
      ? (req.query.organizationId || null)  // Allow null for SUPER_ADMIN to query all
      : (isSuperAdmin(req.user) ? null : organizationId);  // SUPER_ADMIN defaults to all, others to their org
    
    // For non-SUPER_ADMIN users, organization_id is required
    if (!targetOrgId && !isSuperAdmin(req.user)) {
      return next(fromCode('VALIDATION_ERROR', ['Organization ID is required. Please ensure your account is associated with an organization.']));
    }

    // Non-SUPER_ADMIN can only query their own organization
    if (!isSuperAdmin(req.user) && targetOrgId !== organizationId) {
      return next(fromCode('FORBIDDEN', ['You can only view metrics for your own organization']));
    }

    const {
      metricType,
      startDate,
      endDate,
      groupBy = 'day' // 'hour', 'day', 'week', 'month'
    } = req.query;

    const filters = {
      metricType,
      startDate,
      endDate,
      groupBy
    };

    const metrics = await UsageTrackingService.getUsageMetrics(targetOrgId, filters);
    
    res.json(success(metrics, 'Usage metrics fetched successfully'));
  } catch (error) {
    next(error);
  }
}

/**
 * Get license compliance metrics
 * GET /api/usage/compliance
 */
async function getLicenseComplianceMetrics(req, res, next) {
  try {
    const organizationId = req.user?.organization_id;

    // SUPER_ADMIN can query any organization or all organizations (null = all)
    // Regular users can only query their own organization
    const targetOrgId = req.query.organizationId !== undefined 
      ? (req.query.organizationId || null)  // Allow null for SUPER_ADMIN to query all
      : (isSuperAdmin(req.user) ? null : organizationId);  // SUPER_ADMIN defaults to all, others to their org
    
    // For non-SUPER_ADMIN users, organization_id is required
    if (!targetOrgId && !isSuperAdmin(req.user)) {
      return next(fromCode('VALIDATION_ERROR', ['Organization ID is required. Please ensure your account is associated with an organization.']));
    }

    // Non-SUPER_ADMIN can only query their own organization
    if (!isSuperAdmin(req.user) && targetOrgId !== organizationId) {
      return next(fromCode('FORBIDDEN', ['You can only view compliance metrics for your own organization']));
    }

    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Default: last 30 days
    const endDate = req.query.endDate || new Date().toISOString().split('T')[0]; // Default: today

    // Get usage metrics from ClickHouse
    let usageMetrics = [];
    try {
      usageMetrics = await UsageTrackingService.getLicenseComplianceMetrics(
        targetOrgId,
        startDate,
        endDate
      );
      // Ensure it's an array
      if (!Array.isArray(usageMetrics)) {
        usageMetrics = [];
      }
    } catch (error) {
      // If ClickHouse fails, continue with empty array
      console.warn('Failed to fetch usage metrics from ClickHouse:', error.message);
      usageMetrics = [];
    }

    // Get license info from database
    let license = null;
    try {
      license = targetOrgId 
        ? await License.findOne({ where: { organization_id: targetOrgId } })
        : null;
    } catch (error) {
      console.warn('Failed to fetch license:', error.message);
      license = null;
    }

    // Calculate totals from usage metrics (unique users/tenants across all metrics)
    let totalUsers = 0;
    let totalTenants = 0;

    if (Array.isArray(usageMetrics) && usageMetrics.length > 0) {
      // Get max unique users and tenants from all metric types
      usageMetrics.forEach(metric => {
        if (metric.unique_users) {
          totalUsers = Math.max(totalUsers, parseInt(metric.unique_users) || 0);
        }
        if (metric.unique_tenants) {
          totalTenants = Math.max(totalTenants, parseInt(metric.unique_tenants) || 0);
        }
      });
    }

    // If no usage metrics and we have a targetOrgId, get actual counts from database
    if (targetOrgId && totalUsers === 0 && totalTenants === 0) {
      try {
        // Verify models are available
        if (!AdminUser || typeof AdminUser.count !== 'function') {
          throw new Error('AdminUser model is not available');
        }
        if (!Tenant || typeof Tenant.count !== 'function') {
          throw new Error('Tenant model is not available');
        }

        const userCount = await AdminUser.count({ where: { organization_id: targetOrgId } });
        const tenantCount = await Tenant.count({ where: { organization_id: targetOrgId } });
        totalUsers = userCount || 0;
        totalTenants = tenantCount || 0;
      } catch (dbError) {
        // If database query fails, log but continue with 0 counts
        console.warn('Failed to fetch user/tenant counts from database:', dbError.message);
        totalUsers = 0;
        totalTenants = 0;
      }
    }

    // Format response object (frontend expects this structure)
    const compliance = {
      total_users: totalUsers,
      max_users: license?.max_users || null,
      total_tenants: totalTenants,
      max_tenants: license?.max_tenants || null,
      license_status: license?.status || 'NO_LICENSE',
      expires_at: license?.expires_at ? license.expires_at.toISOString().split('T')[0] : null
    };
    
    res.json(success(compliance, 'License compliance metrics fetched successfully'));
  } catch (error) {
    next(error);
  }
}

/**
 * Get top pages by usage
 * GET /api/usage/top-pages
 */
async function getTopPages(req, res, next) {
  try {
    const organizationId = req.user?.organization_id;

    // SUPER_ADMIN can query any organization or all organizations (null = all)
    // Regular users can only query their own organization
    const targetOrgId = req.query.organizationId !== undefined 
      ? (req.query.organizationId || null)  // Allow null for SUPER_ADMIN to query all
      : (isSuperAdmin(req.user) ? null : organizationId);  // SUPER_ADMIN defaults to all, others to their org
    
    // For non-SUPER_ADMIN users, organization_id is required
    if (!targetOrgId && !isSuperAdmin(req.user)) {
      return next(fromCode('VALIDATION_ERROR', ['Organization ID is required. Please ensure your account is associated with an organization.']));
    }

    // Non-SUPER_ADMIN can only query their own organization
    if (!isSuperAdmin(req.user) && targetOrgId !== organizationId) {
      return next(fromCode('FORBIDDEN', ['You can only view top pages for your own organization']));
    }

    const limit = parseInt(req.query.limit || 10, 10);
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;

    const topPages = await UsageTrackingService.getTopPages(
      targetOrgId,
      limit,
      startDate,
      endDate
    );
    
    res.json(success(topPages, 'Top pages fetched successfully'));
  } catch (error) {
    next(error);
  }
}

/**
 * Get daily usage summary
 * GET /api/usage/summary
 */
async function getDailyUsageSummary(req, res, next) {
  try {
    const organizationId = req.user?.organization_id;

    // SUPER_ADMIN can query any organization or all organizations (null = all)
    // Regular users can only query their own organization
    const targetOrgId = req.query.organizationId !== undefined 
      ? (req.query.organizationId || null)  // Allow null for SUPER_ADMIN to query all
      : (isSuperAdmin(req.user) ? null : organizationId);  // SUPER_ADMIN defaults to all, others to their org
    
    // For non-SUPER_ADMIN users, organization_id is required
    if (!targetOrgId && !isSuperAdmin(req.user)) {
      return next(fromCode('VALIDATION_ERROR', ['Organization ID is required. Please ensure your account is associated with an organization.']));
    }

    // Non-SUPER_ADMIN can only query their own organization
    if (!isSuperAdmin(req.user) && targetOrgId !== organizationId) {
      return next(fromCode('FORBIDDEN', ['You can only view usage summary for your own organization']));
    }

    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Default: last 30 days
    const endDate = req.query.endDate || new Date().toISOString().split('T')[0]; // Default: today

    const dailyMetrics = await UsageTrackingService.getDailyUsageSummary(
      targetOrgId,
      startDate,
      endDate
    );
    
    // Wrap in expected structure (frontend expects {daily_metrics: [...]})
    const summary = {
      daily_metrics: Array.isArray(dailyMetrics) ? dailyMetrics : []
    };
    
    res.json(success(summary, 'Daily usage summary fetched successfully'));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getUsageMetrics,
  getLicenseComplianceMetrics,
  getTopPages,
  getDailyUsageSummary
};

