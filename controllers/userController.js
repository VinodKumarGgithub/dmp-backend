const bcrypt = require('bcryptjs');
const { AdminUser } = require('../models/AdminUser');
const { fromCode } = require('../utils/errors');
const { mapDbError } = require('../utils/dbErrorMapper');
const { success } = require('../utils/responseHandler');
const { Joi, validate } = require('../utils/validationUtils');

// List all admin users
async function listUsers(req, res, next) {
  try {
    const users = await AdminUser.findAll({
      attributes: ['id', 'username', 'role', 'created_at', 'updated_at'],
      order: [['created_at', 'DESC']],
    });
    res.json(success(users, 'Users fetched successfully'));
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
      role: Joi.string().valid('ADMIN', 'MANAGER', 'USER').default('USER'),
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

    // Return user without password hash
    const userResponse = {
      id: user.id,
      username: user.username,
      role: user.role,
      created_at: user.created_at,
      updated_at: user.updated_at,
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
      role: Joi.string().valid('ADMIN', 'MANAGER', 'USER').optional(),
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

    // Return updated user without password hash
    const userResponse = {
      id: user.id,
      username: user.username,
      role: user.role,
      created_at: user.created_at,
      updated_at: user.updated_at,
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
      attributes: ['id', 'username', 'role', 'created_at', 'updated_at'],
    });

    if (!user) {
      return next(fromCode('NOT_FOUND', [`User with id ${id} not found`]));
    }

    res.json(success(user, 'User fetched successfully'));
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

