const express = require('express');
const { authMiddleware } = require('../middleware/authMiddleware');
const { queryRateLimiter } = require('../middleware/queryRateLimiter');
const {
  getPageData,
  getPageConfigAndData,
  downloadPageData,
  getTables,
  getTableColumns,
  getTableIndexes,
  getProcedureParameters,
  testQuery,
  detectColumns
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

// Page data routes
router.get('/:pageKey', getPageConfigAndData);
router.get('/:pageKey/data', getPageData);
router.get('/:pageKey/download', downloadPageData);
router.post('/:pageKey/test-query', testQuery);
router.post('/:pageKey/detect-columns', detectColumns);

module.exports = router;


