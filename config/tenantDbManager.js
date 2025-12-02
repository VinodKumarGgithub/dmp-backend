const { createSequelize, masterSequelizeRead } = require('./db');
const { TENANT_HEADER, CACHE } = require('./constants');
const Tenant = require('../models/Tenant');
const { logger } = require('./logger');
const { fromCode } = require('../utils/errors');
const { getRedisClient } = require('./redis');

// In-memory fallback cache (for when Redis is unavailable)
const tenantCache = new Map();
const TENANT_CONFIG_CACHE_TTL = CACHE.TENANT_CONFIG_TTL; // 1 hour in seconds
const TENANT_STATUS_CACHE_TTL = CACHE.TENANT_STATUS_TTL; // 2 hours in seconds

function getTenantId(req) {
  return req.headers[TENANT_HEADER] || req.query.tenant || req.params.tenant;
}

/**
 * Get tenant connection config from cache or DB
 * Returns config object (not connection) for security
 */
async function getTenantConfig(tenantId) {
  const redis = getRedisClient();
  const cacheKey = `tenant:config:${tenantId}`;
  
  // Try Redis first
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.warn(`Redis cache read failed for tenant ${tenantId}:`, error.message);
    }
  }
  
  // Fallback to in-memory cache
  const inMemoryKey = `config:${tenantId}`;
  if (tenantCache.has(inMemoryKey)) {
    return tenantCache.get(inMemoryKey);
  }
  
  // Fetch from master DB (use read replica if available)
  // Use raw query with read replica to reduce load on master DB
  const tenants = await masterSequelizeRead.query(
    'SELECT * FROM tenants WHERE id = :tenantId LIMIT 1',
    {
      replacements: { tenantId },
      type: masterSequelizeRead.QueryTypes.SELECT
    }
  );
  
  if (!tenants || tenants.length === 0) {
    throw fromCode('TENANT_NOT_FOUND');
  }
  
  const tenant = tenants[0];
  
  // Decrypt password (same as model hook would do)
  const encryptionService = require('../services/encryptionService');
  if (tenant.db_password && encryptionService.isEncrypted(tenant.db_password)) {
    try {
      tenant.db_password = encryptionService.decrypt(tenant.db_password);
    } catch (error) {
      logger.warn(`Failed to decrypt password for tenant ${tenantId}:`, error.message);
    }
  }
  if (!tenant) {
    throw fromCode('TENANT_NOT_FOUND');
  }
  
  // Check tenant status
  if (tenant.status === 'INACTIVE') {
    throw fromCode('TENANT_INACTIVE', [`Tenant ${tenantId} is INACTIVE`]);
  }
  
  if (tenant.status === 'SUSPENDED') {
    throw fromCode('TENANT_SUSPENDED', [`Tenant ${tenantId} is SUSPENDED`]);
  }
  
  if (tenant.status !== 'ACTIVE') {
    throw fromCode('TENANT_DB_NOT_AVAILABLE', [`Tenant ${tenantId} status is ${tenant.status}`]);
  }
  
  // Build config object (password is already decrypted by model hook)
  const config = {
    id: tenant.id,
    dialect: tenant.dialect,
    host: tenant.db_host,
    port: tenant.db_port,
    database: tenant.db_name,
    username: tenant.db_user,
    password: tenant.db_password, // Already decrypted by model hook
    status: tenant.status,
    organization_id: tenant.organization_id
  };
  
  // Cache config (not connection)
  if (redis) {
    try {
      // Store config without password in a separate key for quick status checks
      const configWithoutPassword = { ...config };
      delete configWithoutPassword.password;
      await redis.setex(`tenant:status:${tenantId}`, TENANT_STATUS_CACHE_TTL, JSON.stringify(configWithoutPassword));
      
      // Store full config with shorter TTL
      await redis.setex(cacheKey, TENANT_CONFIG_CACHE_TTL, JSON.stringify(config));
    } catch (error) {
      logger.warn(`Redis cache write failed for tenant ${tenantId}:`, error.message);
    }
  }
  
  // Also cache in memory as fallback
  tenantCache.set(inMemoryKey, config);
  
  return config;
}

