const express = require('express');
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireAdminOrDeveloper, requireAdmin } = require('../middleware/roleMiddleware');
const { requireActiveLicense } = require('../middleware/featureGateMiddleware');
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

// Read operations - no license check needed (read-only mode allowed)
router.get('/', listPages);
router.get('/:pageKey/config', getPageConfig);

// Write operations - require active license (block expired licenses)
router.post('/', requireActiveLicense('create'), requireAdminOrDeveloper, createPageConfig);
router.put('/:pageKey', requireActiveLicense('update'), requireAdminOrDeveloper, updatePageConfig);
router.delete('/:pageKey', requireActiveLicense('delete'), requireAdmin, deletePageConfig);

module.exports = router;


