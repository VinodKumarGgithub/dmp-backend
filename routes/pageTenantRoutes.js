const express = require('express');
const { authMiddleware } = require('../middleware/authMiddleware');
const { queryRateLimiter } = require('../middleware/queryRateLimiter');
const { requireActiveLicense } = require('../middleware/featureGateMiddleware');
const {
  getPageData,
  getPageConfigAndData,
  downloadPageData,
  getTables,
  getTableColumns,
  getTableIndexes,
  getProcedureParameters,
  testQuery,
  detectColumns,
  detectColumnsEnhanced
} = require('../controllers/pageController');

const router = express.Router();

// Tenant-aware routes – expect tenantResolver to have run before this router
router.use(authMiddleware);

// Apply rate limiting to query endpoints
router.use(queryRateLimiter);

// Database metadata routes (need tenant DB)
router.get('/db/tables', getTables);
router.get('/db/tables/:tableName/columns', getTableColumns);
router.get('/db/tables/:tableName/indexes', getTableIndexes);
router.get('/db/procedures/:procedureName/parameters', getProcedureParameters);

// Page data routes (read operations - no license check needed)
router.get('/:pageKey', getPageConfigAndData);
router.get('/:pageKey/data', getPageData);

// Export/download - require active license
router.get('/:pageKey/download', requireActiveLicense('export'), downloadPageData);

// Write operations - require active license
router.post('/:pageKey/test-query', requireActiveLicense('create'), testQuery);
router.post('/:pageKey/detect-columns', requireActiveLicense('create'), detectColumns);
router.post('/:pageKey/detect-columns-enhanced', requireActiveLicense('create'), detectColumnsEnhanced);

module.exports = router;


