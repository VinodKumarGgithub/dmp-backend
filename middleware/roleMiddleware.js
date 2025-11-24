const { fromCode } = require('../utils/errors');

/**
 * Middleware to require ADMIN or DEVELOPER role
 * Allows both admins and developers to access page creation features
 */
async function requireAdminOrDeveloper(req, res, next) {
  try {
    if (!req.user) {
      return next(fromCode('FORBIDDEN'));
    }

    const allowedRoles = ['ADMIN', 'DEVELOPER'];
    if (!allowedRoles.includes(req.user.role)) {
      return next(fromCode('FORBIDDEN', ['This action requires ADMIN or DEVELOPER role']));
    }

    next();
  } catch (err) {
    return next(fromCode('AUTHFAILED'));
  }
}

/**
 * Middleware to require only ADMIN role
 * For admin-only features like user management, tenant management
 */
async function requireAdmin(req, res, next) {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return next(fromCode('FORBIDDEN', ['This action requires ADMIN role']));
    }

    // optional: verify user still exists in DB
    const { AdminUser } = require('../models/AdminUser');
    const admin = await AdminUser.findOne({ where: { username: req.user.username } });
    if (!admin) {
      return next(fromCode('FORBIDDEN'));
    }

    next();
  } catch (err) {
    return next(fromCode('AUTHFAILED'));
  }
}

module.exports = { requireAdminOrDeveloper, requireAdmin };

