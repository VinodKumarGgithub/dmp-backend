const express = require('express');
const { authMiddleware } = require('../middleware/authMiddleware');
const {
  getPageData,
  getPageConfigAndData,
  downloadPageData,
  getTables,
  getTableColumns,
  getTableIndexes,
  getProcedureParameters
} = require('../controllers/pageController');

const router = express.Router();

// Tenant-aware routes – expect tenantResolver to have run before this router
router.use(authMiddleware);

// Database metadata routes (need tenant DB)
router.get('/db/tables', getTables);
router.get('/db/tables/:tableName/columns', getTableColumns);
router.get('/db/tables/:tableName/indexes', getTableIndexes);
router.get('/db/procedures/:procedureName/parameters', getProcedureParameters);

// Page data routes
router.get('/:pageKey', getPageConfigAndData);
router.get('/:pageKey/data', getPageData);
router.get('/:pageKey/download', downloadPageData);

module.exports = router;


