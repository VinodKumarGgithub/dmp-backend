const { Op } = require('sequelize');
const { masterSequelize } = require('../config/db');
const { fromCode } = require('../utils/errors');
const { UserTenantPermission } = require('../models/UserTenantPermission');
const { UserPagePermission } = require('../models/UserPagePermission');
const { isSuperAdmin, canAccessOrganization } = require('../middleware/roleMiddleware');

function normalizeStrings(values = []) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .filter((value) => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim())
    )
  );
}

async function getUserPermissions(userId, organizationId) {
  if (!userId) {
    return { tenants: [], pages: [] };
  }
  
  const whereClause = { user_id: userId };
  if (organizationId) {
    whereClause.organization_id = organizationId;
  }
  
  const [tenantRows, pageRows] = await Promise.all([
    UserTenantPermission.findAll({
      where: whereClause,
      attributes: ['tenant_id'],
    }),
    UserPagePermission.findAll({
      where: whereClause,
      attributes: ['page_key'],
    }),
  ]);

  return {
    tenants: tenantRows.map((row) => row.tenant_id),
    pages: pageRows.map((row) => row.page_key),
  };
}

async function getPermissionsForUsers(userIds = [], organizationId = null) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return new Map();
  }
  const uniqueIds = Array.from(new Set(userIds));
  
  const whereClause = { user_id: { [Op.in]: uniqueIds } };
  if (organizationId) {
    whereClause.organization_id = organizationId;
  }
  
  const [tenantRows, pageRows] = await Promise.all([
    UserTenantPermission.findAll({
      where: whereClause,
      attributes: ['user_id', 'tenant_id'],
    }),
    UserPagePermission.findAll({
      where: whereClause,
      attributes: ['user_id', 'page_key'],
    }),
  ]);

  const map = new Map();
  uniqueIds.forEach((id) => {
    map.set(id, { tenants: [], pages: [] });
  });

  tenantRows.forEach((row) => {
    const entry = map.get(row.user_id);
    if (entry) {
      entry.tenants.push(row.tenant_id);
    }
  });

  pageRows.forEach((row) => {
    const entry = map.get(row.user_id);
    if (entry) {
      entry.pages.push(row.page_key);
    }
  });

  return map;
}

async function setUserPermissions(userId, tenantIds = [], pageKeys = [], organizationId) {
  if (!userId || !organizationId) {
    throw fromCode('VALIDATION_ERROR', ['User ID and Organization ID are required']);
  }
  
  const normalizedTenants = normalizeStrings(tenantIds);
  const normalizedPages = normalizeStrings(pageKeys);

  await masterSequelize.transaction(async (transaction) => {
    await UserTenantPermission.destroy({ 
      where: { user_id: userId, organization_id: organizationId }, 
      transaction 
    });
    await UserPagePermission.destroy({ 
      where: { user_id: userId, organization_id: organizationId }, 
      transaction 
    });

    if (normalizedTenants.length > 0) {
      await UserTenantPermission.bulkCreate(
        normalizedTenants.map((tenantId) => ({ 
          user_id: userId, 
          organization_id: organizationId,
          tenant_id: tenantId 
        })),
        { transaction }
      );
    }

    if (normalizedPages.length > 0) {
      await UserPagePermission.bulkCreate(
        normalizedPages.map((pageKey) => ({ 
          user_id: userId, 
          organization_id: organizationId,
          page_key: pageKey 
        })),
        { transaction }
      );
    }
  });

  return { tenants: normalizedTenants, pages: normalizedPages };
}

async function deleteUserPermissions(userId) {
  if (!userId) return;
  await Promise.all([
    UserTenantPermission.destroy({ where: { user_id: userId } }),
    UserPagePermission.destroy({ where: { user_id: userId } }),
  ]);
}

async function assertUserHasPageAccess(user, tenantId, pageKey, organizationId) {
  if (!tenantId) {
    throw fromCode('FORBIDDEN', ['Tenant is required for this request']);
  }
  if (!user || !user.userId) {
    throw fromCode('FORBIDDEN', ['User context missing']);
  }
  if (!organizationId) {
    throw fromCode('FORBIDDEN', ['Organization ID is required']);
  }

  // SUPER_ADMIN and ADMIN/MANAGER/DEVELOPER bypass permission checks
  if (isSuperAdmin(user) || user.role === 'ADMIN' || user.role === 'MANAGER' || user.role === 'DEVELOPER') {
    // But still check organization access (unless SUPER_ADMIN)
    if (!isSuperAdmin(user) && !canAccessOrganization(user, organizationId)) {
      throw fromCode('FORBIDDEN', [`You do not have access to organization '${organizationId}'`]);
    }
    return;
  }

  const permissions = await getUserPermissions(user.userId, organizationId);

  if (!permissions.tenants.includes(tenantId)) {
    throw fromCode('FORBIDDEN', [`You do not have access to tenant '${tenantId}'`]);
  }

  if (permissions.pages.length > 0 && pageKey && !permissions.pages.includes(pageKey)) {
    throw fromCode('FORBIDDEN', [`You do not have access to page '${pageKey}'`]);
  }
}

async function getAllowedPageKeys(user, organizationId) {
  if (!user || !user.userId) return null;
  if (isSuperAdmin(user) || user.role === 'ADMIN' || user.role === 'MANAGER' || user.role === 'DEVELOPER') {
    return null;  // No restrictions for SUPER_ADMIN and elevated roles
  }
  if (!organizationId) return null;
  
  const permissions = await getUserPermissions(user.userId, organizationId);
  if (permissions.pages && permissions.pages.length > 0) {
    return permissions.pages;
  }
  return null;
}

module.exports = {
  getUserPermissions,
  getPermissionsForUsers,
  setUserPermissions,
  deleteUserPermissions,
  assertUserHasPageAccess,
  getAllowedPageKeys,
};

