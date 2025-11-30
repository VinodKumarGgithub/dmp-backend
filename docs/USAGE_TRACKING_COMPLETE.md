# Complete Usage Tracking Documentation

## Overview

This document provides a comprehensive overview of what usage metrics are being tracked, how they're tracked, and what data is collected.

## How We Track Usage

### Tracking Mechanism

1. **Fire-and-Forget Pattern**
   - Uses `setImmediate()` for non-blocking execution
   - Never blocks the main request flow
   - Errors are caught and logged (dev mode only)

2. **Graceful Degradation**
   - If ClickHouse is unavailable, tracking is skipped silently
   - No errors thrown; system continues normally
   - Warning logged in development mode only

3. **Automatic Tracking**
   - No manual calls needed in controllers
   - Integrated into service layer
   - Optimized helper functions to avoid duplication

## What We're Tracking

### 1. Query Executions (`metric_type: 'query'`)

**What:** Every database query executed against tenant databases

**Where Tracked:**
- `logQueryExecution()` in `pageService.js` (line 463-479)
- Called for all query types: TABLE, VIEW, PROCEDURE

**Data Tracked:**
```javascript
{
  organizationId: "org_123",        // Organization ID
  tenantId: "tenant_456",           // Tenant ID
  userId: "user_789",               // User ID
  metricType: "query",              // Metric type
  pageKey: "page_name",             // Page accessed
  actionType: "data_query",         // Action type
  sourceType: "TABLE" | "VIEW" | "PROCEDURE",  // Source type
  dataSource: "table_name",         // Table/view/procedure name
  executionTimeMs: 150,             // Query execution time (ms)
  rowsReturned: 1000,               // Number of rows returned
  success: true,                     // Success/failure
  errorCode: null,                   // Error code if failed
  ipAddress: "192.168.1.1"          // User IP address
}
```

**Use Cases:**
- Performance monitoring
- Query analytics
- Error tracking
- Usage-based billing

---

### 2. Data Exports (`metric_type: 'export'`)

**What:** Every CSV/Excel download/export operation

**Where Tracked:**
- `getAllPageData()` in `pageService.js`
- All export paths:
  - PROCEDURE exports (with baseSql)
  - PROCEDURE exports (without baseSql)
  - TABLE exports
  - VIEW exports (normal query)
  - VIEW exports (in-memory filtering)

**Data Tracked:**
```javascript
{
  organizationId: "org_123",        // Organization ID
  tenantId: "tenant_456",           // Tenant ID
  userId: "user_789",               // User ID
  metricType: "export",             // Metric type
  pageKey: "page_name",             // Page exported
  actionType: "download",            // Action type
  sourceType: "TABLE" | "VIEW" | "PROCEDURE",  // Source type
  dataSource: "table_name",         // Table/view/procedure name
  executionTimeMs: 500,             // Export execution time (ms)
  rowsReturned: 5000,               // Number of rows exported
  success: true,                     // Success/failure
  metadata: {
    format: "csv" | "excel",        // Export format
    exportType: "full_export"       // Export type
  },
  ipAddress: "192.168.1.1"          // User IP address
}
```

**Use Cases:**
- Export usage analytics
- Billing for data exports
- Compliance tracking
- User activity monitoring

---

### 3. Page Views (`metric_type: 'page_view'`)

**What:** Every page access/view (regular queries, not downloads)

**Where Tracked:**
- `getPageData()` in `pageService.js` (line 1654-1671)
- Only for regular queries (not downloads)
- All source types: TABLE, VIEW, PROCEDURE

**Data Tracked:**
```javascript
{
  organizationId: "org_123",        // Organization ID
  tenantId: "tenant_456",           // Tenant ID
  userId: "user_789",               // User ID
  metricType: "page_view",          // Metric type
  pageKey: "page_name",             // Page accessed
  actionType: "data_query",         // Action type
  sourceType: "TABLE" | "VIEW" | "PROCEDURE",  // Source type
  dataSource: "table_name",         // Table/view/procedure name
  executionTimeMs: 150,             // Page load time (ms)
  rowsReturned: 100,                // Rows displayed
  success: true,                     // Success/failure
  ipAddress: "192.168.1.1"          // User IP address
}
```

