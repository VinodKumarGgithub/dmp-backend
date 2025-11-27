const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { AdminUser } = require('../models/AdminUser');
const { fromCode } = require('../utils/errors');
const { getOrganizationById } = require('../services/organizationService');

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
      return next(fromCode("INVALID_CREDS"));
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

    // Check if client already has branding (to avoid redundancy)
    const clientHasBranding = req.headers['x-has-branding'] === 'true';
    
    const responseData = { token };
    
    // Only include branding if client doesn't have it and user has organization_id
    // Wrap in try-catch to ensure login NEVER fails due to branding issues
    // Branding is optional - login should work even if organizations table doesn't exist
    if (!clientHasBranding && user.organization_id) {
      // Use a separate try-catch to ensure any error is completely isolated
      try {
        // Check if getOrganizationById function exists (defensive)
        if (typeof getOrganizationById === 'function') {
          // Single DB call - service already handles masking and filtering
          // Branding already includes masked_org_id and excludes 'id'
          const branding = await Promise.resolve(getOrganizationById(user.organization_id, false)).catch(() => null);
          if (branding) {
            responseData.branding = branding;
          }
        }
      } catch (err) {
        // Fail silently - branding not available
        // This is expected if:
        // 1. Organizations table doesn't exist yet (run migration)
        // 2. Organization record doesn't exist for this organization_id (run migrate:organizations script)
        // 3. Database connection issue
        // 4. Organization model not initialized
        // Login should still succeed even if branding is unavailable
        // Log error details for debugging
        const errorMessage = err?.message || err?.toString() || 'Unknown error';
        if (process.env.NODE_ENV === 'development') {
          console.log(`⚠️  Branding not available for organization_id: ${user.organization_id}`);
          console.log(`   Error:`, errorMessage);
          if (err?.stack) {
            console.log(`   Stack:`, err.stack);
          }
        }
        // Don't throw - allow login to proceed without branding
        // The error is caught and logged, but login continues successfully
      }
    }

    return res.json({ success: true, data: responseData });
  } catch (err) {
    next(err);
  }
}

module.exports = { login };


