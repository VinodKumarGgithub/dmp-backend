const { success } = require('../utils/responseHandler');
const { fromCode } = require('../utils/errors');
const { getUserPagePreference, saveUserPagePreference } = require('../services/userPreferenceService');

module.exports = {
  async getPreferences(req, res, next) {
    try {
      const { pageKey } = req.params;
      if (!pageKey) {
        return next(fromCode('VALIDATION_ERROR', ['pageKey is required']));
      }
      const userId = req.user?.userId || req.user?.id;
      
      if (!userId) {
        return next(fromCode('FORBIDDEN', ['User ID is required']));
      }
      
      // For SUPER_ADMIN, use special identifier if no organization_id
      // For others, require organization_id
      let organizationId;
      if (req.user?.role === 'SUPER_ADMIN') {
        organizationId = req.db?.organizationId || req.user?.organization_id || '__SUPER_ADMIN__';
      } else {
        organizationId = req.user?.organization_id || req.db?.organizationId;
        if (!organizationId) {
          return next(fromCode('FORBIDDEN', ['Organization ID is required']));
        }
      }

      // Validate organization access for non-SUPER_ADMIN
      if (req.user?.role !== 'SUPER_ADMIN' && req.user?.organization_id && req.user?.organization_id !== organizationId) {
        return next(fromCode('FORBIDDEN', ['You can only access preferences for your own organization']));
      }
      
      const prefs = await getUserPagePreference(userId, pageKey, organizationId);
      res.json(success(prefs || { tableColumns: [], downloadColumns: [] }, 'Preferences fetched successfully'));
    } catch (err) {
      next(err);
    }
  },

  async savePreferences(req, res, next) {
    try {
      const { pageKey } = req.params;
      if (!pageKey) {
        return next(fromCode('VALIDATION_ERROR', ['pageKey is required']));
      }
      const userId = req.user?.userId || req.user?.id;
      
      if (!userId) {
        return next(fromCode('FORBIDDEN', ['User ID is required']));
      }
      
      // For SUPER_ADMIN, use special identifier if no organization_id
      // For others, require organization_id
      let organizationId;
      if (req.user?.role === 'SUPER_ADMIN') {
        organizationId = req.db?.organizationId || req.user?.organization_id || '__SUPER_ADMIN__';
      } else {
        organizationId = req.user?.organization_id || req.db?.organizationId;
        if (!organizationId) {
          return next(fromCode('FORBIDDEN', ['Organization ID is required']));
        }
      }

      // Validate organization access for non-SUPER_ADMIN
      if (req.user?.role !== 'SUPER_ADMIN' && req.user?.organization_id && req.user?.organization_id !== organizationId) {
        return next(fromCode('FORBIDDEN', ['You can only save preferences for your own organization']));
      }
      
      const prefs = await saveUserPagePreference(userId, pageKey, req.body || {}, organizationId);
      res.json(success(prefs, 'Preferences saved successfully'));
    } catch (err) {
      next(err);
    }
  },
};

