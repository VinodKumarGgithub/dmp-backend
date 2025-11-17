const express = require('express');
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
const {
  listPages,
  getPageConfig,
  createPageConfig,
  updatePageConfig,
  deletePageConfig
} = require('../controllers/pageController');

const router = express.Router();

// Master DB only – no tenantResolver needed
router.use(authMiddleware);

router.get('/', listPages);
router.get('/:pageKey/config', getPageConfig);

// Admin only routes for managing page configs
router.post('/', requireAdmin, createPageConfig);
router.put('/:pageKey', requireAdmin, updatePageConfig);
router.delete('/:pageKey', requireAdmin, deletePageConfig);

module.exports = router;


