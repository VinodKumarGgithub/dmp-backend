# Tenant Registry Management API

This API provides comprehensive CRUD operations for managing tenant database credentials in the master database.

## Base URL
```
/api/tenants
```

## API Endpoints

### 1. Create Tenant
**POST** `/api/tenants`

Creates a new tenant with database connection details.

**Request Body:**
```json
{
  "id": "tenant_001",
  "name": "Healthcare Provider A",
  "dialect": "mysql",
  "db_host": "localhost",
  "db_port": 3306,
  "db_user": "tenant_user",
  "db_password": "secure_password",
  "db_name": "tenant_db",
  "status": "ACTIVE",
  "description": "Primary healthcare provider tenant"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "tenant_001",
    "name": "Healthcare Provider A",
    "dialect": "mysql",
    "db_host": "localhost",
    "db_port": 3306,
    "db_user": "tenant_user",
    "db_password": "secure_password",
    "db_name": "tenant_db",
    "status": "ACTIVE",
    "description": "Primary healthcare provider tenant",
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z"
  },
  "message": "Tenant created successfully!"
}
```

### 2. List Tenants
**GET** `/api/tenants`

Retrieves all tenants with optional filtering.

**Query Parameters:**
- `status`: Filter by status (ACTIVE, INACTIVE, SUSPENDED)
- `search`: Search in tenant ID or name

**Examples:**
```
GET /api/tenants
GET /api/tenants?status=ACTIVE
GET /api/tenants?search=healthcare
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "tenant_001",
      "name": "Healthcare Provider A",
      "dialect": "mysql",
      "db_host": "localhost",
      "db_port": 3306,
      "db_user": "tenant_user",
      "db_name": "tenant_db",
      "status": "ACTIVE",
      "description": "Primary healthcare provider tenant",
      "created_at": "2024-01-15T10:30:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "message": "Tenants fetched successfully!"
}
```

### 3. Get Tenant by ID
**GET** `/api/tenants/:id`

Retrieves a specific tenant by ID.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "tenant_001",
    "name": "Healthcare Provider A",
    "dialect": "mysql",
    "db_host": "localhost",
    "db_port": 3306,
    "db_user": "tenant_user",
    "db_password": "secure_password",
    "db_name": "tenant_db",
    "status": "ACTIVE",
    "description": "Primary healthcare provider tenant",
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z"
  },
  "message": "Tenant fetched successfully!"
}
```

### 4. Update Tenant
**PUT** `/api/tenants/:id`

Updates an existing tenant. Only include fields you want to update.

**Request Body:**
```json
{
  "dialect": "mssql",
  "status": "SUSPENDED",
  "description": "Tenant temporarily suspended for maintenance"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "tenant_001",
    "name": "Healthcare Provider A",
    "dialect": "mssql",
    "db_host": "localhost",
    "db_port": 3306,
    "db_user": "tenant_user",
    "db_password": "secure_password",
    "db_name": "tenant_db",
    "status": "SUSPENDED",
    "description": "Tenant temporarily suspended for maintenance",
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T11:00:00.000Z"
  },
  "message": "Tenant updated successfully!"
}
```

### 5. Delete Tenant
**DELETE** `/api/tenants/:id`

Deletes a tenant permanently.

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Tenant deleted successfully"
  },
  "message": "Tenant deleted successfully!"
}
```

### 6. Test Tenant Connection
**POST** `/api/tenants/:id/test-connection`

Tests the database connection for a specific tenant.

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Database connection successful",
    "tenant": "tenant_001"
  },
  "message": "Connection test successful!"
}
```

### 7. Bulk Create Tenants
**POST** `/api/tenants/bulk`

Creates multiple tenants in a single request.

**Request Body:**
```json
{
  "tenants": [
    {
      "id": "tenant_003",
      "name": "Provider B",
      "dialect": "mysql",
      "db_host": "localhost",
      "db_port": 3306,
      "db_user": "user_b",
      "db_password": "pass_b",
      "db_name": "db_b"
    },
    {
      "id": "tenant_004",
      "name": "Provider C",
      "dialect": "mssql",
      "db_host": "localhost",
      "db_port": 3306,
      "db_user": "user_c",
      "db_password": "pass_c",
      "db_name": "db_c"
    }
  ]
}
```

### 8. Get Tenant Statistics
**GET** `/api/tenants/stats`

Retrieves summary statistics about tenants.

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 10,
    "active": 8,
    "inactive": 1,
    "suspended": 1
  },
  "message": "Tenant statistics fetched successfully!"
}
```

## Data Validation

### Required Fields
- `id`: Unique tenant identifier (string)
- `name`: Tenant display name (2-100 characters)
- `db_host`: Database hostname/IP
- `db_user`: Database username (1-50 characters)
- `db_password`: Database password (minimum 1 character)
- `db_name`: Database name (1-100 characters)

### Optional Fields
- `dialect`: Database dialect (default: mysql, options: mysql/mssql)
- `db_port`: Database port (default: 3306, range: 1-65535)
- `status`: Tenant status (default: ACTIVE, options: ACTIVE/INACTIVE/SUSPENDED)
- `description`: Additional tenant description (max 500 characters)

## Security Features

- **Password Protection**: Database passwords are stored securely
- **List Security**: Passwords are excluded from list responses
- **Transaction Safety**: All operations use database transactions
- **Input Validation**: Comprehensive Joi validation for all inputs

## Error Handling

The API returns appropriate HTTP status codes and error messages:

- `400`: Bad Request (validation errors)
- `404`: Not Found (tenant not found)
- `500`: Internal Server Error (database errors)

## Database Schema

```sql
CREATE TABLE tenants (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  dialect ENUM('mysql', 'mssql') DEFAULT 'mysql' NOT NULL,
  db_host VARCHAR(255) NOT NULL,
  db_port INT NOT NULL DEFAULT 3306,
  db_user VARCHAR(50) NOT NULL,
  db_password VARCHAR(255) NOT NULL,
  db_name VARCHAR(100) NOT NULL,
  status ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') DEFAULT 'ACTIVE' NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
);
```

## Usage Examples

### Create a New Tenant
```bash
curl -X POST http://localhost:3000/api/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "id": "new_tenant",
    "name": "New Healthcare Provider",
    "dialect": "mysql",
    "db_host": "192.168.1.100",
    "db_port": 3306,
    "db_user": "new_user",
    "db_password": "new_password",
    "db_name": "new_db",
    "description": "New tenant for healthcare provider"
  }'
```

### Test Database Connection
```bash
curl -X POST http://localhost:3000/api/tenants/new_tenant/test-connection
```

### Get All Active Tenants
```bash
curl "http://localhost:3000/api/tenants?status=ACTIVE"
```

