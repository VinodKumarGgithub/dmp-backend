const { success } = require('../utils/responseHandler');
const { userBlockingService } = require('../services/userBlockingService');
const { AdminUser } = require('../models/AdminUser');
const { PageConfig } = require('../models/PageConfig');
const { fromCode } = require('../utils/errors');

module.exports = {
  // GET /api/admin/users/blocked - Get all blocked users
  async getBlockedUsers(req, res, next) {
    try {
      // Pass organization_id to service for filtering
      // SUPER_ADMIN passes null to see all, others pass their organization_id
      const organizationId = req.user?.role === 'SUPER_ADMIN' ? null : req.user?.organization_id;
      const blockedUsers = await userBlockingService.getBlockedUsers(organizationId);
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

      // First fetch the user to check organization and role
      const targetUser = await AdminUser.findByPk(parseInt(userId, 10));
      if (!targetUser) {
        return next(fromCode('NOT_FOUND', [`User with id ${userId} not found`]));
      }

      // Prevent blocking SUPER_ADMIN
      if (targetUser.role === 'SUPER_ADMIN') {
        return next(fromCode('FORBIDDEN', ['This user cannot be blocked']));
      }

      // Prevent non-SUPER_ADMIN from blocking users from other organizations
      if (req.user?.role !== 'SUPER_ADMIN') {
        if (!req.user?.organization_id || targetUser.organization_id !== req.user.organization_id) {
          return next(fromCode('FORBIDDEN', ['You can only block users from your own organization']));
        }
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
      
      // First fetch the user to check organization
      const targetUser = await AdminUser.findByPk(parseInt(userId, 10));
      if (!targetUser) {
        return next(fromCode('NOT_FOUND', [`User with id ${userId} not found`]));
      }

      // Prevent non-SUPER_ADMIN from unblocking users from other organizations
      if (req.user?.role !== 'SUPER_ADMIN') {
        if (!req.user?.organization_id || targetUser.organization_id !== req.user.organization_id) {
          return next(fromCode('FORBIDDEN', ['You can only unblock users from your own organization']));
        }
      }

      const unblockedUser = await userBlockingService.unblockUser(parseInt(userId, 10));
      res.json(success(unblockedUser, 'User unblocked successfully'));
    } catch (err) {
      next(err);
    }
  },

  // GET /api/admin/users - Get all users (with blocking status)
  async getAllUsers(req, res, next) {
    try {
      const whereClause = {};
      
      // Filter by organization: SUPER_ADMIN sees all, others see only their org
      if (req.user?.role !== 'SUPER_ADMIN') {
        if (req.user?.organization_id) {
          whereClause.organization_id = req.user.organization_id;
        } else {
          // User has no organization_id - return empty
          return res.json(success([], 'Users fetched successfully'));
        }
      }
      // SUPER_ADMIN: whereClause remains empty, sees all users
      
      const users = await AdminUser.findAll({
        where: whereClause,
        attributes: ['id', 'username', 'role', 'organization_id', 'is_blocked', 'blocked_reason', 'blocked_at', 'createdon'],
        order: [['createdon', 'DESC']]
      });

      const usersList = users.map(user => ({
        id: user.id,
        username: user.username,
        role: user.role,
        organization_id: user.organization_id,
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
      const page = await PageConfig.findOne({ 
        where: { page_key: pageKey },
        attributes: ['tenant_access_json', 'organization_id']
      });
      
      if (!page) {
        return next(fromCode('PAGE_NOT_FOUND', [`Page '${pageKey}' not found`]));
      }

      // Prevent non-SUPER_ADMIN from accessing pages from other organizations
      if (req.user?.role !== 'SUPER_ADMIN') {
        // Allow access to global pages (null organization_id) or pages from user's organization
        if (page.organization_id && page.organization_id !== req.user?.organization_id) {
          return next(fromCode('FORBIDDEN', ['You can only access pages from your own organization']));
        }
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

      const page = await PageConfig.findOne({ 
        where: { page_key: pageKey },
        attributes: ['tenant_access_json', 'organization_id']
      });
      
      if (!page) {
        return next(fromCode('PAGE_NOT_FOUND', [`Page '${pageKey}' not found`]));
      }

      // Prevent non-SUPER_ADMIN from updating pages from other organizations
      if (req.user?.role !== 'SUPER_ADMIN') {
        // Allow access to global pages (null organization_id) or pages from user's organization
        if (page.organization_id && page.organization_id !== req.user?.organization_id) {
          return next(fromCode('FORBIDDEN', ['You can only update pages from your own organization']));
        }
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

