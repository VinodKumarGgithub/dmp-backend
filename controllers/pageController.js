const { success } = require('../utils/responseHandler');
const { pageService } = require('../services/pageService');
const { pageConfigService } = require('../services/pageConfigService');
const { dbMetadataService } = require('../services/dbMetadataService');
const { masterSequelize } = require('../config/db');
const { fromCode } = require('../utils/errors');
const { assertUserHasPageAccess, getAllowedPageKeys } = require('../services/userPermissionService');

module.exports = {
  // GET /api/pages
  async listPages(req, res, next) {
    try {
      const allowedPageKeys = await getAllowedPageKeys(req.user);
      const pages = await pageService.listPages(allowedPageKeys);
      res.json(success(pages, 'Pages fetched successfully'));
    } catch (err) {
      next(err);
    }
  },

  // POST /api/pages (create page config)
  async createPageConfig(req, res, next) {
    try {
      const pageConfig = await pageConfigService.createPageConfig(masterSequelize, req.body, req.user);
      res.status(201).json(success(pageConfig, 'Page config created successfully'));
    } catch (err) {
      next(err);
    }
  },

  // PUT /api/pages/:pageKey (update page config)
  async updatePageConfig(req, res, next) {
    try {
      const { pageKey } = req.params;
      const pageConfig = await pageConfigService.updatePageConfig(masterSequelize, pageKey, req.body, req.user);
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
      await assertUserHasPageAccess(req.user, req.db?.tenantId, config.page_key);
      // Pass req.db directly to use tenant database connection
      // Include audit context for logging
      const auditContext = {
        userId: req.user?.userId || req.user?.id || req.user?.username,
        ipAddress: req.ip || req.connection?.remoteAddress
      };
      const { data, total, hasMore, performance } = await pageService.getPageData(config, req.query, req.db, auditContext);
      res.json(success({ data, total, hasMore, performance }, 'Page data fetched successfully'));
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
      await assertUserHasPageAccess(req.user, req.db?.tenantId, config.page_key);
      // Pass req.db directly to use tenant database connection
      // Include audit context for logging
      const auditContext = {
        userId: req.user?.userId || req.user?.id || req.user?.username,
        ipAddress: req.ip || req.connection?.remoteAddress
      };
      const { data, total, hasMore, performance } = await pageService.getPageData(config, req.query, req.db, auditContext);

      res.json(success({ config, data, total, hasMore, performance }, 'Page config and data fetched successfully'));
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
      await assertUserHasPageAccess(req.user, req.db?.tenantId, config.page_key);

      // Use getAllPageData to fetch ALL data without pagination for download
      // Include audit context for logging
      const exportFormat = req.query.format || 'csv'; // csv or excel
      const auditContext = {
        userId: req.user?.userId || req.user?.id || req.user?.username,
        ipAddress: req.ip || req.connection?.remoteAddress,
        exportFormat
      };
      const { data } = await pageService.getAllPageData(config, req.query, req.db, auditContext);

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
  },

  // GET /api/pages/db/tables (needs tenant DB)
  async getTables(req, res, next) {
    try {
      if (!req.db || !req.db.sequelize) {
        return next(fromCode('TENANT_DB_NOT_AVAILABLE'));
      }
      const dataSources = await dbMetadataService.getTables(req.db.sequelize);
      res.json(success(dataSources, 'Tables, views, and procedures fetched successfully'));
    } catch (err) {
      next(err);
    }
  },

  // GET /api/pages/db/tables/:tableName/columns (needs tenant DB)
  async getTableColumns(req, res, next) {
    try {
      if (!req.db || !req.db.sequelize) {
        return next(fromCode('TENANT_DB_NOT_AVAILABLE'));
      }
      const { tableName } = req.params;
      const columns = await dbMetadataService.getTableColumns(req.db.sequelize, tableName);
      res.json(success(columns, 'Table or view columns fetched successfully'));
    } catch (err) {
      next(err);
    }
  },

  // GET /api/pages/db/tables/:tableName/indexes (needs tenant DB)
  async getTableIndexes(req, res, next) {
    try {
      if (!req.db || !req.db.sequelize) {
        return next(fromCode('TENANT_DB_NOT_AVAILABLE'));
      }
      const { tableName } = req.params;
      const indexes = await dbMetadataService.getTableIndexes(req.db.sequelize, tableName);
      res.json(success(indexes, 'Table indexes fetched successfully'));
    } catch (err) {
      next(err);
    }
  },

  // GET /api/pages/db/procedures/:procedureName/parameters (needs tenant DB)
  async getProcedureParameters(req, res, next) {
    try {
      if (!req.db || !req.db.sequelize) {
        return next(fromCode('TENANT_DB_NOT_AVAILABLE'));
      }
      const { procedureName } = req.params;
      const parameters = await dbMetadataService.getProcedureParameters(req.db.sequelize, procedureName);
      res.json(success(parameters, 'Procedure parameters fetched successfully'));
    } catch (err) {
      next(err);
    }
  },

  // POST /api/pages/:pageKey/detect-columns
  async detectColumns(req, res, next) {
    try {
      if (!req.db || !req.db.sequelize) {
        return next(fromCode('TENANT_DB_NOT_AVAILABLE'));
      }

      const { p_sql } = req.body || {};
      const trimmedSql = typeof p_sql === 'string' ? p_sql.trim() : '';

      if (!trimmedSql) {
        return next(fromCode('PAGE_CONFIG_INVALID', ['p_sql is required to detect columns']));
      }

      const result = await pageService.detectColumnsFromSql(trimmedSql, req.db.sequelize);
      res.json(success(result, 'Columns detected successfully'));
    } catch (err) {
      next(err);
    }
  },

  // POST /api/pages/:pageKey/test-query (test p_sql query)
  async testQuery(req, res, next) {
    try {
      const { pageKey } = req.params;
      const { p_sql, queryParams = {} } = req.body;

      if (!p_sql || typeof p_sql !== 'string' || !p_sql.trim()) {
        return next(fromCode('VALIDATION_ERROR', ['p_sql is required']));
      }

      if (!req.db || !req.db.sequelize) {
        return next(fromCode('TENANT_DB_NOT_AVAILABLE'));
      }

      // Get page config to use for query building
      // For testing, we allow using a temporary pageKey if the page doesn't exist yet
      let config;
      try {
        // Only try to fetch if pageKey is not 'test' or empty
        if (pageKey && pageKey !== 'test' && pageKey.trim() !== '') {
          config = await pageService.getPageConfigByKey(pageKey);
        } else {
          throw fromCode('PAGE_NOT_FOUND', ['Page config not found']);
        }
      } catch (error) {
        // If page doesn't exist or is 'test', create a minimal config for testing
        // This allows testing queries before saving the page config
        config = {
          page_key: pageKey || 'test',
          source_type: 'PROCEDURE',
          source_params: [{ name: 'p_sql', value: p_sql }],
          columns: [],
          searchable_fields: [],
          filterable_fields: [],
          default_sort: null,
          page_size_default: 20,
          is_download_allowed: false,
          download_row_limit: null,
          data_source: 'test' // Required field for buildQuery
        };
      }
      
      // Ensure source_params includes the p_sql being tested
      if (!config.source_params || !Array.isArray(config.source_params)) {
        config.source_params = [];
      }
      
      // Update or add p_sql in source_params
      const pSqlIndex = config.source_params.findIndex(p => p && p.name === 'p_sql');
      if (pSqlIndex >= 0) {
        config.source_params[pSqlIndex].value = p_sql;
      } else {
        config.source_params.push({ name: 'p_sql', value: p_sql });
      }

      // Validate SQL before building query (with user blocking on dangerous SQL)
      const { validateProcedureSql } = require('../utils/sqlSecurity');
      const username = req.user?.username || null;
      try {
        await validateProcedureSql(p_sql, {
          checkReadOnly: true,
          checkComplexity: true,
          maxTimeout: 30000,
          username: username
        });
      } catch (validationError) {
        // Re-throw validation errors (user may have been blocked)
        return next(validationError);
      }

      // Build the query with test parameters
      const startTime = Date.now();
      let executionTime = 0;
      let rowCount = 0;
      let error = null;
      let previewSql = '';
      let data = [];

      try {
        const procedureQuery = await pageService.buildProcedureSql(
          config,
          queryParams,
          req.db.sequelize,
          { pagination: true, limitOverride: 1 },
          p_sql
        );

        previewSql = procedureQuery.sql;

        // Execute with LIMIT 1 for preview
        const result = await req.db.sequelize.query(procedureQuery.sql, {
          replacements: procedureQuery.replacements,
          type: req.db.sequelize.QueryTypes.SELECT,
          timeout: 30000
        });

        executionTime = Date.now() - startTime;
        data = Array.isArray(result) ? result : [];
        rowCount = data.length;
      } catch (queryError) {
        executionTime = Date.now() - startTime;
        error = {
          message: queryError.message || String(queryError),
          code: queryError.code,
          details: queryError.details
        };
      }

      res.json(success({
        valid: !error,
        executionTime,
        rowCount,
        previewSql,
        error,
        sampleData: data.slice(0, 1) // Return first row as sample
      }, error ? 'Query validation failed' : 'Query validated successfully'));
    } catch (err) {
      next(err);
    }
  }
};


