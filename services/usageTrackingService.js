const { getClickHouseClient } = require('../config/clickhouse');
const { generateId } = require('../utils/idGenerator');
const { logger } = require('../config/logger');

/**
 * Usage Tracking Service
 * Tracks usage metrics in ClickHouse for analytics and license compliance
 */
class UsageTrackingService {
  /**
   * Track usage metric (async, non-blocking, fire-and-forget)
   * @param {Object} metricData
   */
  static async trackMetric(metricData) {
    // Fire-and-forget: use setImmediate for non-blocking
    setImmediate(async () => {
      try {
        const client = getClickHouseClient();
        if (!client) {
          // ClickHouse not available - graceful degradation
          if (process.env.NODE_ENV === 'development') {
            console.warn('ClickHouse not available, skipping usage tracking');
          }
          return;
        }

        const {
          organizationId,
          tenantId,
          userId,
          metricType, // 'query', 'export', 'api_call', 'page_view', 'login', 'feature_usage'
          pageKey,
          actionType,
          sourceType,
          dataSource,
          executionTimeMs,
          rowsReturned,
          success = true,
          errorCode,
          metadata = {},
          ipAddress
        } = metricData;

        if (!organizationId || !metricType) {
          // Skip if required fields are missing
          return;
        }

        const now = new Date();
        const eventDate = now.toISOString().split('T')[0];
        const eventTime = now.toISOString().replace('T', ' ').substring(0, 19);

        const insertData = {
          id: generateId('usage'),
          organization_id: organizationId,
          tenant_id: tenantId || null,
          user_id: userId || null,
          metric_type: metricType,
          metric_value: 1,
          page_key: pageKey || null,
          action_type: actionType || null,
          source_type: sourceType || null,
          data_source: dataSource || null,
          execution_time_ms: executionTimeMs || 0,  // Use 0 instead of NULL for projections
          rows_returned: rowsReturned || 0,          // Use 0 instead of NULL for projections
          success: success ? 1 : 0,
          error_code: errorCode || null,
          metadata: JSON.stringify(metadata),
          ip_address: ipAddress || null,
          event_date: eventDate,
          event_time: eventTime
        };

        await client.insert({
          table: 'analytics.usage_metrics',  // Use fully qualified table name
          values: [insertData],
          format: 'JSONEachRow'
        });
      } catch (error) {
        // Don't throw - tracking failures shouldn't break main flow
        // Only log in dev mode to avoid production noise
        if (process.env.NODE_ENV === 'development') {
          logger.warn('Failed to track usage metric:', error.message);
        }
      }
    });
  }

