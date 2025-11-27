const { fromCode } = require('../utils/errors');

/**
 * Check if user is SUPER_ADMIN (can access all organizations)
 */
function isSuperAdmin(user) {
  return user && user.role === 'SUPER_ADMIN';
}

/**
 * Check if user can access an organization
 */
function canAccessOrganization(user, organizationId) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;  // SUPER_ADMIN can access all
  if (!organizationId) return false;
  return !user.organization_id || user.organization_id === organizationId;
}

/**
 * Middleware to require ADMIN or DEVELOPER role
 * Allows both admins and developers to access page creation features
 */
async function requireAdminOrDeveloper(req, res, next) {
  try {
    if (!req.user) {
      return next(fromCode('FORBIDDEN'));
    }

    const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'DEVELOPER'];
    if (!allowedRoles.includes(req.user.role)) {
      return next(fromCode('FORBIDDEN', ['This action requires ADMIN or DEVELOPER role']));
    }

    next();
  } catch (err) {
    return next(fromCode('AUTHFAILED'));
  }
}

/**
 * Middleware to require only ADMIN or SUPER_ADMIN role
 * For admin-only features like user management, tenant management
 */
async function requireAdmin(req, res, next) {
  try {
    if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN')) {
      return next(fromCode('FORBIDDEN', ['This action requires ADMIN or SUPER_ADMIN role']));
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

module.exports = { 
  requireAdminOrDeveloper, 
  requireAdmin,
  isSuperAdmin,
  canAccessOrganization
};

