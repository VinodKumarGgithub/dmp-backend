# Deployment Checklist

## Pre-Deployment

### 1. Database Migration ✅
**Required:** Run the extensible tenants table migration before deploying.

```bash
# Option 1: Using Node.js script (Recommended)
cd dmp-backend
node scripts/runMigration.js

# Option 2: Using MySQL command line
mysql -u your_user -p your_database < sql/migrations/make_tenants_extensible.sql
```

**Verification:**
```sql
-- Check if new columns exist
DESCRIBE tenants;

-- Verify existing tenants
SELECT id, dialect, db_type, connection_type FROM tenants LIMIT 5;
```

### 2. Environment Variables
Ensure all required environment variables are set:

```env
# Database
MASTER_DB_URL=mysql://user:password@localhost:3306/master_db

# Security
ENCRYPTION_KEY=your-32-character-encryption-key
LOG_ENCRYPTION_KEY=your-log-encryption-key
JWT_SECRET=your-jwt-secret

# Server
PORT=3000
NODE_ENV=production
```

### 3. Dependencies Installation
Install required database drivers (if using):

```bash
# PostgreSQL (if using PostgreSQL)
npm install pg pg-hstore

# MongoDB (if using MongoDB)
npm install mongodb
```

### 4. License Migration (Optional)
If migrating existing organizations, run license migration:

```bash
node scripts/migrateLicenses.js
```

### 5. Tenant Credential Encryption (Optional)
If you have existing tenants with plain-text passwords:

```bash
node scripts/migrateEncryptTenantCredentials.js
```

## Deployment Steps

### 1. Code Deployment
- [ ] Pull latest code
- [ ] Install dependencies: `npm install`
- [ ] Run database migration (see above)
- [ ] Verify environment variables

### 2. Backend Service
- [ ] Start backend service: `npm start` or `pm2 start`
- [ ] Verify service is running: `curl http://localhost:3000/health`
- [ ] Check logs for errors

### 3. Verification Tests
- [ ] Test tenant creation (MySQL)
- [ ] Test tenant creation (PostgreSQL - if applicable)
- [ ] Test tenant creation (MongoDB - if applicable)
- [ ] Test page creation and data fetching
- [ ] Test license validation
- [ ] Test feature gates
- [ ] Test read-only mode (expired license)

### 4. Security Verification
- [ ] Verify tenant credentials are encrypted in database
- [ ] Test SSL/TLS connections (if configured)
- [ ] Verify audit logging is working
- [ ] Test tenant isolation

## Post-Deployment

### 1. Monitoring
- [ ] Monitor error logs
- [ ] Monitor database connections
- [ ] Monitor license validation
- [ ] Monitor tenant connection health

### 2. Backup
- [ ] Backup master database
- [ ] Verify backup restoration process

### 3. Documentation
- [ ] Update deployment documentation
- [ ] Document any custom configurations
- [ ] Update API documentation if needed

## Rollback Plan

If issues occur:

1. **Database Rollback:**
   ```sql
   -- Only if no new database types have been added
   -- See docs/MIGRATION_GUIDE.md for rollback SQL
   ```

2. **Code Rollback:**
   ```bash
   git checkout <previous-version>
   npm install
   npm start
   ```

3. **License Rollback:**
   - Licenses are additive, no rollback needed
   - Can manually update license status if needed

## Known Issues & Workarounds

### Issue: "Duplicate column" error during migration
**Solution:** Migration is idempotent, safe to ignore if columns already exist.

### Issue: "Table doesn't exist" error
**Solution:** Verify `MASTER_DB_URL` is correct and database exists.

### Issue: "Access denied" error
**Solution:** Ensure database user has `ALTER TABLE` permissions.

## Support

For issues or questions:
- Check `docs/IMPLEMENTATION_SUMMARY.md` for architecture details
- Check `docs/MIGRATION_GUIDE.md` for migration help

