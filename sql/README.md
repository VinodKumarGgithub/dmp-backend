# Sample Page Config INSERT Queries

This directory contains sample SQL INSERT queries for the `page_configs` table.

## Table Structure

The `page_configs` table stores configuration for dynamic data pages. All fields are stored in the **master database**.

## Sample INSERT Query

See `sample_page_config_insert.sql` for complete examples.

### Quick Example

```sql
INSERT INTO page_configs (
  id,
  page_key,
  title,
  data_source,
  columns_json,
  searchable_fields_json,
  filterable_fields_json,
  is_download_allowed,
  download_row_limit,
  default_sort_json,
  page_size_default
) VALUES (
  'page_1734567890123',
  'age_edit',
  'Age Edit Data',
  'age_edits',
  '[{"name": "id", "label": "ID", "type": "number"}, {"name": "patient_id", "label": "Patient ID", "type": "string"}]',
  '["patient_id", "status"]',
  '[{"name": "status", "label": "Status", "type": "select", "options": ["OPEN", "CLOSED"]}]',
  true,
  5000,
  '{"field": "created_at", "order": "DESC"}',
  20
);
```

## Field Descriptions

- **id**: Unique identifier (use `generateId('page')` or timestamp-based ID)
- **page_key**: Unique key used in URLs (e.g., `age_edit`, `users`)
- **title**: Display name for the page
- **data_source**: Table or view name in tenant database
- **columns_json**: JSON array of column definitions
- **searchable_fields_json**: JSON array of field names for global search
- **filterable_fields_json**: JSON array of filter configurations
- **is_download_allowed**: Boolean flag for CSV/Excel download
- **download_row_limit**: Optional integer cap on CSV download size (null for unlimited)
- **default_sort_json**: JSON object with default sorting (optional)
- **page_size_default**: Default number of rows per page

## Using the UI

You can also manage page configs through the UI at `/page-config` route (admin only).

