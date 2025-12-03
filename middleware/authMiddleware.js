const jwt = require('jsonwebtoken');
const { AdminUser } = require('../models/AdminUser');
const { fromCode } = require('../utils/errors');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(fromCode('UNAUTHORIZED'));
  try {
    // Security: JWT_SECRET must be set in production
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || jwtSecret === 'changeme') {
      if (process.env.NODE_ENV === 'production') {
        return next(fromCode('INTERNAL_ERROR', [
          'Authentication service is not properly configured. Please contact your system administrator.'
        ]));
      }
      // Allow 'changeme' only in development
      console.warn('⚠️  WARNING: Using default authentication secret. This is insecure and should only be used in development.');
    }
    const payload = jwt.verify(token, jwtSecret || 'changeme');
    
    // Fetch user from DB to verify status and get latest role/organization
    const user = await AdminUser.findOne({ where: { username: payload.username } });
    if (!user) {
      return next(fromCode('UNAUTHORIZED'));
    }
    
    if (user.is_blocked) {
      return next(fromCode('USER_BLOCKED', [
        user.blocked_reason || 'Your account has been blocked. Please contact an administrator.'
      ]));
    }
    
    // Use role and organization_id from DB (not token) - ensures immediate effect of changes
    req.user = {
      ...payload,
      userId: user.id,
      role: user.role,  // From DB, not token - role changes take effect immediately
      organization_id: user.organization_id,  // From DB, not token
      name: user.name,
      email: user.email,
      phone_number: user.phone_number,
      profile_picture: user.profile_picture
    };
    next();
  } catch (e) {
    return next(fromCode('INVALIDTOKEN'));
  }
}

// requireAdmin is now in roleMiddleware.js to avoid circular dependencies
// This file only exports authMiddleware

module.exports = { authMiddleware };


