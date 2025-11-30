-- ClickHouse Schema for Usage Analytics
-- Run this script to create the analytics database and tables
-- Execute: clickhouse-client < create_clickhouse_schema.sql
-- Or use HTTP interface: curl -X POST 'http://localhost:8123/' --data-binary @create_clickhouse_schema.sql

-- Create database
CREATE DATABASE IF NOT EXISTS analytics;

-- Main usage metrics table
CREATE TABLE IF NOT EXISTS analytics.usage_metrics
(
    -- Primary identifiers
    id String,
    organization_id String,
    tenant_id Nullable(String),
    user_id Nullable(String),
    
    -- Metric details
    metric_type LowCardinality(String),  -- 'query', 'export', 'api_call', 'page_view', 'login', 'feature_usage'
    metric_value UInt32 DEFAULT 1,
    
    -- Context
    page_key Nullable(String),
    action_type Nullable(LowCardinality(String)),
    source_type Nullable(LowCardinality(String)),
    data_source Nullable(String),
    
    -- Performance metrics
    execution_time_ms Nullable(UInt32),
    rows_returned Nullable(UInt32),
    
    -- Status
    success UInt8 DEFAULT 1,  -- 0 or 1 (boolean)
    error_code Nullable(String),
    
    -- Metadata
    metadata String DEFAULT '{}',  -- JSON string for flexible data
    ip_address Nullable(String),
    
    -- Time partitioning (for efficient queries)
    event_date Date DEFAULT today(),
    event_time DateTime DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_date)  -- Monthly partitions
ORDER BY (organization_id, metric_type, event_date, event_time)
TTL event_date + INTERVAL 1 YEAR  -- Auto-delete data older than 1 year
SETTINGS index_granularity = 8192;

-- Daily aggregated table (for faster reporting)
CREATE TABLE IF NOT EXISTS analytics.usage_metrics_daily
(
    organization_id String,
    metric_type LowCardinality(String),
    event_date Date,
    
    -- Aggregated metrics
    total_count UInt64,
    total_execution_time_ms UInt64,
    total_rows_returned UInt64,
    success_count UInt64,
    error_count UInt64,
    
    -- Unique counts
    unique_users UInt32,
    unique_tenants UInt32,
    unique_pages UInt32
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (organization_id, metric_type, event_date);

-- Materialized view to auto-aggregate daily metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.usage_metrics_daily_mv
TO analytics.usage_metrics_daily
AS SELECT
    organization_id,
    metric_type,
    event_date,
    count() as total_count,
    sum(execution_time_ms) as total_execution_time_ms,
    sum(rows_returned) as total_rows_returned,
    sum(success) as success_count,
    sum(1 - success) as error_count,
    uniqExact(user_id) as unique_users,
    uniqExact(tenant_id) as unique_tenants,
    uniqExact(page_key) as unique_pages
FROM analytics.usage_metrics
GROUP BY organization_id, metric_type, event_date;

-- Create indexes for common queries
-- Note: ClickHouse uses ORDER BY for indexing, but we can add projections for specific queries

-- Projection for organization-level queries
ALTER TABLE analytics.usage_metrics
ADD PROJECTION IF NOT EXISTS org_metric_projection
(
    SELECT
        organization_id,
        metric_type,
        event_date,
        count(),
        sum(execution_time_ms),
        sum(rows_returned),
        sum(success),
        uniqExact(user_id),
        uniqExact(tenant_id)
    GROUP BY organization_id, metric_type, event_date
);

-- Projection for page-level analytics
ALTER TABLE analytics.usage_metrics
ADD PROJECTION IF NOT EXISTS page_analytics_projection
(
    SELECT
        organization_id,
        page_key,
        event_date,
        count(),
        sum(execution_time_ms),
        sum(rows_returned),
        uniqExact(user_id)
    WHERE page_key IS NOT NULL
    GROUP BY organization_id, page_key, event_date
);