**Use Cases:**
- Page popularity analytics
- User engagement tracking
- Performance monitoring
- Feature usage analysis

---

### 4. User Logins (`metric_type: 'login'`)

**What:** Every successful user login

**Where Tracked:**
- `authController.js` after successful login (line 46-56)

**Data Tracked:**
```javascript
{
  organizationId: "org_123",        // Organization ID
  userId: "user_789",               // User ID
  metricType: "login",              // Metric type
  success: true,                     // Always true (only tracked on success)
  ipAddress: "192.168.1.1"          // User IP address
}
```

**Use Cases:**
- User activity tracking
- Security monitoring
- Login analytics
- Active user counts

---

## Tracking Flow

### Query Execution Flow

```
User Request → getPageData()
  ↓
Execute Query
  ↓
logQueryExecution() → QueryAuditLog (MySQL) + ClickHouse ('query')
  ↓
trackMetric() → ClickHouse ('page_view')
  ↓
Return Data
```

### Export Flow

```
User Request → downloadPageData()
  ↓
getAllPageData()
  ↓
Execute Query (no pagination)
  ↓
trackExportUsage() → ClickHouse ('export')
  ↓
Return Data
```

### Login Flow

```
User Login → authController.login()
  ↓
Validate Credentials
  ↓
Generate Token
  ↓
trackMetric() → ClickHouse ('login')
  ↓
Return Token
```

## Data Storage

### ClickHouse Tables

1. **`usage_metrics`** - Main events table
   - Stores all individual usage events
   - Partitioned by month
   - TTL: 1 year (auto-deletes old data)

2. **`usage_metrics_daily`** - Daily aggregated table
   - Materialized view (auto-updated)
   - Pre-aggregated for fast reporting
   - Used for dashboards and reports

### Data Retention

- **Individual Events:** 1 year (TTL)
- **Daily Aggregates:** Permanent (for historical trends)
- **Auto-cleanup:** ClickHouse automatically deletes old data

## Optimization Features

### 1. Helper Functions

- `trackExportUsage()` - Optimized helper for export tracking
- Avoids code duplication
- Single point of maintenance

### 2. Non-Blocking

- All tracking is fire-and-forget
- Never blocks user requests
- Errors don't affect main flow

### 3. Graceful Degradation

- System works even if ClickHouse is down
- Tracking failures are silent (dev mode logging only)
- No impact on user experience

## Querying Usage Data

### API Endpoints

1. **GET `/api/usage/metrics`** - Get usage metrics with filters
2. **GET `/api/usage/compliance`** - Get license compliance metrics
3. **GET `/api/usage/top-pages`** - Get top pages by usage
4. **GET `/api/usage/summary`** - Get daily usage summary

### Service Methods

- `UsageTrackingService.getUsageMetrics()`
- `UsageTrackingService.getLicenseComplianceMetrics()`
- `UsageTrackingService.getTopPages()`
- `UsageTrackingService.getDailyUsageSummary()`

## Use Cases Enabled

### License Compliance
- Track user count per organization
- Track tenant count per organization
- Track feature usage
- Generate compliance reports

### Billing/Usage-Based Pricing
- Query execution count
- Export/download count
- Data volume processed (rows)
- API call count (if enabled)

### Analytics & Insights
- Most used pages
- Peak usage times
- Performance trends
- User activity patterns
- Error rates

### Performance Monitoring
- Average query execution time
- Slow queries identification
- Success/failure rates
- Data volume trends

## Summary

**Total Metrics Tracked:** 4 types
- ✅ Query executions
- ✅ Data exports
- ✅ Page views
- ✅ User logins

**Coverage:** 100%
- All query types (TABLE, VIEW, PROCEDURE)
- All export types (TABLE, VIEW, PROCEDURE)
- All page views
- All logins

**Performance:** Optimized
- Non-blocking
- Single helper function
- Graceful degradation

**Status:** ✅ Complete and Production Ready

