# ClickHouse Usage Tracking

## Overview

ClickHouse is used for storing and analyzing usage metrics for analytics, license compliance, and billing purposes. It provides high-performance analytics on large volumes of usage data.

## Setup

### 1. Environment Variables

Add to your `.env` file:

```env
# ClickHouse Configuration
CLICKHOUSE_HOST=http://localhost:8123
CLICKHOUSE_DATABASE=analytics
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=your_password
```

### 2. Create Schema

Run the setup script to create the database and tables:

```bash
npm run setup:clickhouse
```

Or manually execute the SQL file:

```bash
clickhouse-client < sql/migrations/create_clickhouse_schema.sql
```

## Architecture

### Tables

1. **`usage_metrics`** - Main table for all usage events
   - Stores individual usage events (queries, exports, API calls, etc.)
   - Partitioned by month for efficient queries
   - TTL: 1 year (auto-deletes old data)

2. **`usage_metrics_daily`** - Daily aggregated metrics
   - Materialized view that auto-aggregates daily metrics
   - Used for fast reporting and dashboards
   - Automatically updated when new data is inserted

### Metric Types

- `query` - Database queries executed
- `export` - Data exports/downloads
- `api_call` - API calls (if API access is enabled)
- `page_view` - Page views/accesses
- `login` - User logins
- `feature_usage` - Feature usage tracking

## Usage

### Automatic Tracking

Usage metrics are automatically tracked for:

1. **Query Executions** - Tracked via `logQueryExecution()` in `pageService.js`
2. **Data Exports** - Tracked in `getAllPageData()` for downloads
3. **Page Views** - Tracked in `getPageData()` for regular queries
4. **User Logins** - Tracked in `authController.js` after successful login

### Manual Tracking

To track custom events:

```javascript
const UsageTrackingService = require('./services/usageTrackingService');

// Track a custom event
UsageTrackingService.trackMetric({
  organizationId: 'org_123',
  userId: 'user_456',
  metricType: 'feature_usage',
  metadata: {
    feature: 'custom_branding',
    action: 'enabled'
  }
});
```

## API Endpoints

### Get Usage Metrics

**GET** `/api/usage/metrics`

Query parameters:
- `organizationId` (optional, SUPER_ADMIN only) - Organization to query
- `metricType` (optional) - Filter by metric type: 'query', 'export', 'page_view', 'login', etc.
- `startDate` (optional) - Start date (YYYY-MM-DD)
- `endDate` (optional) - End date (YYYY-MM-DD)
- `groupBy` (optional) - Group by: 'hour', 'day', 'week', 'month' (default: 'day')

**Example:**
```bash
GET /api/usage/metrics?startDate=2024-01-01&endDate=2024-01-31&groupBy=day&metricType=query
```

### Get License Compliance Metrics

**GET** `/api/usage/compliance`

Query parameters:
- `organizationId` (optional, SUPER_ADMIN only) - Organization to query
- `startDate` (optional, default: 30 days ago) - Start date (YYYY-MM-DD)
- `endDate` (optional, default: today) - End date (YYYY-MM-DD)

**Example:**
```bash
GET /api/usage/compliance?startDate=2024-01-01&endDate=2024-01-31
```

### Get Top Pages

**GET** `/api/usage/top-pages`

Query parameters:
- `organizationId` (optional, SUPER_ADMIN only) - Organization to query
- `limit` (optional, default: 10) - Number of top pages to return
- `startDate` (optional) - Start date (YYYY-MM-DD)
- `endDate` (optional) - End date (YYYY-MM-DD)

**Example:**
```bash
GET /api/usage/top-pages?limit=10&startDate=2024-01-01&endDate=2024-01-31
```

### Get Daily Usage Summary

**GET** `/api/usage/summary`

Query parameters:
- `organizationId` (optional, SUPER_ADMIN only) - Organization to query
- `startDate` (optional, default: 30 days ago) - Start date (YYYY-MM-DD)
- `endDate` (optional, default: today) - End date (YYYY-MM-DD)

