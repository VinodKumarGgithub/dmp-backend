-- Sample INSERT query for page_configs table
-- Example: Age Edit Data Page

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
  '[
    {"name": "id", "label": "ID", "type": "number"},
    {"name": "patient_id", "label": "Patient ID", "type": "string"},
    {"name": "original_age", "label": "Original Age", "type": "number"},
    {"name": "updated_age", "label": "Updated Age", "type": "number"},
    {"name": "status", "label": "Status", "type": "string"},
    {"name": "created_at", "label": "Created At", "type": "date"}
  ]',
  '["patient_id", "status"]',
  '[
    {"name": "status", "label": "Status", "type": "select", "options": ["OPEN", "CLOSED", "PENDING"]},
    {"name": "patient_id", "label": "Patient ID", "type": "text"}
  ]',
  true,
  5000,
  '{"field": "created_at", "order": "DESC"}',
  20
);

-- Another example: User Management Page
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
  'page_1734567890124',
  'users',
  'User Management',
  'users',
  '[
    {"name": "id", "label": "ID", "type": "number"},
    {"name": "username", "label": "Username", "type": "string"},
    {"name": "email", "label": "Email", "type": "string"},
    {"name": "role", "label": "Role", "type": "string"},
    {"name": "status", "label": "Status", "type": "string"},
    {"name": "created_at", "label": "Created At", "type": "date"}
  ]',
  '["username", "email"]',
  '[
    {"name": "role", "label": "Role", "type": "select", "options": ["ADMIN", "USER", "GUEST"]},
    {"name": "status", "label": "Status", "type": "select", "options": ["ACTIVE", "INACTIVE", "SUSPENDED"]}
  ]',
  true,
  NULL,
  '{"field": "id", "order": "ASC"}',
  25
);

