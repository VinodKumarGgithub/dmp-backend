const { success } = require('../utils/responseHandler');
const { pageService } = require('../services/pageService');
const { pageConfigService } = require('../services/pageConfigService');
const { dbMetadataService } = require('../services/dbMetadataService');
const { masterSequelize } = require('../config/db');
const { fromCode } = require('../utils/errors');
const { assertUserHasPageAccess, getAllowedPageKeys } = require('../services/userPermissionService');
const { PageConfig } = require('../models/PageConfig');

module.exports = {
  // GET /api/pages
  async listPages(req, res, next) {
    try {
      const organizationId = req.db?.organizationId;
      const allowedPageKeys = await getAllowedPageKeys(req.user, organizationId);
      const tenantId = req.db?.tenantId; // From tenantResolver middleware
      const pages = await pageService.listPages(allowedPageKeys, tenantId, req.user?.role, organizationId, req.user?.organization_id);
      res.json(success(pages, 'Pages fetched successfully'));
    } catch (err) {
      next(err);
    }
  },

  // POST /api/pages (create page config)
  async createPageConfig(req, res, next) {
    try {
      // Prevent non-SUPER_ADMIN from creating pages for other organizations
      if (req.user?.role !== 'SUPER_ADMIN') {
        if (!req.user?.organization_id) {
          return next(fromCode('FORBIDDEN', ['Organization ID is required']));
        }
        // Auto-set organization_id for non-SUPER_ADMIN users
        req.body.organization_id = req.user.organization_id;
      }
      // SUPER_ADMIN can leave organization_id as null (global pages) or specify it
      
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
      
      // First get the page to check organization
      const existingPage = await PageConfig.findOne({
        where: { page_key: pageKey },
        attributes: ['organization_id']
      });

      if (!existingPage) {
        return next(fromCode('PAGE_NOT_FOUND', [`Page config not found for key: ${pageKey}`]));
      }

      // Prevent non-SUPER_ADMIN from updating pages from other organizations
      if (req.user?.role !== 'SUPER_ADMIN') {
        if (!req.user?.organization_id || existingPage.organization_id !== req.user.organization_id) {
          return next(fromCode('FORBIDDEN', ['You can only update pages from your own organization']));
        }
        // Prevent non-SUPER_ADMIN from changing organization_id
        delete req.body.organization_id;
      }
      // SUPER_ADMIN can update any page and change organization_id
      
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
      
      // First get the page to check organization
      const page = await PageConfig.findOne({
        where: { page_key: pageKey },
        attributes: ['organization_id']
      });

      if (!page) {
        return next(fromCode('PAGE_NOT_FOUND', [`Page config not found for key: ${pageKey}`]));
      }

      // Prevent non-SUPER_ADMIN from deleting pages from other organizations
      if (req.user?.role !== 'SUPER_ADMIN') {
        if (!req.user?.organization_id || page.organization_id !== req.user.organization_id) {
          return next(fromCode('FORBIDDEN', ['You can only delete pages from your own organization']));
        }
      }
      // SUPER_ADMIN can delete any page
      
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
      const tenantId = req.db?.tenantId; // May be null for admin operations
      const organizationId = req.db?.organizationId;
      const config = await pageService.getPageConfigByKey(pageKey, tenantId, req.user?.role, organizationId, req.user?.organization_id);
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
      const organizationId = req.db?.organizationId;
      const config = await pageService.getPageConfigByKey(pageKey, req.db?.tenantId, req.user?.role, organizationId, req.user?.organization_id);
      await assertUserHasPageAccess(req.user, req.db?.tenantId, config.page_key, organizationId);
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
      const organizationId = req.db?.organizationId;
      const config = await pageService.getPageConfigByKey(pageKey, req.db?.tenantId, req.user?.role, organizationId, req.user?.organization_id);
      await assertUserHasPageAccess(req.user, req.db?.tenantId, config.page_key, organizationId);
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
      const organizationId = req.db?.organizationId;
      const config = await pageService.getPageConfigByKey(pageKey, req.db?.tenantId, req.user?.role, organizationId, req.user?.organization_id);
      if (!config.is_download_allowed) {
        return next(fromCode('PAGE_DOWNLOAD_NOT_ALLOWED'));
      }
      await assertUserHasPageAccess(req.user, req.db?.tenantId, config.page_key, organizationId);

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

  // POST /api/pages/:pageKey/detect-columns-enhanced (for CUSTOM_QUERY with metadata analysis)
  async detectColumnsEnhanced(req, res, next) {
    try {
      if (!req.db || !req.db.sequelize) {
        return next(fromCode('TENANT_DB_NOT_AVAILABLE'));
      }

      const { custom_query } = req.body || {};
      const trimmedSql = typeof custom_query === 'string' ? custom_query.trim() : '';

      if (!trimmedSql) {
        return next(fromCode('PAGE_CONFIG_INVALID', ['custom_query is required']));
      }

      const result = await pageService.detectColumnsWithMetadata(trimmedSql, req.db.sequelize);
      res.json(success(result, 'Columns and recommendations detected successfully'));
    } catch (err) {
      next(err);
    }
  },

  // POST /api/pages/:pageKey/test-query (test p_sql or custom_query)
  async testQuery(req, res, next) {
    try {
      const { pageKey } = req.params;
      const { p_sql, custom_query, queryParams = {} } = req.body;

      // Support both p_sql (PROCEDURE) and custom_query (CUSTOM_QUERY)
      const sqlValue = custom_query || p_sql;
      const sourceType = custom_query ? 'CUSTOM_QUERY' : 'PROCEDURE';

      if (!sqlValue || typeof sqlValue !== 'string' || !sqlValue.trim()) {
        return next(fromCode('VALIDATION_ERROR', [custom_query ? 'custom_query is required' : 'p_sql is required']));
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
          const organizationId = req.db?.organizationId;
          config = await pageService.getPageConfigByKey(pageKey, req.db?.tenantId, req.user?.role, organizationId, req.user?.organization_id);
        } else {
          throw fromCode('PAGE_NOT_FOUND', ['Page config not found']);
        }
      } catch (error) {
        // Create minimal config for testing
        config = {
          page_key: pageKey || 'test',
          source_type: sourceType,
          source_params: sourceType === 'CUSTOM_QUERY' 
            ? [{ name: 'custom_query', value: custom_query }]
            : [{ name: 'p_sql', value: p_sql }],
          columns: [],
          searchable_fields: [],
          filterable_fields: [],
          default_sort: null,
          page_size_default: 20,
          is_download_allowed: false,
          download_row_limit: null,
          data_source: sourceType === 'CUSTOM_QUERY' ? null : 'test'
        };
      }
      
      // Update source_params with the SQL being tested
      if (!config.source_params || !Array.isArray(config.source_params)) {
        config.source_params = [];
      }
      
      if (sourceType === 'CUSTOM_QUERY') {
        const customQueryIndex = config.source_params.findIndex(p => p && p.name === 'custom_query');
        if (customQueryIndex >= 0) {
          config.source_params[customQueryIndex].value = custom_query;
        } else {
          config.source_params.push({ name: 'custom_query', value: custom_query });
        }
      } else {
      const pSqlIndex = config.source_params.findIndex(p => p && p.name === 'p_sql');
      if (pSqlIndex >= 0) {
        config.source_params[pSqlIndex].value = p_sql;
      } else {
        config.source_params.push({ name: 'p_sql', value: p_sql });
        }
      }

      // Validate SQL
      const { validateProcedureSql } = require('../utils/sqlSecurity');
      const username = req.user?.username || null;
      try {
        await validateProcedureSql(sqlValue, {
          checkReadOnly: true,
          checkComplexity: true,
          maxTimeout: 30000,
          username: username,
          sourceType: sourceType
        });
      } catch (validationError) {
        return next(validationError);
      }

      // Build and execute query
      const startTime = Date.now();
      let executionTime = 0;
      let rowCount = 0;
      let error = null;
      let previewSql = '';
      let data = [];

      try {
        let queryResult;
        
        if (sourceType === 'CUSTOM_QUERY') {
          // For testing, force pageSize to 1 and page to 1
          const testQueryParams = {
            ...queryParams,
            pageSize: 1,
            page: 1
          };
          
          // Use buildCustomQuery for CUSTOM_QUERY with forced LIMIT 1 for testing
          queryResult = await pageService.buildCustomQuery(
            config,
            testQueryParams,
            req.db.sequelize
          );
          previewSql = queryResult.sql;
          
          // Execute the query (buildCustomQuery already applied LIMIT 1 via testQueryParams)
          const result = await req.db.sequelize.query(queryResult.sql, {
            replacements: queryResult.replacements,
            type: req.db.sequelize.QueryTypes.SELECT,
            timeout: 30000
          });
          data = Array.isArray(result) ? result : [];
        } else {
          // Existing PROCEDURE logic
        const procedureQuery = await pageService.buildProcedureSql(
          config,
          queryParams,
          req.db.sequelize,
          { pagination: true, limitOverride: 1 },
          p_sql
        );
        previewSql = procedureQuery.sql;
        const result = await req.db.sequelize.query(procedureQuery.sql, {
          replacements: procedureQuery.replacements,
          type: req.db.sequelize.QueryTypes.SELECT,
          timeout: 30000
        });
          data = Array.isArray(result) ? result : [];
        }

        executionTime = Date.now() - startTime;
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


