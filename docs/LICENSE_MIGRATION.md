# License Migration Guide

## Overview

This guide explains how to migrate existing organizations to use the license system.

## Prerequisites

1. **Run the database migration** to create the `licenses` table:
   ```bash
   mysql -u your_user -p your_database < dmp-backend/sql/migrations/create_licenses_table.sql
   ```

2. **Ensure organizations table exists** (should already exist if you're using organizations)

## Migration Steps

### Step 1: Run License Migration Script

The migration script will create licenses for all existing organizations:

```bash
# Basic migration (1 year expiration, unlimited users/tenants)
node scripts/migrateLicenses.js

# Custom expiration (e.g., 2 years)
node scripts/migrateLicenses.js --expires-in-days 730

# With limits
node scripts/migrateLicenses.js --expires-in-days 365 --max-users 100 --max-tenants 10

# With features enabled
node scripts/migrateLicenses.js --expires-in-days 365 --features export,custom_branding,api_access
```

### Step 2: Verify Migration

Check that licenses were created:

```sql
SELECT 
  l.id,
  l.organization_id,
  o.name as organization_name,
  l.status,
  l.expires_at,
  l.max_users,
  l.max_tenants
FROM licenses l
LEFT JOIN organizations o ON l.organization_id = o.id
ORDER BY l.created_at DESC;
```

### Step 3: Test License Validation

1. Login as a user from an organization
2. Check that license status is returned correctly
3. Verify that expired/invalid licenses show appropriate warnings

## SUPER_ADMIN Handling

**SUPER_ADMIN users (users with `organization_id = NULL`) do NOT require licenses.**

- License middleware automatically skips validation for SUPER_ADMIN
- License status API returns `valid: true` for SUPER_ADMIN
- No license banner is shown for SUPER_ADMIN

## Auto-Creation for New Organizations

Starting from this implementation, **new organizations automatically get a license** when created:

- Default expiration: 365 days (configurable via `DEFAULT_LICENSE_EXPIRES_DAYS` env var)
- Default limits: Unlimited users and tenants
- Default features: None

If license creation fails during organization creation, the organization is still created (license can be added manually later).

## Manual License Management

### Create License for Organization

```bash
# Via API (SUPER_ADMIN only)
POST /api/license
{
  "organizationId": "org_123",
  "expiresInDays": 365,
  "maxUsers": 100,
  "maxTenants": 10,
  "features": ["export", "custom_branding"]
}
```

### Update License

```bash
# Via API (SUPER_ADMIN only)
PUT /api/license/organization/org_123
{
  "status": "ACTIVE",
  "expires_at": "2025-12-31T23:59:59Z",
  "maxUsers": 200,
  "features": ["export", "custom_branding", "api_access"]
}
```

### Renew License

```bash
# Via API (SUPER_ADMIN only)
POST /api/license/organization/org_123/renew
{
  "additionalDays": 365
}
```

## Troubleshooting

### License not found for organization

**Solution:** Run the migration script:
```bash
node scripts/migrateLicenses.js
```

### License expired but user can still access

**Check:**
1. Is the user a SUPER_ADMIN? (SUPER_ADMIN bypasses license checks)
2. Is license middleware applied to the route?
3. Check license cache (clears after 5 minutes)

### Migration script fails

**Common issues:**
1. **Table doesn't exist:** Run the SQL migration first
2. **Organization not found:** Ensure organizations table has data
3. **Duplicate license:** Script skips existing licenses automatically

## Next Steps

After migration:
1. ✅ Test license validation on protected routes
2. ✅ Implement kill-switch (read-only mode for expired licenses)
3. ✅ Add feature gating based on license features
4. ✅ Set up license monitoring and alerts

