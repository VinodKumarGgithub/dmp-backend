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

async function requireAdmin(req, res, next) {
  try {
    if (!req.user || req.user.role !== 'ADMIN') return next(fromCode('FORBIDDEN'));

    // optional: verify user still exists in DB
    const admin = await AdminUser.findOne({ where: { username: req.user.username } });
    if (!admin) return next(fromCode('FORBIDDEN'));

    next();
  } catch (err) {
    return next(fromCode('AUTHFAILED'));
  }
}

module.exports = { authMiddleware, requireAdmin };


