# Feature Gate & Kill-Switch Implementation

## Overview

The Feature Gate system provides license-based access control and implements a "kill-switch" mechanism that restricts features when licenses expire. This ensures that expired licenses enter read-only mode, preventing write operations while still allowing data viewing.

## Architecture

### Backend Components

#### 1. Feature Gate Service (`services/featureGateService.js`)

The service provides methods to:
- Check if specific features are enabled
- Determine if actions can be performed (with read-only mode support)
- Get available features for an organization
- Check if organization is in read-only mode
- Get license status summary

**Key Methods:**
- `isFeatureEnabled(organizationId, feature)` - Check if a feature is available
- `canPerformAction(organizationId, action)` - Check if an action is allowed (returns read-only status)
- `getAvailableFeatures(organizationId)` - Get list of enabled features
- `isReadOnlyMode(organizationId)` - Check if in read-only mode
- `getLicenseStatusSummary(organizationId)` - Get comprehensive license status

**Read-Only Mode Logic:**
- When license is expired, read-only actions (`view`, `read`, `login`, `list`, `get`) are allowed
- Write actions (`create`, `update`, `delete`, `export`, `download`, `modify`, `edit`) are blocked
- SUPER_ADMIN always has full access

#### 2. Feature Gate Middleware (`middleware/featureGateMiddleware.js`)

Three middleware functions:

1. **`requireFeature(feature)`** - Blocks access if feature is not enabled
2. **`requireActiveLicense(action)`** - Blocks write actions when license expired, allows read-only mode
3. **`checkLicenseStatus(req, res, next)`** - Non-blocking, attaches license status to request

**SUPER_ADMIN Bypass:**
- All feature gate checks are bypassed for SUPER_ADMIN users
- SUPER_ADMIN has full access regardless of license status

### Route Protection

#### Protected Routes

**Page Management (`routes/pageMasterRoutes.js`):**
- `POST /api/pages` - Create page (requires active license)
- `PUT /api/pages/:pageKey` - Update page (requires active license)
- `DELETE /api/pages/:pageKey` - Delete page (requires active license)
- `GET /api/pages` - List pages (no license check - read-only allowed)
- `GET /api/pages/:pageKey/config` - Get page config (no license check - read-only allowed)

**Tenant Management (`routes/tenantRegistry.js`):**
- `POST /api/tenants` - Create tenant (requires active license)
- `PUT /api/tenants/:id` - Update tenant (requires active license)
- `DELETE /api/tenants/:id` - Delete tenant (requires active license)
- `POST /api/tenants/bulk` - Bulk create (requires active license)
- `POST /api/tenants/:id/test-connection` - Test connection (requires active license)
- `GET /api/tenants` - List tenants (no license check - read-only allowed)
- `GET /api/tenants/:id` - Get tenant (no license check - read-only allowed)

**Page Data & Exports (`routes/pageTenantRoutes.js`):**
- `GET /api/pages/:pageKey/download` - Download data (requires active license)
- `POST /api/pages/:pageKey/test-query` - Test query (requires active license)
- `POST /api/pages/:pageKey/detect-columns` - Detect columns (requires active license)
- `GET /api/pages/:pageKey` - Get page data (no license check - read-only allowed)
- `GET /api/pages/:pageKey/data` - Get page data (no license check - read-only allowed)

### Frontend Components

#### 1. Feature Gate Hook (`hooks/useFeatureGate.js`)

React Query hook that provides:
- `useFeatureGate(feature)` - Check if a feature is enabled
- `useCanWrite()` - Check if user can perform write actions

**Features:**
- Automatic refetching every 5 minutes
- Caching with 5-minute stale time
- SUPER_ADMIN always returns `enabled: true` and `canWrite: true`

#### 2. Read-Only Mode Indicator (`components/ReadOnlyModeIndicator.jsx`)

Visual indicator displayed in the header when license is expired:
- Shows "Read-Only Mode" badge with lock icon
- Tooltip explains the restriction
- Only visible when `readOnly: true`

#### 3. UI Restrictions

**Page Configuration Management:**
- "Add New Page" button disabled when read-only
- Edit/Delete buttons disabled when read-only
- Modal save button disabled when read-only

**Tenant Management:**
- "Add New Tenant" button disabled when read-only
- Edit/Delete buttons disabled when read-only
- Modal save button disabled when read-only
- Test connection button disabled when read-only

**Data Page:**
- Download button disabled when read-only
- Error message shown if download attempted in read-only mode

**Tenant Selector:**
- Tenant switching disabled when read-only
- Error message shown if switching attempted in read-only mode

## Error Handling

### Backend Errors

When license restrictions are triggered:
- Status: `403 Forbidden`
- Error Code: `LICENSE_RESTRICTED`
- Message: Descriptive message explaining the restriction

### Frontend Error Handling

The `axiosInstance` interceptor handles `LICENSE_RESTRICTED` errors:
- Does NOT log out the user (unlike other 403 errors)
- Allows `LicenseStatusBanner` to display the message
- User can continue viewing data in read-only mode

## License Status API

### GET `/api/license/features`

Returns comprehensive license status:
```json
{
  "valid": false,
  "readOnly": true,
  "features": ["view", "read"],
  "reason": "EXPIRED",
  "status": "EXPIRED",
  "expiresAt": "2024-01-01T00:00:00.000Z",
  "message": "License expired. You are in read-only mode."
}
```

## Read-Only Mode Behavior

### Allowed Operations
- View pages and data
- Search and filter data
- View tenant information
- View page configurations
- Login and access the system

### Blocked Operations
- Create/Edit/Delete pages
- Create/Edit/Delete tenants
- Download/Export data
- Test queries
- Switch tenants
- Any write operations

## Testing

### Test Scenarios

1. **Valid License:**
   - All features available
   - All buttons enabled
   - Can perform all operations

2. **Expired License:**
   - Read-only mode active
   - Write buttons disabled
   - Download disabled
   - Tenant switching disabled
   - Can still view data

3. **No License:**
   - All operations blocked
   - Error message displayed
   - Contact support message

4. **SUPER_ADMIN:**
   - All features available
   - Bypasses all checks
   - No license required

## Migration Notes

- Existing organizations automatically get licenses created
- No breaking changes to existing functionality
- License checks are additive (don't break existing flows)
- SUPER_ADMIN users are unaffected

## Security Considerations

1. **Backend Enforcement:**
   - All restrictions enforced at API level
   - Frontend restrictions are UX only
   - Cannot bypass by manipulating frontend

2. **SUPER_ADMIN Protection:**
   - SUPER_ADMIN checks happen before license checks
   - No license validation for SUPER_ADMIN
   - Prevents accidental restrictions on admin users

3. **Read-Only Mode:**
   - Allows continued access to view data
   - Prevents accidental data modification
   - Clear user feedback about restrictions

## Future Enhancements

1. **Feature-Specific Gates:**
   - Custom branding feature gate
   - API access feature gate
   - Advanced filters feature gate

2. **Grace Period:**
   - Optional grace period before read-only mode
   - Configurable warning period

3. **Usage Tracking:**
   - Track feature usage
   - Report on license compliance