/**
 * Get or create tenant Sequelize connection
 * Connections are cached per process (not in Redis for security)
 */
async function getTenantSequelize(tenantId) {
  if (!tenantId) throw new Error('Tenant id missing');
  
  // Check in-memory connection cache first (connections can't be shared across processes)
  const connectionKey = `connection:${tenantId}`;
  if (tenantCache.has(connectionKey)) {
    const cached = tenantCache.get(connectionKey);
    // Verify connection is still alive
    try {
      await cached.authenticate();
      return cached;
    } catch (error) {
      // Connection dead, remove from cache
      tenantCache.delete(connectionKey);
    }
  }
  
  // Get tenant config (from Redis cache or DB)
  const config = await getTenantConfig(tenantId);
  
  // Build connection URL
  const encodedPassword = encodeURIComponent(config.password);
  const encodedUser = encodeURIComponent(config.username);
  const url = `${config.dialect}://${encodedUser}:${encodedPassword}@${config.host}:${config.port}/${config.database}`;
  
  // Create connection
  const sequelize = createSequelize(url);
  
  try {
    await sequelize.authenticate();
    logger.info(`Connection established for Tenant ${tenantId}`);
  } catch (error) {
    // Clear cache on connection failure
    await clearTenantCache(tenantId);
    throw fromCode('DB_CONNECTION_FAILED', [`Unable to connect to tenant ${tenantId}: ${error.message}`]);
  }
  
  // Cache connection in memory (per process)
  tenantCache.set(connectionKey, sequelize);
  
  // Security: Clear password from config after use
  config.password = '[REDACTED]';
  
  return sequelize;
}

/**
 * Clear tenant cache for a specific tenant
 * Closes the connection and removes from cache
 * @param {string} tenantId - Tenant ID to clear from cache
 */
async function clearTenantCache(tenantId) {
  const redis = getRedisClient();
  
  // Clear Redis cache
  if (redis) {
    try {
      await Promise.all([
        redis.del(`tenant:config:${tenantId}`),
        redis.del(`tenant:status:${tenantId}`),
        redis.del(`tenant:connection:${tenantId}`)
      ]);
    } catch (error) {
      logger.warn(`Failed to clear Redis cache for tenant ${tenantId}:`, error.message);
    }
  }
  
  // Clear in-memory cache
  const connectionKey = `connection:${tenantId}`;
  if (tenantCache.has(connectionKey)) {
    const sequelize = tenantCache.get(connectionKey);
    if (sequelize && typeof sequelize.close === 'function') {
      sequelize.close().catch(err => {
        logger.warn(`Error closing tenant connection for ${tenantId}:`, err.message);
      });
    }
    tenantCache.delete(connectionKey);
  }
  
  tenantCache.delete(`config:${tenantId}`);
  logger.info(`Tenant cache cleared for ${tenantId}`);
}

/**
 * Clear all tenant caches
 * Useful for cleanup or when all connections need to be refreshed
 */
async function clearAllTenantCache() {
  const redis = getRedisClient();
  
  // Clear Redis (pattern delete)
  if (redis) {
    try {
      const keys = await redis.keys('tenant:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      logger.warn('Failed to clear Redis tenant cache:', error.message);
    }
  }
  
  // Clear in-memory cache
  const tenantIds = Array.from(tenantCache.keys())
    .filter(key => key.startsWith('connection:'))
    .map(key => key.replace('connection:', ''));
    
  for (const tenantId of tenantIds) {
    await clearTenantCache(tenantId);
  }
  
  logger.info(`Cleared all tenant caches (${tenantIds.length} tenants)`);
}

module.exports = { 
  getTenantId, 
  getTenantSequelize, 
  clearTenantCache, 
  clearAllTenantCache,
  getTenantConfig // Export for use in other services
};


