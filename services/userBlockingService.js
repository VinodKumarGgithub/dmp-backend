const { AdminUser } = require('../models/AdminUser');
const { fromCode } = require('../utils/errors');
const { mapDbError } = require('../utils/dbErrorMapper');

const userBlockingService = {
  // Block a user
  async blockUser(userId, reason, blockedBy = null) {
    try {
      const user = await AdminUser.findByPk(userId);
      if (!user) {
        throw fromCode('NOT_FOUND', [`User with id ${userId} not found`]);
      }

      // Prevent blocking ADMIN or SUPER_ADMIN
      if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
        throw fromCode('FORBIDDEN', [`Cannot block an ${user.role} user`]);
      }

      user.is_blocked = true;
      user.blocked_reason = reason || 'Account blocked by administrator';
      user.blocked_at = new Date();
      await user.save();

      return {
        id: user.id,
        username: user.username,
        is_blocked: user.is_blocked,
        blocked_reason: user.blocked_reason,
        blocked_at: user.blocked_at
      };
    } catch (error) {
      if (error.code) throw error;
      throw mapDbError(error);
    }
  },

  // Unblock a user
  async unblockUser(userId) {
    try {
      const user = await AdminUser.findByPk(userId);
      if (!user) {
        throw fromCode('NOT_FOUND', [`User with id ${userId} not found`]);
      }

      user.is_blocked = false;
      user.blocked_reason = null;
      user.blocked_at = null;
      await user.save();

      return {
        id: user.id,
        username: user.username,
        is_blocked: user.is_blocked,
        blocked_reason: user.blocked_reason,
        blocked_at: user.blocked_at
      };
    } catch (error) {
      if (error.code) throw error;
      throw mapDbError(error);
    }
  },

  // Get blocked users
  async getBlockedUsers(organizationId = null) {
    try {
      const whereClause = { is_blocked: true };
      
      // Filter by organization if provided (null means SUPER_ADMIN sees all)
      if (organizationId !== null) {
        whereClause.organization_id = organizationId;
      }
      // If organizationId is null, SUPER_ADMIN sees all blocked users
      
      const blockedUsers = await AdminUser.findAll({
        where: whereClause,
        attributes: ['id', 'username', 'role', 'organization_id', 'blocked_reason', 'blocked_at', 'createdon'],
        order: [['blocked_at', 'DESC']]
      });

      return blockedUsers.map(user => ({
        id: user.id,
        username: user.username,
        role: user.role,
        organization_id: user.organization_id,
        blocked_reason: user.blocked_reason,
        blocked_at: user.blocked_at,
        createdon: user.createdon
      }));
    } catch (error) {
      if (error.code) throw error;
      throw mapDbError(error);
    }
  },

  // Block user by username (for automatic blocking on dangerous SQL)
  async blockUserByUsername(username, reason) {
    try {
      const user = await AdminUser.findOne({ where: { username } });
      if (!user) {
        return null; // User not found, can't block
      }

      // Prevent blocking ADMIN or SUPER_ADMIN automatically
      if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
        // Log but don't block admin/super_admin users automatically
        console.warn(`Attempted to auto-block ${user.role} user: ${username}. Reason: ${reason}`);
        return null;
      }

      return await this.blockUser(user.id, reason);
    } catch (error) {
      console.error('Error blocking user by username:', error);
      return null;
    }
  }
};

module.exports = { userBlockingService };

