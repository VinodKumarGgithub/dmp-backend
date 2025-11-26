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
    const whereClause = {};
    
    // Filter by organization: SUPER_ADMIN sees all, others see only their org
    if (req.user?.role !== 'SUPER_ADMIN') {
      if (req.user?.organization_id) {
        // Regular users see only users from their organization
        whereClause.organization_id = req.user.organization_id;
      } else {
        // User has no organization_id - return empty (shouldn't happen for non-SUPER_ADMIN)
        return res.json(success([], 'Users fetched successfully'));
      }
    }
    // SUPER_ADMIN: whereClause remains empty, sees all users
    
    const users = await AdminUser.findAll({
      where: whereClause,
      attributes: ['id', 'username', 'name', 'email', 'phone_number', 'role', 'organization_id', 'is_blocked', 'blocked_reason', 'blocked_at', 'createdon', 'updatedon'],
      order: [['createdon', 'DESC']],
      raw: true,
    });
    
    const userIds = users.map((user) => user.id);
    // For non-SUPER_ADMIN, filter permissions by organization
    // For SUPER_ADMIN, show all permissions (or could filter by specific org if needed)
    const organizationId = req.user?.role === 'SUPER_ADMIN' ? null : req.user?.organization_id;
    const permissionsMap = await getPermissionsForUsers(userIds, organizationId);
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
      organization_id: Joi.string().allow(null, '').when('role', {
        is: 'SUPER_ADMIN',
        then: Joi.optional(),
        otherwise: Joi.required()
      }),
      name: Joi.string().allow('', null).max(100).optional(),
      email: Joi.string().email().allow('', null).max(255).optional(),
      phone_number: Joi.string().allow('', null).max(20).optional(),
      role: Joi.string().valid('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER', 'DEVELOPER').default('USER'),
      tenantIds: Joi.array().items(Joi.string().trim()).default([]),
      pageKeys: Joi.array().items(Joi.string().trim()).default([]),
    });

    const data = validate(schema, req.body);

    // Prevent non-SUPER_ADMIN from creating SUPER_ADMIN
    if (data.role === 'SUPER_ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
      return next(fromCode('FORBIDDEN', ['Only SUPER_ADMIN can create SUPER_ADMIN users']));
    }

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
      organization_id: data.organization_id || null,
      password_hash: passwordHash,
      name: data.name || null,
      email: data.email || null,
      phone_number: data.phone_number || null,
      role: data.role || 'USER',
    });

    const effectiveRole = user.role;
    const tenantIds = Array.isArray(data.tenantIds) ? data.tenantIds : [];
    const pageKeys = Array.isArray(data.pageKeys) ? data.pageKeys : [];

    if (effectiveRole !== 'SUPER_ADMIN' && effectiveRole !== 'ADMIN' && effectiveRole !== 'MANAGER' && effectiveRole !== 'DEVELOPER' && tenantIds.length === 0) {
      return next(fromCode('VALIDATION_ERROR', ['Please assign at least one tenant']));
    }

    const organizationId = user.organization_id || data.organization_id;
    if (!organizationId && effectiveRole !== 'SUPER_ADMIN') {
      return next(fromCode('VALIDATION_ERROR', ['Organization ID is required for non-SUPER_ADMIN users']));
    }

    const permissions = organizationId ? await setUserPermissions(user.id, tenantIds, pageKeys, organizationId) : { tenants: [], pages: [] };

    // Return user without password hash
    const userResponse = {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      phone_number: user.phone_number,
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
      organization_id: Joi.string().allow(null, '').optional(),
      name: Joi.string().allow('', null).max(100).optional(),
      email: Joi.string().email().allow('', null).max(255).optional(),
      phone_number: Joi.string().allow('', null).max(20).optional(),
      role: Joi.string().valid('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER', 'DEVELOPER').optional(),
      tenantIds: Joi.array().items(Joi.string().trim()).optional(),
      pageKeys: Joi.array().items(Joi.string().trim()).optional(),
    });

    const data = validate(schema, req.body);

    const user = await AdminUser.findByPk(id);
    if (!user) {
      return next(fromCode('NOT_FOUND', [`User with id ${id} not found`]));
    }

    // Prevent non-SUPER_ADMIN from accessing users from other organizations
    if (req.user?.role !== 'SUPER_ADMIN') {
      if (!req.user?.organization_id || user.organization_id !== req.user.organization_id) {
        return next(fromCode('FORBIDDEN', ['You can only update users from your own organization']));
      }
    }

    // Prevent non-SUPER_ADMIN from updating users to SUPER_ADMIN
    if (data.role === 'SUPER_ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
      return next(fromCode('FORBIDDEN', ['Only SUPER_ADMIN can assign SUPER_ADMIN role']));
    }

    // Prevent non-SUPER_ADMIN from updating existing SUPER_ADMIN users
    if (user.role === 'SUPER_ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
      return next(fromCode('FORBIDDEN', ['You cannot update SUPER_ADMIN users']));
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

    // Update organization_id if provided
    if (data.organization_id !== undefined) {
      user.organization_id = data.organization_id || null;
    }

    // Update name, email, phone_number if provided
    if (data.name !== undefined) {
      user.name = data.name || null;
    }
    if (data.email !== undefined) {
      user.email = data.email || null;
    }
    if (data.phone_number !== undefined) {
      user.phone_number = data.phone_number || null;
    }

    // Save if any changes
    if (data.password || data.role || data.organization_id !== undefined || data.name !== undefined || data.email !== undefined || data.phone_number !== undefined) {
      await user.save();
    }

    const permissionsPayload = {};
    let latestPermissions;
    if (data.tenantIds !== undefined || data.pageKeys !== undefined) {
      const currentPermissions = await getUserPermissions(user.id);
      const tenantIds = data.tenantIds !== undefined ? data.tenantIds : currentPermissions.tenants;
      const pageKeys = data.pageKeys !== undefined ? data.pageKeys : currentPermissions.pages;

      if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN' && user.role !== 'MANAGER' && user.role !== 'DEVELOPER' && tenantIds.length === 0) {
        return next(fromCode('VALIDATION_ERROR', ['Please assign at least one tenant']));
      }

      const organizationId = user.organization_id;
      if (!organizationId && user.role !== 'SUPER_ADMIN') {
        return next(fromCode('VALIDATION_ERROR', ['Organization ID is required for non-SUPER_ADMIN users']));
      }

      latestPermissions = organizationId ? await setUserPermissions(user.id, tenantIds, pageKeys, organizationId) : { tenants: [], pages: [] };
    } else {
      latestPermissions = await getUserPermissions(user.id);
    }
    permissionsPayload.tenant_permissions = latestPermissions.tenants;
    permissionsPayload.page_permissions = latestPermissions.pages;

    // Return updated user without password hash
    const userResponse = {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      phone_number: user.phone_number,
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

    // Prevent non-SUPER_ADMIN from deleting users from other organizations
    if (req.user?.role !== 'SUPER_ADMIN') {
      if (!req.user?.organization_id || user.organization_id !== req.user.organization_id) {
        return next(fromCode('FORBIDDEN', ['You can only delete users from your own organization']));
      }
    }

    // Prevent non-SUPER_ADMIN from deleting SUPER_ADMIN users
    if (user.role === 'SUPER_ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
      return next(fromCode('FORBIDDEN', ['You cannot delete SUPER_ADMIN users']));
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
      attributes: ['id', 'username', 'name', 'email', 'phone_number', 'role', 'organization_id', 'is_blocked', 'blocked_reason', 'blocked_at', 'createdon', 'updatedon'],
    });

    if (!user) {
      return next(fromCode('NOT_FOUND', [`User with id ${id} not found`]));
    }

    // Prevent non-SUPER_ADMIN from accessing users from other organizations
    if (req.user?.role !== 'SUPER_ADMIN') {
      if (!req.user?.organization_id || user.organization_id !== req.user.organization_id) {
        return next(fromCode('FORBIDDEN', ['You can only view users from your own organization']));
      }
    }

    const permissions = await getUserPermissions(user.id, user.organization_id);
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

