const bcrypt = require('bcryptjs');
const { AdminUser } = require('../models/AdminUser');
const { fromCode } = require('../utils/errors');
const { mapDbError } = require('../utils/dbErrorMapper');
const { success } = require('../utils/responseHandler');
const { Joi, validate } = require('../utils/validationUtils');
const {
  setUserPermissions,
  getPermissionsForUsers,
  getUserPermissions,
  deleteUserPermissions,
} = require('../services/userPermissionService');

// List all admin users
async function listUsers(req, res, next) {
  try {
    const users = await AdminUser.findAll({
      attributes: ['id', 'username', 'role', 'is_blocked', 'blocked_reason', 'blocked_at', 'createdon', 'updatedon'],
      order: [['createdon', 'DESC']],
      raw: true,
    });
    const userIds = users.map((user) => user.id);
    const permissionsMap = await getPermissionsForUsers(userIds);
    const enrichedUsers = users.map((user) => {
      const perms = permissionsMap.get(user.id) || { tenants: [], pages: [] };
      return {
        ...user,
        tenant_permissions: perms.tenants,
        page_permissions: perms.pages,
      };
    });
    res.json(success(enrichedUsers, 'Users fetched successfully'));
  } catch (err) {
    next(err);
  }
}

// Create new admin user
async function createUser(req, res, next) {
  try {
    const schema = Joi.object({
      username: Joi.string().required().min(3).max(50).pattern(/^[a-zA-Z0-9_]+$/),
      password: Joi.string().required().min(6).max(100),
      role: Joi.string().valid('ADMIN', 'MANAGER', 'USER', 'DEVELOPER').default('USER'),
      tenantIds: Joi.array().items(Joi.string().trim()).default([]),
      pageKeys: Joi.array().items(Joi.string().trim()).default([]),
    });

    const data = validate(schema, req.body);

    // Check if username already exists
    const existing = await AdminUser.findOne({ where: { username: data.username } });
    if (existing) {
      return next(fromCode('DB_DUPLICATE_KEY', [`Username '${data.username}' already exists`]));
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 10);

    // Create user
    const user = await AdminUser.create({
      username: data.username,
      password_hash: passwordHash,
      role: data.role || 'USER',
    });

    const effectiveRole = user.role;
    const tenantIds = Array.isArray(data.tenantIds) ? data.tenantIds : [];
    const pageKeys = Array.isArray(data.pageKeys) ? data.pageKeys : [];

    if (effectiveRole !== 'ADMIN' && effectiveRole !== 'MANAGER' && effectiveRole !== 'DEVELOPER' && tenantIds.length === 0) {
      return next(fromCode('VALIDATION_ERROR', ['Please assign at least one tenant']));
    }

    const permissions = await setUserPermissions(user.id, tenantIds, pageKeys);

    // Return user without password hash
    const userResponse = {
      id: user.id,
      username: user.username,
      role: user.role,
      createdon: user.createdon,
      updatedon: user.updatedon,
      tenant_permissions: permissions.tenants,
      page_permissions: permissions.pages,
    };

    res.status(201).json(success(userResponse, 'User created successfully'));
  } catch (err) {
    if (err.code) return next(err);
    next(mapDbError(err));
  }
}

// Update user (password and/or role)
async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const schema = Joi.object({
      password: Joi.string().min(6).max(100).optional(),
      role: Joi.string().valid('ADMIN', 'MANAGER', 'USER', 'DEVELOPER').optional(),
      tenantIds: Joi.array().items(Joi.string().trim()).optional(),
      pageKeys: Joi.array().items(Joi.string().trim()).optional(),
    });

    const data = validate(schema, req.body);

    const user = await AdminUser.findByPk(id);
    if (!user) {
      return next(fromCode('NOT_FOUND', [`User with id ${id} not found`]));
    }

    // Update password if provided
    if (data.password) {
      const passwordHash = await bcrypt.hash(data.password, 10);
      user.password_hash = passwordHash;
    }

    // Update role if provided
    if (data.role) {
      user.role = data.role;
    }

    // Save if any changes
    if (data.password || data.role) {
      await user.save();
    }

    const permissionsPayload = {};
    let latestPermissions;
    if (data.tenantIds !== undefined || data.pageKeys !== undefined) {
      const currentPermissions = await getUserPermissions(user.id);
      const tenantIds = data.tenantIds !== undefined ? data.tenantIds : currentPermissions.tenants;
      const pageKeys = data.pageKeys !== undefined ? data.pageKeys : currentPermissions.pages;

      if (user.role !== 'ADMIN' && user.role !== 'MANAGER' && user.role !== 'DEVELOPER' && tenantIds.length === 0) {
        return next(fromCode('VALIDATION_ERROR', ['Please assign at least one tenant']));
      }

      latestPermissions = await setUserPermissions(user.id, tenantIds, pageKeys);
    } else {
      latestPermissions = await getUserPermissions(user.id);
    }
    permissionsPayload.tenant_permissions = latestPermissions.tenants;
    permissionsPayload.page_permissions = latestPermissions.pages;

    // Return updated user without password hash
    const userResponse = {
      id: user.id,
      username: user.username,
      role: user.role,
      createdon: user.createdon,
      updatedon: user.updatedon,
      ...permissionsPayload,
    };

    res.json(success(userResponse, 'User updated successfully'));
  } catch (err) {
    if (err.code) return next(err);
    next(mapDbError(err));
  }
}

// Delete user
async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;

    const user = await AdminUser.findByPk(id);
    if (!user) {
      return next(fromCode('NOT_FOUND', [`User with id ${id} not found`]));
    }

    // Prevent deleting yourself
    if (user.username === req.user.username) {
      return next(fromCode('FORBIDDEN', ['You cannot delete your own account']));
    }

    await deleteUserPermissions(user.id);
    await user.destroy();

    res.json(success({ id: parseInt(id) }, 'User deleted successfully'));
  } catch (err) {
    if (err.code) return next(err);
    next(mapDbError(err));
  }
}

// Get user by ID
async function getUserById(req, res, next) {
  try {
    const { id } = req.params;

    const user = await AdminUser.findByPk(id, {
      attributes: ['id', 'username', 'role', 'is_blocked', 'blocked_reason', 'blocked_at', 'createdon', 'updatedon'],
    });

    if (!user) {
      return next(fromCode('NOT_FOUND', [`User with id ${id} not found`]));
    }

    const permissions = await getUserPermissions(user.id);
    const userResponse = {
      ...user.toJSON(),
      tenant_permissions: permissions.tenants,
      page_permissions: permissions.pages,
    };

    res.json(success(userResponse, 'User fetched successfully'));
  } catch (err) {
    if (err.code) return next(err);
    next(mapDbError(err));
  }
}

module.exports = {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  getUserById,
};