**Example:**
```bash
GET /api/usage/summary?startDate=2024-01-01&endDate=2024-01-31
```

## Programmatic Usage (Service Methods)

You can also use the service methods directly in your code:

### Get Usage Metrics

```javascript
const UsageTrackingService = require('./services/usageTrackingService');

// Get usage metrics for an organization
const metrics = await UsageTrackingService.getUsageMetrics('org_123', {
  metricType: 'query',
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  groupBy: 'day' // 'hour', 'day', 'week', 'month'
});
```

### Get License Compliance Metrics

```javascript
const metrics = await UsageTrackingService.getLicenseComplianceMetrics(
  'org_123',
  '2024-01-01',
  '2024-01-31'
);
```

### Get Top Pages

```javascript
const topPages = await UsageTrackingService.getTopPages(
  'org_123',
  10, // limit
  '2024-01-01', // startDate
  '2024-01-31'  // endDate
);
```

### Get Daily Summary

```javascript
const summary = await UsageTrackingService.getDailyUsageSummary(
  'org_123',
  '2024-01-01',
  '2024-01-31'
);
```

## Direct ClickHouse Queries

You can also query ClickHouse directly for custom analytics:

### Daily Query Count

```sql
SELECT
  organization_id,
  toDate(event_time) as date,
  count() as query_count
FROM analytics.usage_metrics
WHERE metric_type = 'query'
  AND event_date >= today() - 30
GROUP BY organization_id, date
ORDER BY date DESC;
```

### Top Pages by Usage

```sql
SELECT
  page_key,
  count() as access_count,
  sum(rows_returned) as total_rows
FROM analytics.usage_metrics
WHERE organization_id = 'org_123'
  AND metric_type = 'query'
  AND event_date >= today() - 7
GROUP BY page_key
ORDER BY access_count DESC
LIMIT 10;
```

### License Compliance Report

```sql
SELECT
  metric_type,
  count() as total_usage,
  uniqExact(user_id) as unique_users,
  uniqExact(tenant_id) as unique_tenants
FROM analytics.usage_metrics
WHERE organization_id = 'org_123'
  AND event_date >= '2024-01-01'
  AND event_date <= '2024-01-31'
GROUP BY metric_type;
```

## Performance

- **Write Performance**: ClickHouse handles high write volumes efficiently
- **Query Performance**: Uses columnar storage and materialized views for fast aggregations
- **Partitioning**: Data is partitioned by month for efficient queries
- **TTL**: Old data is automatically deleted after 1 year

## Monitoring

### Check ClickHouse Connection

```javascript
const { testConnection } = require('./config/clickhouse');
const result = await testConnection();
console.log(result); // { connected: true } or { connected: false, error: '...' }
```

### Check Data Volume

```sql
SELECT
  count() as total_events,
  uniqExact(organization_id) as unique_orgs,
  min(event_date) as earliest_date,
  max(event_date) as latest_date
FROM analytics.usage_metrics;
```

## Troubleshooting

### ClickHouse Not Available

If ClickHouse is not available, the system gracefully degrades:
- Usage tracking is skipped (no errors)
- All other functionality continues to work
- Warning logged in development mode only

### Connection Issues

1. Check ClickHouse is running: `curl http://localhost:8123`
2. Verify environment variables are set correctly
3. Check ClickHouse logs for errors

### Schema Issues

If schema setup fails:
1. Check ClickHouse logs
2. Manually execute SQL statements one by one
3. Verify user has CREATE DATABASE and CREATE TABLE permissions

## Best Practices

1. **Batch Inserts**: ClickHouse handles batch inserts efficiently
2. **Use Materialized Views**: For frequently queried aggregations
3. **Partitioning**: Data is automatically partitioned by month
4. **TTL**: Old data is automatically cleaned up
5. **Indexing**: ORDER BY clause provides efficient queries

## Future Enhancements

- Real-time dashboards using ClickHouse data
- Automated reports and alerts
- Usage-based billing integration
- Advanced analytics and ML insights

