# PBM Multi-Tenant Management Interface

## Overview
This HTML interface provides a modern, user-friendly way to manage tenants and transactions in your PBM multi-tenant system.

## Features

### 🏢 **Tenant Management**
- **Create Tenants**: Add new tenants with database credentials
- **List Tenants**: View all tenants with search and filtering
- **Edit Tenants**: Modify tenant information and credentials
- **Delete Tenants**: Remove tenants from the system
- **Test Connections**: Verify database connectivity for each tenant
- **Statistics Dashboard**: Real-time tenant counts and status overview

### 💾 **Transaction Management**
- **View Transactions**: Browse transactions for specific tenants
- **Create Transactions**: Add new transactions with custom data
- **Random Transactions**: Generate sample transactions for testing
- **Tenant Selection**: Choose which tenant's transactions to view

## 🚀 **Getting Started**

### 1. **Environment Variables**

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Then update the values in `.env` with your actual configuration.

#### **Required Variables**
- `MASTER_DB_URL` - Master database connection string (REQUIRED)
- `JWT_SECRET` - JWT secret for authentication (REQUIRED in production)
- `TENANT_CREDENTIALS_ENCRYPTION_KEY` - Encryption key for tenant credentials (REQUIRED in production)

#### **Redis Configuration (Optional but Highly Recommended)**
- `REDIS_URL` - Redis connection string (default: `redis://localhost:6379`)
- `REDIS_CLUSTER` - Enable Redis cluster mode (`true`/`false`, default: `false`)
- `REDIS_NODES` - JSON array of cluster nodes (only if `REDIS_CLUSTER=true`)
- `REDIS_PASSWORD` - Redis password (optional)

**Note**: Redis is used for distributed caching and rate limiting. The application will work without Redis (with in-memory fallback), but Redis is **required for production** to achieve 1M+ RPS.

#### **Database Configuration**
- `MASTER_DB_READ_REPLICA_URL` - Read replica for master DB (optional, recommended for production)
  - Reduces load on primary database
  - Used for tenant lookups and read operations

#### **ClickHouse Configuration (Optional)**
- `CLICKHOUSE_HOST` - ClickHouse server URL (default: `http://localhost:8123`)
- `CLICKHOUSE_DATABASE` - ClickHouse database name (default: `analytics`)
- `CLICKHOUSE_USER` - ClickHouse username (default: `admin`)
- `CLICKHOUSE_PASSWORD` - ClickHouse password (default: `admin123`)

**Note**: ClickHouse is used for analytics and usage tracking. Application works without it (graceful degradation).

#### **Other Configuration**
- `NODE_ENV` - Environment (`development`/`production`, default: `development`)
- `PORT` - Server port (default: `4000`)
- `CORS_ORIGIN` - CORS allowed origin (default: `*`)
- `LOG_ENCRYPTION_KEY` - Key for log encryption (optional)
- `ORG_DEFAULT_PRIMARY_COLOR` - Default primary color for organizations (default: `#1890ff`)
- `ORG_ID_GENERATION_MODE` - Organization ID generation: `slug`, `uuid`, or `time` (default: `slug`)
- `BRANDING_CACHE_TTL` - Branding cache TTL in milliseconds (default: `600000`)

See `.env.example` for complete list of all environment variables.

### 2. **Redis Setup**

Redis is used for distributed caching and rate limiting. The application will work without Redis (with in-memory fallback), but Redis is **highly recommended** for production.

#### **Single Instance Redis**
```bash
# Install Redis (Ubuntu/Debian)
sudo apt-get install redis-server

# Start Redis
redis-server

# Or use Docker
docker run -d -p 6379:6379 redis:latest
```

#### **Redis Cluster (for high availability)**
Set `REDIS_CLUSTER=true` and provide `REDIS_NODES` as a JSON array.

### 3. **Install Dependencies**
```bash
npm install
```

