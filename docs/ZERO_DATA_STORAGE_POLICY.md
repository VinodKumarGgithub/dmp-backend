# Zero Data Storage Policy

## Overview

**We do not store any client data.** This document outlines our commitment to zero data storage and how we protect your data.

## Policy Statement

**Your data never leaves your database.** We only read data temporarily to render pages, return results to you immediately, and discard them. We maintain a strict zero data storage policy with zero retention period.

## Data Flow

### How We Handle Your Data

1. **Query Received**: Authenticated user requests data
2. **Query Executed**: Read-only query executed against your database
3. **Results Returned**: Data returned to client immediately
4. **No Storage**: Zero data persisted in our system
5. **Metadata Logged**: Only audit metadata logged (encrypted)

### What We Store (Metadata Only)

We store **metadata only** for audit and security purposes:

- ✅ **Encrypted SQL Queries**: Query text encrypted with AES-256-CBC
- ✅ **Execution Metrics**: Performance data (execution time, row count)
- ✅ **Audit Trail**: Who accessed what, when, and from where
- ✅ **Error Logs**: Failed queries and error messages (no data)

### What We Do NOT Store

We **never** store:

- ❌ Query result data
- ❌ Row contents
- ❌ Column values
- ❌ Any client data
- ❌ Exported files (generated on-demand, not stored)

## Security Measures

### 1. Read-Only Database Connections

- All database connections are read-only
- Only SELECT queries are allowed
- SQL validation blocks dangerous operations (DROP, DELETE, UPDATE, etc.)
- Database user permissions validated (SELECT only)

### 2. Encrypted Credentials

- Database passwords encrypted with AES-256-GCM
- Credentials cleared from memory after use
- Passwords never exposed in API responses or logs

### 3. SSL/TLS Encryption

- All database connections use SSL/TLS
- Data encrypted in transit
- Certificate validation enabled

### 4. Encrypted Audit Logs

- All logged SQL queries are AES-256-CBC encrypted
- Only authorized users can decrypt (ADMIN/SUPER_ADMIN)
- Audit logs contain no actual data

## Compliance

### GDPR Compliance

- **No Personal Data Stored**: We don't store any personal data
- **Data Residency**: Your data stays in your database
- **Right to Deletion**: No data to delete (we don't store it)
- **Data Portability**: Your data is already in your database

### Data Residency

- Your data never leaves your database
- We don't copy or replicate your data
- All queries executed directly against your database
- No data synchronization or caching

## Audit Trail

We maintain a complete audit trail **without storing your data**:

- **What**: Encrypted SQL queries, execution metrics
- **Who**: User ID, organization ID, tenant ID
- **When**: Timestamp of access
- **Where**: IP address (for security audit)
- **Why**: Action type (data query, export, etc.)

## Verification

### How to Verify

1. **Check Audit Logs**: View encrypted SQL queries (no data)
2. **Database Monitoring**: Monitor your database - no writes from our system
3. **Network Monitoring**: All connections are read-only
4. **Code Review**: Open source components available for review

### Technical Verification

- Database user has only SELECT permissions
- All queries validated for read-only operations
- No INSERT, UPDATE, DELETE operations allowed
- Query results returned and discarded immediately

## Data Retention

- **Client Data**: 0 seconds (never stored)
- **Audit Metadata**: Configurable retention (default: 90 days)
- **Encrypted SQL**: Retained for troubleshooting and compliance

## Questions & Support

If you have questions about our zero data storage policy:

1. Check the Help Center for security FAQs
2. Review audit logs to see what metadata is logged
3. Contact support for technical verification
4. Request a security audit report

## Updates

This policy is reviewed and updated regularly. Last updated: 2024

---

**Commitment**: Your data stays in your database. Always.