  /**
   * Get usage metrics for organization
   * @param {string} organizationId
   * @param {Object} filters
   * @returns {Promise<Array>}
   */
  static async getUsageMetrics(organizationId, filters = {}) {
    try {
      const client = getClickHouseClient();
      if (!client) {
        throw new Error('ClickHouse not available');
      }

      const {
        metricType,
        startDate,
        endDate,
        groupBy = 'day' // 'hour', 'day', 'week', 'month'
      } = filters;

      let dateGroupBy;
      switch (groupBy) {
        case 'hour':
          dateGroupBy = 'toStartOfHour(event_time)';
          break;
        case 'day':
          dateGroupBy = 'toDate(event_time)';
          break;
        case 'week':
          dateGroupBy = 'toMonday(toDate(event_time))';
          break;
        case 'month':
          dateGroupBy = 'toStartOfMonth(event_date)';
          break;
        default:
          dateGroupBy = 'toDate(event_time)';
      }

      // Build WHERE conditions with direct string interpolation (properly escaped)
      const whereConditions = [];

      if (organizationId) {
        // Escape single quotes to prevent SQL injection
        const escapedOrgId = String(organizationId).replace(/'/g, "''");
        whereConditions.push(`organization_id = '${escapedOrgId}'`);
      }

      if (metricType) {
        const escapedMetricType = String(metricType).replace(/'/g, "''");
        whereConditions.push(`metric_type = '${escapedMetricType}'`);
      }

      if (startDate) {
        whereConditions.push(`event_date >= '${startDate}'`);
      }

      if (endDate) {
        whereConditions.push(`event_date <= '${endDate}'`);
      }

      const whereClause = whereConditions.length > 0 
        ? whereConditions.join(' AND ')
        : '1=1';

      const query = `
        SELECT
          ${organizationId ? '' : 'organization_id,'}
          ${dateGroupBy} as period,
          metric_type,
          count() as total_count,
          sum(execution_time_ms) as total_execution_time_ms,
          avg(execution_time_ms) as avg_execution_time_ms,
          sum(rows_returned) as total_rows_returned,
          sum(success) as success_count,
          sum(1 - success) as error_count,
          uniqExact(user_id) as unique_users,
          uniqExact(tenant_id) as unique_tenants,
          uniqExact(page_key) as unique_pages
        FROM analytics.usage_metrics
        WHERE ${whereClause}
        GROUP BY ${organizationId ? '' : 'organization_id,'} period, metric_type
        ORDER BY ${organizationId ? '' : 'organization_id,'} period DESC, metric_type
      `;

      const result = await client.query({
        query,
        format: 'JSONEachRow'
      });

      const data = await result.json();
      
      // Log for debugging (development only)
      if (process.env.NODE_ENV === 'development') {
        logger.info('ClickHouse query executed', {
          organizationId: organizationId || 'all',
          filters,
          resultCount: Array.isArray(data) ? data.length : 0
        });
      }

      return data;
    } catch (error) {
      logger.error('Failed to get usage metrics:', error);
      throw error;
    }
  }

  /**
   * Get license compliance metrics
   * @param {string} organizationId
   * @param {string} startDate
   * @param {string} endDate
   * @returns {Promise<Array>}
   */
  static async getLicenseComplianceMetrics(organizationId, startDate, endDate) {
    try {
      const client = getClickHouseClient();
      if (!client) {
        throw new Error('ClickHouse not available');
      }

      // Build WHERE conditions with direct string interpolation
      const whereConditions = [];

      if (organizationId) {
        const escapedOrgId = String(organizationId).replace(/'/g, "''");
        whereConditions.push(`organization_id = '${escapedOrgId}'`);
      }

      if (startDate) {
        whereConditions.push(`event_date >= '${startDate}'`);
      }

      if (endDate) {
        whereConditions.push(`event_date <= '${endDate}'`);
      }

      const whereClause = whereConditions.length > 0 
        ? whereConditions.join(' AND ')
        : '1=1';

      const query = `
        SELECT
          ${organizationId ? '' : 'organization_id,'}
          metric_type,
          count() as total_usage,
          uniqExact(user_id) as unique_users,
          uniqExact(tenant_id) as unique_tenants
        FROM analytics.usage_metrics
        WHERE ${whereClause}
        GROUP BY ${organizationId ? '' : 'organization_id,'} metric_type
      `;

      const result = await client.query({
        query,
        format: 'JSONEachRow'
      });

      return await result.json();
    } catch (error) {
      logger.error('Failed to get license compliance metrics:', error);
      throw error;
    }
  }

  /**
   * Get top pages by usage
   * @param {string} organizationId
   * @param {number} limit
   * @param {string} startDate
   * @param {string} endDate
   * @returns {Promise<Array>}
   */
  static async getTopPages(organizationId, limit = 10, startDate = null, endDate = null) {
    try {
      const client = getClickHouseClient();
      if (!client) {
        throw new Error('ClickHouse not available');
      }

      // Build WHERE conditions with direct string interpolation
      const whereConditions = ['page_key IS NOT NULL'];

      if (organizationId) {
        const escapedOrgId = String(organizationId).replace(/'/g, "''");
        whereConditions.push(`organization_id = '${escapedOrgId}'`);
      }

      if (startDate) {
        whereConditions.push(`event_date >= '${startDate}'`);
      }

      if (endDate) {
        whereConditions.push(`event_date <= '${endDate}'`);
      }

      const whereClause = whereConditions.join(' AND ');
      const limitValue = parseInt(limit, 10) || 10;

      const query = `
        SELECT
          ${organizationId ? '' : 'organization_id,'}
          page_key,
          count() as total_count,
          avg(execution_time_ms) as avg_execution_time_ms,
          sum(rows_returned) as total_rows_returned,
          uniqExact(user_id) as unique_users
        FROM analytics.usage_metrics
        WHERE ${whereClause}
        GROUP BY ${organizationId ? '' : 'organization_id,'} page_key
        ORDER BY total_count DESC
        LIMIT ${limitValue}
      `;

      const result = await client.query({
        query,
        format: 'JSONEachRow'
      });

      return await result.json();
    } catch (error) {
      logger.error('Failed to get top pages:', error);
      throw error;
    }
  }

  /**
   * Get daily usage summary (uses materialized view for performance)
   * @param {string} organizationId
   * @param {string} startDate
   * @param {string} endDate
   * @returns {Promise<Array>}
   */
  static async getDailyUsageSummary(organizationId, startDate, endDate) {
    try {
      const client = getClickHouseClient();
      if (!client) {
        throw new Error('ClickHouse not available');
      }

      // Build WHERE conditions with direct string interpolation
      const whereConditions = [];

      if (organizationId) {
        const escapedOrgId = String(organizationId).replace(/'/g, "''");
        whereConditions.push(`organization_id = '${escapedOrgId}'`);
      }

      if (startDate) {
        whereConditions.push(`event_date >= '${startDate}'`);
      }

      if (endDate) {
        whereConditions.push(`event_date <= '${endDate}'`);
      }

      const whereClause = whereConditions.length > 0 
        ? whereConditions.join(' AND ')
        : '1=1';

      const query = `
        SELECT
          ${organizationId ? '' : 'organization_id,'}
          metric_type,
          event_date,
          total_count,
          total_execution_time_ms,
          total_rows_returned,
          success_count,
          error_count,
          unique_users,
          unique_tenants,
          unique_pages
        FROM analytics.usage_metrics_daily
        WHERE ${whereClause}
        ORDER BY ${organizationId ? '' : 'organization_id,'} event_date DESC, metric_type
      `;

      const result = await client.query({
        query,
        format: 'JSONEachRow'
      });

      return await result.json();
    } catch (error) {
      logger.error('Failed to get daily usage summary:', error);
      throw error;
    }
  }
}

module.exports = UsageTrackingService;

