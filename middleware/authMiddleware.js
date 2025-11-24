const jwt = require('jsonwebtoken');
const { AdminUser } = require('../models/AdminUser');
const { fromCode } = require('../utils/errors');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(fromCode('UNAUTHORIZED'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'changeme');
    
    // Check if user is blocked
    const user = await AdminUser.findOne({ where: { username: payload.username } });
    if (user && user.is_blocked) {
      return next(fromCode('USER_BLOCKED', [
        user.blocked_reason || 'Your account has been blocked. Please contact an administrator.'
      ]));
    }
    
    req.user = {
      ...payload,
      userId: payload.userId || payload.id || payload.username,
    };
    next();
  } catch (e) {
    return next(fromCode('INVALIDTOKEN'));
  }
}

// requireAdmin is now in roleMiddleware.js to avoid circular dependencies
// This file only exports authMiddleware

module.exports = { authMiddleware };


