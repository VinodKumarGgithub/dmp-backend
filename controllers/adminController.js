const { success } = require('../utils/responseHandler');
const { userBlockingService } = require('../services/userBlockingService');
const { AdminUser } = require('../models/AdminUser');
const { fromCode } = require('../utils/errors');

module.exports = {
  // GET /api/admin/users/blocked - Get all blocked users
  async getBlockedUsers(req, res, next) {
    try {
      const blockedUsers = await userBlockingService.getBlockedUsers();
      res.json(success(blockedUsers, 'Blocked users fetched successfully'));
    } catch (err) {
      next(err);
    }
  },

  // POST /api/admin/users/:userId/block - Block a user
  async blockUser(req, res, next) {
    try {
      const { userId } = req.params;
      const { reason } = req.body;

      if (!reason || typeof reason !== 'string' || !reason.trim()) {
        return next(fromCode('VALIDATION_ERROR', ['Block reason is required']));
      }

      const blockedUser = await userBlockingService.blockUser(
        parseInt(userId, 10),
        reason.trim(),
        req.user?.username
      );

      res.json(success(blockedUser, 'User blocked successfully'));
    } catch (err) {
      next(err);
    }
  },

  // POST /api/admin/users/:userId/unblock - Unblock a user
  async unblockUser(req, res, next) {
    try {
      const { userId } = req.params;
      const unblockedUser = await userBlockingService.unblockUser(parseInt(userId, 10));
      res.json(success(unblockedUser, 'User unblocked successfully'));
    } catch (err) {
      next(err);
    }
  },

  // GET /api/admin/users - Get all users (with blocking status)
  async getAllUsers(req, res, next) {
    try {
      const users = await AdminUser.findAll({
        attributes: ['id', 'username', 'role', 'is_blocked', 'blocked_reason', 'blocked_at', 'createdon'],
        order: [['createdon', 'DESC']]
      });

      const usersList = users.map(user => ({
        id: user.id,
        username: user.username,
        role: user.role,
        is_blocked: user.is_blocked,
        blocked_reason: user.blocked_reason,
        blocked_at: user.blocked_at,
        createdon: user.createdon
      }));

      res.json(success(usersList, 'Users fetched successfully'));
    } catch (err) {
      next(err);
    }
  }
};

