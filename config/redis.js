const Redis = require('ioredis');
const { logger } = require('./logger');
const { REDIS } = require('./constants');

let redisClient = null;
let redisCluster = null;

/**
 * Get Redis client (singleton)
 * Supports both single instance and cluster mode
 */
function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }
  if (redisCluster) {
    return redisCluster;
  }

  try {
    const redisUrl = process.env.REDIS_URL || REDIS.URL;
    const isCluster = process.env.REDIS_CLUSTER === 'true' || REDIS.CLUSTER === true;
    
    // Check if cluster mode
    if (isCluster && (process.env.REDIS_NODES || REDIS.NODES)) {
      const nodes = process.env.REDIS_NODES 
        ? JSON.parse(process.env.REDIS_NODES) 
        : REDIS.NODES;
      
      if (!Array.isArray(nodes) || nodes.length === 0) {
        logger.warn('Redis cluster mode enabled but no nodes provided, falling back to single instance');
      } else {
        redisCluster = new Redis.Cluster(nodes, {
          redisOptions: {
            password: process.env.REDIS_PASSWORD || REDIS.PASSWORD || null,
            connectTimeout: 10000,
            lazyConnect: true,
          },
          clusterRetryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          enableOfflineQueue: false,
        });
        
        redisCluster.on('error', (err) => {
          logger.error('Redis Cluster error:', err);
        });
        
        redisCluster.on('connect', () => {
          logger.info('Redis Cluster connected');
        });
        
        redisCluster.on('ready', () => {
          logger.info('Redis Cluster ready');
        });
        
        return redisCluster;
      }
    }
    
    // Single instance mode
    redisClient = new Redis(redisUrl, {
      connectTimeout: 10000,
      lazyConnect: true,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay > 1000 ? null : delay; // Stop retrying after 1s
      },
      enableOfflineQueue: false,
      maxRetriesPerRequest: 3,
      password: process.env.REDIS_PASSWORD || REDIS.PASSWORD || null,
    });
    
    redisClient.on('error', (err) => {
      logger.error('Redis error:', err);
    });
    
    redisClient.on('connect', () => {
      logger.info('Redis connected');
    });
    
    redisClient.on('ready', () => {
      logger.info('Redis ready');
    });
    
    return redisClient;
  } catch (error) {
    logger.error('Failed to initialize Redis:', error);
    return null;
  }
}

/**
 * Test Redis connection
 */
async function testRedisConnection() {
  try {
    const client = getRedisClient();
    if (!client) {
      return { connected: false, error: 'Redis client not initialized' };
    }
    
    // Connect explicitly if using lazyConnect
    if (client.status !== 'ready' && client.status !== 'connecting') {
      try {
        await client.connect();
      } catch (connectError) {
        // Connection will be retried automatically by retryStrategy
        // Don't fail here, let ping() handle it
      }
    }
    
    // Wait a bit for connection if still connecting
    if (client.status === 'connecting') {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    
    // Try to ping
    try {
      await client.ping();
      return { connected: true };
    } catch (pingError) {
      // If ping fails but client is still connecting, return as connecting
      if (client.status === 'connecting' || client.status === 'wait') {
        return { connected: false, error: 'Redis connecting...' };
      }
      throw pingError;
    }
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

/**
 * Graceful shutdown
 */
async function closeRedisConnection() {
  try {
    if (redisCluster) {
      await redisCluster.quit();
      redisCluster = null;
    }
    if (redisClient) {
      await redisClient.quit();
      redisClient = null;
    }
    logger.info('Redis connections closed');
  } catch (error) {
    logger.error('Error closing Redis connection:', error);
  }
}

module.exports = {
  getRedisClient,
  testRedisConnection,
  closeRedisConnection
};

