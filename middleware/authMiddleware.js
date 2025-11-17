const jwt = require('jsonwebtoken');
const { AdminUser } = require('../models/AdminUser');
const { fromCode } = require('../utils/errors');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(fromCode('UNAUTHORIZED'));
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'changeme');
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


