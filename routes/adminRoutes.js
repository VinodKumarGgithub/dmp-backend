const express = require('express');
const router = express.Router();
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
const adminController = require('../controllers/adminController');

// All admin routes require authentication and admin role
router.use(authMiddleware);
router.use(requireAdmin);

// User blocking routes
router.get('/users', adminController.getAllUsers);
router.get('/users/blocked', adminController.getBlockedUsers);
router.post('/users/:userId/block', adminController.blockUser);
router.post('/users/:userId/unblock', adminController.unblockUser);

module.exports = router;

