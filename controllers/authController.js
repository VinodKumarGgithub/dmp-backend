const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { AdminUser } = require('../models/AdminUser');
const { fromCode } = require('../utils/errors');

async function login(req, res, next) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return next(fromCode("INVALID_CREDS"));
    }

    const user = await AdminUser.findOne({ where: { username } });
    if (!user) {
      return next(fromCode("INVALID_CREDS"));
    }

    // Check if user is blocked before password verification
    if (user.is_blocked) {
      return next(fromCode('USER_BLOCKED', [
        user.blocked_reason || 'Your account has been blocked. Please contact an administrator.'
      ]));
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return next(fromCode("INVALID_CREDS"));;
    }

    const token = jwt.sign(
      { 
        username: user.username, 
        role: user.role, 
        userId: user.id,
        organization_id: user.organization_id,
        name: user.name,
        email: user.email,
        phone_number: user.phone_number,
        profile_picture: user.profile_picture
      },
      process.env.JWT_SECRET || 'changeme',
      { expiresIn: '12h' }
    );

    return res.json({ success: true, data: { token } });
  } catch (err) {
    next(err);
  }
}

module.exports = { login };


