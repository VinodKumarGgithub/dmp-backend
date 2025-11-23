const express = require('express');
const { authMiddleware } = require('../middleware/authMiddleware');
const { getPreferences, savePreferences } = require('../controllers/userPreferenceController');

const router = express.Router();

router.use(authMiddleware);

router.get('/:pageKey', getPreferences);
router.put('/:pageKey', savePreferences);

module.exports = router;

