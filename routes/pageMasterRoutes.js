const express = require('express');
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireAdminOrDeveloper, requireAdmin } = require('../middleware/roleMiddleware');
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

// Admin or Developer can create/update pages, only Admin can delete
router.post('/', requireAdminOrDeveloper, createPageConfig);
router.put('/:pageKey', requireAdminOrDeveloper, updatePageConfig);
router.delete('/:pageKey', requireAdmin, deletePageConfig);

module.exports = router;


