const { success } = require('../utils/responseHandler');
const { pageService } = require('../services/pageService');
const { pageConfigService } = require('../services/pageConfigService');
const { masterSequelize } = require('../config/db');
const { fromCode } = require('../utils/errors');

module.exports = {
  // GET /api/pages
  async listPages(req, res, next) {
    try {
      const pages = await pageService.listPages();
      res.json(success(pages, 'Pages fetched successfully'));
    } catch (err) {
      next(err);
    }
  },

  // POST /api/pages (create page config)
  async createPageConfig(req, res, next) {
    try {
      const pageConfig = await pageConfigService.createPageConfig(masterSequelize, req.body);
      res.status(201).json(success(pageConfig, 'Page config created successfully'));
    } catch (err) {
      next(err);
    }
  },

  // PUT /api/pages/:pageKey (update page config)
  async updatePageConfig(req, res, next) {
    try {
      const { pageKey } = req.params;
      const pageConfig = await pageConfigService.updatePageConfig(masterSequelize, pageKey, req.body);
      res.json(success(pageConfig, 'Page config updated successfully'));
    } catch (err) {
      next(err);
    }
  },

  // DELETE /api/pages/:pageKey (delete page config)
  async deletePageConfig(req, res, next) {
    try {
      const { pageKey } = req.params;
      const result = await pageConfigService.deletePageConfig(masterSequelize, pageKey);
      res.json(success(result, 'Page config deleted successfully'));
    } catch (err) {
      next(err);
    }
  },

  // GET /api/pages/:pageKey/config (master only)
  async getPageConfig(req, res, next) {
    try {
      const { pageKey } = req.params;
      const config = await pageService.getPageConfigByKey(pageKey);
      res.json(success(config, 'Page config fetched successfully'));
    } catch (err) {
      next(err);
    }
  },

  // GET /api/pages/:pageKey/data (needs tenant DB)
  async getPageData(req, res, next) {
    try {
      const { pageKey } = req.params;
      if (!req.db || !req.db.sequelize) {
        return next(fromCode('TENANT_DB_NOT_AVAILABLE'));
      }
      const config = await pageService.getPageConfigByKey(pageKey);
      // Pass req.db directly to use tenant database connection
      const { data, total } = await pageService.getPageData(config, req.query, req.db);
      res.json(success({ data, total }, 'Page data fetched successfully'));
    } catch (err) {
      next(err);
    }
  },

  // GET /api/pages/:pageKey (config + data combined)
  async getPageConfigAndData(req, res, next) {
    try {
      const { pageKey } = req.params;
      if (!req.db || !req.db.sequelize) {
        return next(fromCode('TENANT_DB_NOT_AVAILABLE'));
      }
      const config = await pageService.getPageConfigByKey(pageKey);
      // Pass req.db directly to use tenant database connection
      const { data, total } = await pageService.getPageData(config, req.query, req.db);

      res.json(success({ config, data, total }, 'Page config and data fetched successfully'));
    } catch (err) {
      next(err);
    }
  },

  // GET /api/pages/:pageKey/download (JSON data for frontend to convert to CSV)
  async downloadPageData(req, res, next) {
    try {
      const { pageKey } = req.params;
      if (!req.db || !req.db.sequelize) {
        return next(fromCode('TENANT_DB_NOT_AVAILABLE'));
      }
      const config = await pageService.getPageConfigByKey(pageKey);
      if (!config.is_download_allowed) {
        return next(fromCode('PAGE_DOWNLOAD_NOT_ALLOWED'));
      }

      // Use getAllPageData to fetch ALL data without pagination for download
      const { data } = await pageService.getAllPageData(config, req.query, req.db);

      // Check if there's data to download
      if (!Array.isArray(data) || data.length === 0) {
        return next(fromCode('PAGE_NO_DATA_TO_DOWNLOAD'));
      }

      // Send JSON data to frontend (frontend will convert to CSV)
      res.setHeader('Content-Type', 'application/json');
      res.json(success({ data }, 'Data fetched successfully for download'));
    } catch (err) {
      next(err);
    }
  }
};