### 4. **Start the Server**
```bash
npm start
# or for development
npm run dev
```

### 5. **Access the Interface**
Open your browser and navigate to:
```
http://localhost:4000
```

### 3. **API Endpoints Used**
The interface connects to these API endpoints:
- `GET /api/tenants` - List all tenants
- `POST /api/tenants` - Create new tenant
- `PUT /api/tenants/:id` - Update tenant
- `DELETE /api/tenants/:id` - Delete tenant
- `POST /api/tenants/:id/test-connection` - Test database connection
- `GET /api/tenants/stats` - Get tenant statistics
- `POST /api/prior-auth/txn` - Create transaction
- `POST /api/prior-auth/txn/random` - Create random transaction

## 📱 **Interface Layout**

### **Tenant Management Tab**
- **Statistics Cards**: Total, Active, Inactive, Suspended tenant counts
- **Search & Filter**: Find tenants by ID, name, or status
- **Tenant Table**: View all tenants with actions (Edit, Delete, Test Connection)
- **Add Tenant Button**: Open modal to create new tenant

### **Transaction Management Tab**
- **Tenant Selector**: Dropdown to choose which tenant's transactions to view
- **Transaction Table**: Display all transactions for selected tenant
- **Add Transaction**: Create custom transactions
- **Random Transaction**: Generate sample data for testing

## 🔧 **Usage Examples**

### **Creating a New Tenant**
1. Click "Add Tenant" button
2. Fill in tenant details:
   - **Tenant ID**: Unique identifier (e.g., `tenant_001`)
   - **Name**: Display name (e.g., `Healthcare Provider A`)
   - **Database Host**: Server IP/hostname
   - **Port**: Database port (default: 3306)
   - **User**: Database username
   - **Password**: Database password
   - **Database**: Database name
   - **Status**: Active/Inactive/Suspended
3. Click "Create Tenant"

### **Managing Transactions**
1. Select a tenant from the dropdown
2. View existing transactions in the table
3. Create new transactions with custom data
4. Generate random transactions for testing

### **Testing Database Connections**
1. In the tenant table, click the "Test Connection" button (🔌 icon)
2. The system will attempt to connect to the tenant's database
3. View success/error messages

## 📊 **Data Display**

### **Tenant Information**
- ID, Name, Database details
- Status with color-coded badges
- Creation and update timestamps
- Action buttons for management

### **Transaction Information**
- Request ID, Version, Type
- Request and Response bodies
- Creation timestamps
- Truncated display with full content on hover

## 🚨 **Troubleshooting**

### **Common Issues**
1. **Interface not loading**: Check if server is running on port 3000
2. **API errors**: Verify all API endpoints are working
3. **Database connection failures**: Check tenant credentials and network connectivity
4. **Empty data**: Ensure tenants exist and are properly configured

## 🔄 **Updates and Maintenance**

The interface automatically:
- Refreshes tenant statistics
- Updates tenant lists after changes
- Reloads transaction data when switching tenants
- Shows real-time success/error messages

## 📝 **Notes**

- All changes are immediately reflected in the interface
- Database operations use transactions for data integrity
- The interface connects to your existing API endpoints
- No additional configuration required beyond starting the server

## 🚀 **Performance Optimization**

This application is optimized for high throughput (1M+ requests/second). Key optimizations include:

- **Redis Caching**: Distributed caching for tenant configs, page configs, and query results
- **Connection Pooling**: Optimized database connection pools for low-spec VMs
- **Read Replicas**: Support for database read replicas to reduce primary DB load
- **Query Result Caching**: Automatic caching of query results with configurable TTLs
- **Batched Operations**: Batched inserts for usage tracking and async operations
- **Distributed Rate Limiting**: Redis-based rate limiting across all instances

For detailed performance tuning guide, see [docs/PERFORMANCE_OPTIMIZATION.md](./docs/PERFORMANCE_OPTIMIZATION.md).


