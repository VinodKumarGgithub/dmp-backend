const { Joi, validate } = require('../utils/validationUtils');
const { generateId } = require('../utils/idGenerator');
const { fromCode } = require('../utils/errors');
const { mapDbError } = require('../utils/dbErrorMapper');
const { PageConfig } = require('../models/PageConfig');
const { validateProcedureSql } = require('../utils/sqlSecurity');

const pageConfigService = {
  // Create new page config
  async createPageConfig(masterDb, payload, user = null) {
    const schema = Joi.object({
      page_key: Joi.string().optional().min(1).max(100).pattern(/^[a-zA-Z0-9_-]+$/),
      organization_id: Joi.string().allow(null, '').optional(),
      title: Joi.string().required().min(1).max(200),
      data_source: Joi.string().required().min(1).max(100).pattern(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
      source_type: Joi.string().valid('TABLE', 'VIEW', 'PROCEDURE').default('TABLE'),
      source_params: Joi.array()
        .items(
          Joi.object({
            name: Joi.string().required(),
            value: Joi.alternatives().try(Joi.string(), Joi.number(), Joi.boolean()).allow(null, ''),
            type: Joi.string().valid('string', 'number', 'boolean', 'date').optional(),
          })
        )
        .min(0)
        .default([]),
      columns: Joi.array()
        .items(
          Joi.object({
            name: Joi.string().required(),
            label: Joi.string().required(),
            type: Joi.string().valid('string', 'number', 'date', 'boolean').optional(),
            width: Joi.number().optional(),
          })
        )
        .min(0)
        .default([]),
      searchable_fields: Joi.array().items(Joi.string()).min(0).required(),
      filterable_fields: Joi.array()
        .items(
          Joi.object({
            name: Joi.string().required(),
            label: Joi.string().required(),
            type: Joi.string().valid('text', 'tags', 'select', 'number', 'date').required(),
            options: Joi.array().items(Joi.string()).optional(),
          })
        )
        .min(0)
        .required(),
      is_download_allowed: Joi.boolean().default(false),
      download_row_limit: Joi.number().integer().min(1).max(1000000).allow(null).optional(),
      default_sort: Joi.object({
        field: Joi.string().required(),
        order: Joi.string().valid('ASC', 'DESC').default('ASC'),
      }).allow(null).optional(),
      page_size_default: Joi.number().integer().min(1).max(100).default(20),
    });

    const data = validate(schema, payload);

    // Generate page_key from title if not provided
    if (!data.page_key) {
      // Convert title to page_key: lowercase, replace spaces with underscores, remove special chars
      let generatedKey = data.title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except spaces and hyphens
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/-+/g, '-') // Replace multiple hyphens with single
        .replace(/^[-_]+|[-_]+$/g, '') // Remove leading/trailing hyphens/underscores
        .substring(0, 100); // Limit to 100 chars
      
      // Ensure it starts with a letter or number
      if (!/^[a-zA-Z0-9]/.test(generatedKey)) {
        generatedKey = 'page_' + generatedKey;
      }
      
      // If still empty, use a default
      if (!generatedKey || generatedKey.length === 0) {
        generatedKey = 'page_' + Date.now();
      }
      
      // Ensure uniqueness by checking and appending suffix if needed
      let finalKey = generatedKey;
      let suffix = 1;
      let existing = await PageConfig.findOne({
        where: { page_key: finalKey },
      });
      
      while (existing) {
        // Append suffix, but keep total length under 100 chars
        const baseKey = generatedKey.substring(0, 100 - String(suffix).length - 1);
        finalKey = `${baseKey}_${suffix}`;
        existing = await PageConfig.findOne({
          where: { page_key: finalKey },
        });
        suffix++;
        
        // Safety check to prevent infinite loop
        if (suffix > 1000) {
          finalKey = 'page_' + Date.now();
          break;
        }
      }
      
      data.page_key = finalKey;
    }

    // Validate SQL if it's a PROCEDURE type with p_sql
    if (data.source_type === 'PROCEDURE' && Array.isArray(data.source_params)) {
      const pSqlParam = data.source_params.find(p => p && p.name === 'p_sql');
      if (pSqlParam && pSqlParam.value) {
        const username = user?.username || null;
        await validateProcedureSql(pSqlParam.value, {
          checkReadOnly: true,
          checkComplexity: true,
          maxTimeout: 30000,
          username: username
        });
      }
    }

    // Check if page_key already exists (only if provided by user)
    if (payload.page_key) {
      const existing = await PageConfig.findOne({
        where: { page_key: data.page_key },
      });
      if (existing) {
        throw fromCode('DB_DUPLICATE_KEY', [`Page key '${data.page_key}' already exists`]);
      }
    }

    const id = generateId('page');
    const txn = await masterDb.transaction();

    try {
      const pageConfig = await PageConfig.create(
        {
          id,
          organization_id: data.organization_id || null,
          page_key: data.page_key,
          title: data.title,
          data_source: data.data_source,
          source_type: data.source_type || 'TABLE',
          source_params_json: data.source_params ? JSON.stringify(data.source_params) : null,
          columns_json: JSON.stringify(data.columns || []),
          searchable_fields_json: JSON.stringify(data.searchable_fields),
          filterable_fields_json: JSON.stringify(data.filterable_fields),
          is_download_allowed: data.is_download_allowed,
          download_row_limit: data.download_row_limit ?? null,
          default_sort_json: data.default_sort ? JSON.stringify(data.default_sort) : null,
          page_size_default: data.page_size_default,
        },
        { transaction: txn }
      );

      await txn.commit();
      return pageConfig;
    } catch (error) {
      await txn.rollback();
      throw mapDbError(error);
    }
  },

  // Update page config
  async updatePageConfig(masterDb, pageKey, payload, user = null) {
    const schema = Joi.object({
      title: Joi.string().min(1).max(200),
      organization_id: Joi.string().allow(null, '').optional(),
      data_source: Joi.string().min(1).max(100).pattern(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
      source_type: Joi.string().valid('TABLE', 'VIEW', 'PROCEDURE'),
      source_params: Joi.array()
        .items(
          Joi.object({
            name: Joi.string().required(),
            value: Joi.alternatives().try(Joi.string(), Joi.number(), Joi.boolean()).allow(null, ''),
            type: Joi.string().valid('string', 'number', 'boolean', 'date').optional(),
          })
        )
        .min(0),
      columns: Joi.array()
        .items(
          Joi.object({
            name: Joi.string().required(),
            label: Joi.string().required(),
            type: Joi.string().valid('string', 'number', 'date', 'boolean').optional(),
            width: Joi.number().optional(),
          })
        )
        .min(0),
      searchable_fields: Joi.array().items(Joi.string()).min(0),
      filterable_fields: Joi.array()
        .items(
          Joi.object({
            name: Joi.string().required(),
            label: Joi.string().required(),
            type: Joi.string().valid('text', 'tags', 'select', 'number', 'date').required(),
            options: Joi.array().items(Joi.string()).optional(),
          })
        )
        .min(0),
      is_download_allowed: Joi.boolean(),
      download_row_limit: Joi.number().integer().min(1).max(1000000).allow(null),
      default_sort: Joi.object({
        field: Joi.string().required(),
        order: Joi.string().valid('ASC', 'DESC').default('ASC'),
      }).allow(null),
      page_size_default: Joi.number().integer().min(1).max(100),
    });

    const data = validate(schema, payload);

    // Validate SQL if updating to PROCEDURE type with p_sql
    if (data.source_type === 'PROCEDURE' && Array.isArray(data.source_params)) {
      const pSqlParam = data.source_params.find(p => p && p.name === 'p_sql');
      if (pSqlParam && pSqlParam.value) {
        const username = user?.username || null;
        await validateProcedureSql(pSqlParam.value, {
          checkReadOnly: true,
          checkComplexity: true,
          maxTimeout: 30000,
          username: username
        });
      }
    }

    const txn = await masterDb.transaction();

    try {
      const pageConfig = await PageConfig.findOne({
        where: { page_key: pageKey },
      });

      if (!pageConfig) {
        throw fromCode('PAGE_NOT_FOUND', [`Page config not found for key: ${pageKey}`]);
      }

      const updateData = {};
      if (data.title !== undefined) updateData.title = data.title;
      if (data.organization_id !== undefined) updateData.organization_id = data.organization_id || null;
      if (data.data_source !== undefined) updateData.data_source = data.data_source;
      if (data.source_type !== undefined) updateData.source_type = data.source_type;
      if (data.source_params !== undefined) updateData.source_params_json = data.source_params ? JSON.stringify(data.source_params) : null;
      if (data.columns !== undefined) updateData.columns_json = JSON.stringify(data.columns || []);
      if (data.searchable_fields !== undefined)
        updateData.searchable_fields_json = JSON.stringify(data.searchable_fields);
      if (data.filterable_fields !== undefined)
        updateData.filterable_fields_json = JSON.stringify(data.filterable_fields);
      if (data.is_download_allowed !== undefined) updateData.is_download_allowed = data.is_download_allowed;
      if (data.download_row_limit !== undefined) updateData.download_row_limit = data.download_row_limit ?? null;
      if (data.default_sort !== undefined)
        updateData.default_sort_json = data.default_sort ? JSON.stringify(data.default_sort) : null;
      if (data.page_size_default !== undefined) updateData.page_size_default = data.page_size_default;

      await pageConfig.update(updateData, { transaction: txn });
      await txn.commit();
      return pageConfig;
    } catch (error) {
      await txn.rollback();
      if (error.code) throw error;
      throw mapDbError(error);
    }
  },

  // Delete page config
  async deletePageConfig(masterDb, pageKey) {
    const txn = await masterDb.transaction();

    try {
      const pageConfig = await PageConfig.findOne({
        where: { page_key: pageKey },
      });

      if (!pageConfig) {
        throw fromCode('PAGE_NOT_FOUND', [`Page config not found for key: ${pageKey}`]);
      }

      await pageConfig.destroy({ transaction: txn });
      await txn.commit();
      return { message: 'Page config deleted successfully' };
    } catch (error) {
      await txn.rollback();
      if (error.code) throw error;
      throw mapDbError(error);
    }
  },
};

module.exports = { pageConfigService };

