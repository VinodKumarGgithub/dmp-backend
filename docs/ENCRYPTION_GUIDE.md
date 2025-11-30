# Encryption Guide

## Overview

This guide explains how we encrypt sensitive data, including tenant database credentials and audit logs.

## Encryption Standards

### Tenant Database Credentials

**Algorithm**: AES-256-GCM (Galois/Counter Mode)
**Key Management**: Environment variable (`TENANT_CREDENTIALS_ENCRYPTION_KEY`)
**Storage**: Encrypted passwords stored in `tenants` table

#### How It Works

1. **On Save**: Password encrypted before storing in database
2. **On Retrieve**: Password decrypted automatically by model hooks
3. **On Use**: Decrypted password used for database connection
4. **After Use**: Password cleared from memory

#### Format

Encrypted passwords are stored in format: `iv:authTag:encrypted`
- `iv`: Initialization vector (16 bytes, hex encoded)
- `authTag`: Authentication tag (16 bytes, hex encoded)
- `encrypted`: Encrypted password (hex encoded)

### Audit Log SQL Queries

**Algorithm**: AES-256-CBC (Cipher Block Chaining)
**Key Management**: Environment variable (`LOG_ENCRYPTION_KEY`)
**Storage**: Encrypted SQL stored in `query_audit_logs` table

#### How It Works

1. **On Log**: SQL query encrypted before storing
2. **On View**: Decrypted only for ADMIN/SUPER_ADMIN users
3. **Format**: `iv_base64:encrypted_base64`

## Environment Variables

### Required Variables

```bash
# Tenant Credentials Encryption Key (32+ characters recommended)
TENANT_CREDENTIALS_ENCRYPTION_KEY=your-very-secure-encryption-key-minimum-32-chars

# Audit Log Encryption Key (32+ characters recommended)
LOG_ENCRYPTION_KEY=your-audit-log-encryption-key-minimum-32-chars
```

### Key Generation

Generate secure keys:

```bash
# Generate random 32-byte key (base64 encoded)
openssl rand -base64 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Migration

### Encrypting Existing Credentials

Run the migration script:

```bash
# Set encryption key first
export TENANT_CREDENTIALS_ENCRYPTION_KEY=your-key

# Run migration
node scripts/migrateEncryptTenantCredentials.js
```

The script will:
1. Find all tenants with plain-text passwords
2. Encrypt them using AES-256-GCM
3. Update database records
4. Verify encryption works

## Security Best Practices

### Key Management

1. **Never commit keys to version control**
2. **Use environment variables or secret management**
3. **Rotate keys periodically** (requires re-encryption)
4. **Use different keys for different environments**
5. **Backup keys securely** (in case of re-encryption needed)

### Key Rotation

To rotate encryption keys:

1. **Backup database** (critical!)
2. **Decrypt all data** with old key
3. **Re-encrypt** with new key
4. **Update environment variable**
5. **Test thoroughly**

### Development vs Production

- **Development**: Encryption can be disabled (not recommended)
- **Production**: Encryption is mandatory
- **Key Storage**: Use secure secret management (AWS Secrets Manager, HashiCorp Vault, etc.)

## Verification

### Check Encryption Status

```sql
-- Check if passwords are encrypted (format: iv:authTag:encrypted)
SELECT id, name, 
  CASE 
    WHEN db_password LIKE '%:%:%' THEN 'Encrypted'
    ELSE 'Plain Text'
  END as encryption_status
FROM tenants;
```

### Test Encryption/Decryption

```javascript
const encryptionService = require('./services/encryptionService');

// Test encryption
const plainText = 'test-password';
const encrypted = encryptionService.encrypt(plainText);
console.log('Encrypted:', encrypted);

// Test decryption
const decrypted = encryptionService.decrypt(encrypted);
console.log('Decrypted:', decrypted);
console.log('Match:', plainText === decrypted);
```

## Troubleshooting

### Encryption Fails

**Issue**: `TENANT_CREDENTIALS_ENCRYPTION_KEY not set`

**Solution**: Set the environment variable:
```bash
export TENANT_CREDENTIALS_ENCRYPTION_KEY=your-key
```

### Decryption Fails

**Issue**: `Failed to decrypt password`

**Possible Causes**:
1. Wrong encryption key
2. Corrupted encrypted data
3. Plain text password (needs migration)

**Solution**: 
1. Verify encryption key is correct
2. Check if password is in encrypted format
3. Run migration script if needed

### Migration Issues

**Issue**: Some tenants not encrypted after migration

**Solution**:
1. Check migration script output
2. Verify encryption key is set
3. Re-run migration for failed tenants
4. Check database permissions

## API Security

### Password Handling

- Passwords are **never** returned in API responses
- Passwords are **never** logged
- Passwords are cleared from memory after use
- Only encrypted passwords stored in database

### Response Format

All tenant API responses exclude passwords:

```json
{
  "id": "tenant_001",
  "name": "Tenant Name",
  "db_host": "localhost",
  "db_user": "readonly_user",
  // db_password is NOT included
}
```

## Compliance

### Encryption Standards

- **AES-256**: Industry-standard encryption
- **GCM Mode**: Authenticated encryption (prevents tampering)
- **Key Management**: Secure key storage and rotation
- **Compliance**: Meets security requirements for sensitive data

---

**Note**: Always backup your database before running encryption migrations.

