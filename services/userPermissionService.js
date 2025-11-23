const { Op } = require('sequelize');
const { masterSequelize } = require('../config/db');
const { fromCode } = require('../utils/errors');
const { UserTenantPermission } = require('../models/UserTenantPermission');
const { UserPagePermission } = require('../models/UserPagePermission');

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

async function getUserPermissions(userId) {
  if (!userId) {
    return { tenants: [], pages: [] };
  }
  const [tenantRows, pageRows] = await Promise.all([
    UserTenantPermission.findAll({
      where: { user_id: userId },
      attributes: ['tenant_id'],
    }),
    UserPagePermission.findAll({
      where: { user_id: userId },
      attributes: ['page_key'],
    }),
  ]);

  return {
    tenants: tenantRows.map((row) => row.tenant_id),
    pages: pageRows.map((row) => row.page_key),
  };
}

async function getPermissionsForUsers(userIds = []) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return new Map();
  }
  const uniqueIds = Array.from(new Set(userIds));
  const [tenantRows, pageRows] = await Promise.all([
    UserTenantPermission.findAll({
      where: { user_id: { [Op.in]: uniqueIds } },
      attributes: ['user_id', 'tenant_id'],
    }),
    UserPagePermission.findAll({
      where: { user_id: { [Op.in]: uniqueIds } },
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

async function setUserPermissions(userId, tenantIds = [], pageKeys = []) {
  if (!userId) return;
  const normalizedTenants = normalizeStrings(tenantIds);
  const normalizedPages = normalizeStrings(pageKeys);

  await masterSequelize.transaction(async (transaction) => {
    await UserTenantPermission.destroy({ where: { user_id: userId }, transaction });
    await UserPagePermission.destroy({ where: { user_id: userId }, transaction });

    if (normalizedTenants.length > 0) {
      await UserTenantPermission.bulkCreate(
        normalizedTenants.map((tenantId) => ({ user_id: userId, tenant_id: tenantId })),
        { transaction }
      );
    }

    if (normalizedPages.length > 0) {
      await UserPagePermission.bulkCreate(
        normalizedPages.map((pageKey) => ({ user_id: userId, page_key: pageKey })),
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

async function assertUserHasPageAccess(user, tenantId, pageKey) {
  if (!tenantId) {
    throw fromCode('FORBIDDEN', ['Tenant is required for this request']);
  }
  if (!user || !user.userId) {
    throw fromCode('FORBIDDEN', ['User context missing']);
  }

  if (user.role === 'ADMIN' || user.role === 'MANAGER') {
    return;
  }

  const permissions = await getUserPermissions(user.userId);

  if (!permissions.tenants.includes(tenantId)) {
    throw fromCode('FORBIDDEN', [`You do not have access to tenant '${tenantId}'`]);
  }

  if (permissions.pages.length > 0 && pageKey && !permissions.pages.includes(pageKey)) {
    throw fromCode('FORBIDDEN', [`You do not have access to page '${pageKey}'`]);
  }
}

async function getAllowedPageKeys(user) {
  if (!user || !user.userId) return null;
  if (user.role === 'ADMIN' || user.role === 'MANAGER') {
    return null;
  }
  const permissions = await getUserPermissions(user.userId);
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

