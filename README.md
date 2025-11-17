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

### 1. **Start the Server**
```bash
cd mbx-pbm
npm start
```

### 2. **Access the Interface**
Open your browser and navigate to:
```
http://localhost:3000
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


