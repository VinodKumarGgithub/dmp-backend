const { UserPagePreference } = require('../models/UserPagePreference');
const { fromCode } = require('../utils/errors');

function normalizeColumns(columns) {
  if (!Array.isArray(columns)) return [];
  return columns
    .filter(Boolean)
    .map((col) => {
      if (typeof col === 'string') {
        return { name: col, visible: true };
      }
      return {
        name: col.name,
        visible: col.visible !== undefined ? Boolean(col.visible) : true,
      };
    })
    .filter((col) => col.name);
}

async function getUserPagePreference(userId, pageKey) {
  if (!userId || !pageKey) return null;
  const pref = await UserPagePreference.findOne({
    where: { user_id: userId, page_key: pageKey },
  });
  if (!pref) return null;
  return {
    tableColumns: pref.table_columns_json ? JSON.parse(pref.table_columns_json) : [],
    downloadColumns: pref.download_columns_json ? JSON.parse(pref.download_columns_json) : [],
  };
}

async function saveUserPagePreference(userId, pageKey, payload = {}) {
  if (!userId || !pageKey) {
    throw fromCode('VALIDATION_ERROR', ['User and page key are required']);
  }
  const tableColumns = normalizeColumns(payload.tableColumns);
  const downloadColumns = normalizeColumns(payload.downloadColumns);

  const [pref] = await UserPagePreference.findOrCreate({
    where: { user_id: userId, page_key: pageKey },
    defaults: {
      table_columns_json: JSON.stringify(tableColumns),
      download_columns_json: JSON.stringify(downloadColumns),
    },
  });

  if (!pref.isNewRecord) {
    pref.table_columns_json = JSON.stringify(tableColumns);
    pref.download_columns_json = JSON.stringify(downloadColumns);
    pref.updated_at = new Date();
    await pref.save();
  }

  return {
    tableColumns,
    downloadColumns,
  };
}

module.exports = {
  getUserPagePreference,
  saveUserPagePreference,
};

