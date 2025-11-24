const { success } = require('../utils/responseHandler');
const { userBlockingService } = require('../services/userBlockingService');
const { AdminUser } = require('../models/AdminUser');
const { PageConfig } = require('../models/PageConfig');
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
  },

  // GET /api/admin/pages/:pageKey/tenants - Get tenant access for a page
  async getPageTenantAccess(req, res, next) {
    try {
      const { pageKey } = req.params;
      const page = await PageConfig.findOne({ where: { page_key: pageKey } });
      
      if (!page) {
        return next(fromCode('PAGE_NOT_FOUND', [`Page '${pageKey}' not found`]));
      }

      // Parse tenant access JSON
      let tenantIds = [];
      if (page.tenant_access_json) {
        try {
          tenantIds = JSON.parse(page.tenant_access_json);
          if (!Array.isArray(tenantIds)) tenantIds = [];
        } catch {
          tenantIds = [];
        }
      }

      res.json(success({ 
        pageKey, 
        tenantIds,
        isGeneric: tenantIds.length === 0 
      }, 'Page tenant access fetched successfully'));
    } catch (err) {
      next(err);
    }
  },

  // PUT /api/admin/pages/:pageKey/tenants - Update tenant access for a page
  async updatePageTenantAccess(req, res, next) {
    try {
      const { pageKey } = req.params;
      const { tenantIds } = req.body;

      if (!Array.isArray(tenantIds)) {
        return next(fromCode('VALIDATION_ERROR', ['tenantIds must be an array']));
      }

      const page = await PageConfig.findOne({ where: { page_key: pageKey } });
      
      if (!page) {
        return next(fromCode('PAGE_NOT_FOUND', [`Page '${pageKey}' not found`]));
      }

      // Update tenant_access_json
      // Empty array or null = generic (all tenants)
      // Non-empty array = only these tenants
      if (tenantIds.length === 0) {
        page.tenant_access_json = null;
      } else {
        // Validate tenant IDs are strings
        const validTenantIds = tenantIds.filter(id => typeof id === 'string' && id.trim().length > 0);
        page.tenant_access_json = JSON.stringify(validTenantIds);
      }

      await page.save();

      res.json(success({ 
        pageKey, 
        tenantIds: tenantIds.length === 0 ? [] : tenantIds,
        isGeneric: tenantIds.length === 0 
      }, 'Page tenant access updated successfully'));
    } catch (err) {
      if (err.code) return next(err);
      next(fromCode('INTERNAL_ERROR', [err.message]));
    }
  }
};

