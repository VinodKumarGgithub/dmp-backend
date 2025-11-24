const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { AdminUser } = require('../models/AdminUser');
const { UserPreference } = require('../models/UserPreference');
const { fromCode } = require('../utils/errors');
const { mapDbError } = require('../utils/dbErrorMapper');
const { success } = require('../utils/responseHandler');
const { Joi, validate } = require('../utils/validationUtils');

// Get current user's profile
async function getCurrentProfile(req, res, next) {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return next(fromCode('UNAUTHORIZED', ['User ID not found in token']));
    }

    const user = await AdminUser.findByPk(userId, {
      attributes: ['id', 'username', 'name', 'email', 'phone_number', 'role', 'createdon', 'updatedon'],
    });

    if (!user) {
      return next(fromCode('NOT_FOUND', ['User not found']));
    }

    res.json(success(user.toJSON(), 'Profile fetched successfully'));
  } catch (err) {
    if (err.code) return next(err);
    next(mapDbError(err));
  }
}

// Update current user's profile
async function updateProfile(req, res, next) {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return next(fromCode('UNAUTHORIZED', ['User ID not found in token']));
    }

    const schema = Joi.object({
      name: Joi.string().allow('', null).max(100).optional(),
      email: Joi.string().email().allow('', null).max(255).optional(),
      phone_number: Joi.string().allow('', null).max(20).optional(),
    });

    const data = validate(schema, req.body);

    const user = await AdminUser.findByPk(userId);
    if (!user) {
      return next(fromCode('NOT_FOUND', ['User not found']));
    }

    // Check email uniqueness if email is being updated
    if (data.email !== undefined && data.email !== null && data.email !== '') {
      const existingUser = await AdminUser.findOne({
        where: {
          email: data.email,
          id: { [Op.ne]: userId },
        },
      });
      if (existingUser) {
        return next(fromCode('DB_DUPLICATE_KEY', [`Email '${data.email}' is already in use`]));
      }
    }

    // Update fields if provided
    if (data.name !== undefined) {
      user.name = data.name || null;
    }
    if (data.email !== undefined) {
      user.email = data.email || null;
    }
    if (data.phone_number !== undefined) {
      user.phone_number = data.phone_number || null;
    }

    // Update updatedon timestamp
    user.updatedon = new Date();
    await user.save();

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
    };

    res.json(success(userResponse, 'Profile updated successfully'));
  } catch (err) {
    if (err.code) return next(err);
    next(mapDbError(err));
  }
}

// Change password
async function changePassword(req, res, next) {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return next(fromCode('UNAUTHORIZED', ['User ID not found in token']));
    }

    const schema = Joi.object({
      oldPassword: Joi.string().required(),
      newPassword: Joi.string().required().min(6).max(100),
    });

    const data = validate(schema, req.body);

    const user = await AdminUser.findByPk(userId);
    if (!user) {
      return next(fromCode('NOT_FOUND', ['User not found']));
    }

    // Verify old password
    const isOldPasswordValid = await bcrypt.compare(data.oldPassword, user.password_hash);
    if (!isOldPasswordValid) {
      return next(fromCode('INVALID_CREDS', ['Current password is incorrect']));
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(data.newPassword, 10);
    user.password_hash = passwordHash;
    user.updatedon = new Date();
    await user.save();

    res.json(success({ message: 'Password changed successfully' }, 'Password changed successfully'));
  } catch (err) {
    if (err.code) return next(err);
    next(mapDbError(err));
  }
}

// Get user preferences
async function getPreferences(req, res, next) {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return next(fromCode('UNAUTHORIZED', ['User ID not found in token']));
    }

    const preference = await UserPreference.findOne({
      where: { user_id: userId },
    });

    // Return defaults if no preferences exist
    const defaultPreferences = {
      theme: 'light',
      language: 'en',
      fontFamily: 'Inter',
    };

    if (!preference || !preference.preferences_json) {
      return res.json(success(defaultPreferences, 'Preferences fetched successfully'));
    }

    try {
      const preferences = JSON.parse(preference.preferences_json);
      // Merge with defaults to ensure all fields exist
      const mergedPreferences = { ...defaultPreferences, ...preferences };
      res.json(success(mergedPreferences, 'Preferences fetched successfully'));
    } catch (parseError) {
      // If JSON is invalid, return defaults
      res.json(success(defaultPreferences, 'Preferences fetched successfully'));
    }
  } catch (err) {
    if (err.code) return next(err);
    next(mapDbError(err));
  }
}

// Update user preferences
async function updatePreferences(req, res, next) {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return next(fromCode('UNAUTHORIZED', ['User ID not found in token']));
    }

    const schema = Joi.object({
      theme: Joi.string().valid('light', 'dark').optional(),
      language: Joi.string().max(10).optional(),
      fontFamily: Joi.string().max(100).optional(),
    }).unknown(true); // Allow additional fields for future extensibility

    const data = validate(schema, req.body);

    // Ensure required fields have defaults
    const preferences = {
      theme: data.theme || 'light',
      language: data.language || 'en',
      fontFamily: data.fontFamily || 'Inter',
      ...data, // Include any additional fields
    };

    const [preference] = await UserPreference.findOrCreate({
      where: { user_id: userId },
      defaults: {
        preferences_json: JSON.stringify(preferences),
        createdon: new Date(),
        updatedon: new Date(),
      },
    });

    if (!preference.isNewRecord) {
      preference.preferences_json = JSON.stringify(preferences);
      preference.updatedon = new Date();
      await preference.save();
    }

    res.json(success(preferences, 'Preferences updated successfully'));
  } catch (err) {
    if (err.code) return next(err);
    next(mapDbError(err));
  }
}

module.exports = {
  getCurrentProfile,
  updateProfile,
  changePassword,
  getPreferences,
  updatePreferences,
};

