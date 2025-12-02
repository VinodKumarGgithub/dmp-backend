const { createClient } = require('@clickhouse/client');
const { logger } = require('./logger');

/**
 * ClickHouse Client Configuration
 * Used for analytics and usage tracking
 */
let clickhouseClient = null;

function getClickHouseClient() {
  if (clickhouseClient) {
    return clickhouseClient;
  }

  const url = process.env.CLICKHOUSE_URL || 'http://localhost:8123';
  const database = process.env.CLICKHOUSE_DATABASE || 'analytics';
  const username = process.env.CLICKHOUSE_USER || 'admin';
  const password = process.env.CLICKHOUSE_PASSWORD || 'admin123';

  try {
    clickhouseClient = createClient({
      url: url, // Use url instead of deprecated url
      database: database,
      username: username,
      password: password,
      // Connection timeout
      request_timeout: 30000,
      // Compression for large inserts
      compression: {
        request: true,
        response: true
      }
    });

    logger.info('ClickHouse client initialized', { url, database });
    return clickhouseClient;
  } catch (error) {
    logger.error('Failed to initialize ClickHouse client:', error);
    // Return null if ClickHouse is not available (graceful degradation)
    return null;
  }
}

/**
 * Test ClickHouse connection
 */
async function testConnection() {
  try {
    const client = getClickHouseClient();
    if (!client) {
      return { connected: false, error: 'ClickHouse client not initialized' };
    }

    const result = await client.query({ query: 'SELECT 1' });
    await result.json();
    return { connected: true };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

module.exports = {
  getClickHouseClient,
  testConnection
};

