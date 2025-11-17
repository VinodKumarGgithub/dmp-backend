const express = require('express');
const { authMiddleware } = require('../middleware/authMiddleware');
const {
  getPageData,
  getPageConfigAndData,
  downloadPageData
} = require('../controllers/pageController');

const router = express.Router();

// Tenant-aware routes – expect tenantResolver to have run before this router
router.use(authMiddleware);

router.get('/:pageKey', getPageConfigAndData);
router.get('/:pageKey/data', getPageData);
router.get('/:pageKey/download', downloadPageData);

module.exports = router;


