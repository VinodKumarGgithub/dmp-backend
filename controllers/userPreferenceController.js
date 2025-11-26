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
      const organizationId = req.db?.organizationId;
      if (!userId || !organizationId) {
        return next(fromCode('FORBIDDEN'));
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
      const organizationId = req.db?.organizationId;
      if (!userId || !organizationId) {
        return next(fromCode('FORBIDDEN'));
      }
      const prefs = await saveUserPagePreference(userId, pageKey, req.body || {}, organizationId);
      res.json(success(prefs, 'Preferences saved successfully'));
    } catch (err) {
      next(err);
    }
  },
};

