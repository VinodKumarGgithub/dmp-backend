const express = require('express');
const { authMiddleware } = require('../middleware/authMiddleware');
const {
  getCurrentProfile,
  updateProfile,
  changePassword,
  getPreferences,
  updatePreferences,
  updateProfilePicture,
  removeProfilePicture,
} = require('../controllers/profileController');

const router = express.Router();

// All profile routes require authentication (users manage their own profile)
router.use(authMiddleware);

router.get('/', getCurrentProfile);
router.put('/', updateProfile);
router.put('/password', changePassword);
router.put('/picture', updateProfilePicture);
router.delete('/picture', removeProfilePicture);
router.get('/preferences', getPreferences);
router.put('/preferences', updatePreferences);

module.exports = router;

