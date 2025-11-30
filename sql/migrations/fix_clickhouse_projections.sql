-- Fix ClickHouse Projections for NULL-safe aggregation
-- This fixes error 349 when inserting NULL values into numeric columns used in projections
-- Run this after creating the base tables

-- Step 1: Drop existing projections
ALTER TABLE analytics.usage_metrics DROP PROJECTION IF EXISTS org_metric_projection;
ALTER TABLE analytics.usage_metrics DROP PROJECTION IF EXISTS page_analytics_projection;

-- Step 2: Recreate with NULL-safe projections
ALTER TABLE analytics.usage_metrics
ADD PROJECTION IF NOT EXISTS org_metric_projection
(
    SELECT
        organization_id,
        metric_type,
        event_date,
        count(),
        sum(coalesce(execution_time_ms, 0)) as total_execution_time_ms,
        sum(coalesce(rows_returned, 0)) as total_rows_returned,
        sum(success),
        uniqExact(user_id),
        uniqExact(tenant_id)
    GROUP BY organization_id, metric_type, event_date
);

ALTER TABLE analytics.usage_metrics
ADD PROJECTION IF NOT EXISTS page_analytics_projection
(
    SELECT
        organization_id,
        page_key,
        event_date,
        count(),
        sum(coalesce(execution_time_ms, 0)) as total_execution_time_ms,
        sum(coalesce(rows_returned, 0)) as total_rows_returned,
        uniqExact(user_id)
    GROUP BY organization_id, page_key, event_date
);

-- Step 3: Update materialized view for NULL-safe aggregation
DROP VIEW IF EXISTS analytics.usage_metrics_daily_mv;

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.usage_metrics_daily_mv
TO analytics.usage_metrics_daily
AS SELECT
    organization_id,
    metric_type,
    event_date,
    count() as total_count,
    sum(coalesce(execution_time_ms, 0)) as total_execution_time_ms,
    sum(coalesce(rows_returned, 0)) as total_rows_returned,
    sum(success) as success_count,
    sum(1 - success) as error_count,
    uniqExact(user_id) as unique_users,
    uniqExact(tenant_id) as unique_tenants,
    uniqExact(page_key) as unique_pages
FROM analytics.usage_metrics
GROUP BY organization_id, metric_type, event_date;

