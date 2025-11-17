const { Joi, validate } = require('../utils/validationUtils');
const { generateId } = require('../utils/idGenerator');
const { fromCode } = require('../utils/errors');
const { mapDbError } = require('../utils/dbErrorMapper');
const { PageConfig } = require('../models/PageConfig');

const pageConfigService = {
  // Create new page config
  async createPageConfig(masterDb, payload) {
    const schema = Joi.object({
      page_key: Joi.string().required().min(1).max(100).pattern(/^[a-zA-Z0-9_-]+$/),
      title: Joi.string().required().min(1).max(200),
      data_source: Joi.string().required().min(1).max(100).pattern(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
      columns: Joi.array()
        .items(
          Joi.object({
            name: Joi.string().required(),
            label: Joi.string().required(),
            type: Joi.string().valid('string', 'number', 'date', 'boolean').optional(),
            width: Joi.number().optional(),
          })
        )
        .min(1)
        .required(),
      searchable_fields: Joi.array().items(Joi.string()).min(0).required(),
      filterable_fields: Joi.array()
        .items(
          Joi.object({
            name: Joi.string().required(),
            label: Joi.string().required(),
            type: Joi.string().valid('text', 'select', 'number', 'date').required(),
            options: Joi.array().items(Joi.string()).optional(),
          })
        )
        .min(0)
        .required(),
      is_download_allowed: Joi.boolean().default(false),
      default_sort: Joi.object({
        field: Joi.string().required(),
        order: Joi.string().valid('ASC', 'DESC').default('ASC'),
      }).allow(null).optional(),
      page_size_default: Joi.number().integer().min(1).max(100).default(20),
    });

    const data = validate(schema, payload);

    // Check if page_key already exists
    const existing = await PageConfig.findOne({
      where: { page_key: data.page_key },
    });
    if (existing) {
      throw fromCode('DB_DUPLICATE_KEY', [`Page key '${data.page_key}' already exists`]);
    }

    const id = generateId('page');
    const txn = await masterDb.transaction();

    try {
      const pageConfig = await PageConfig.create(
        {
          id,
          page_key: data.page_key,
          title: data.title,
          data_source: data.data_source,
          columns_json: JSON.stringify(data.columns),
          searchable_fields_json: JSON.stringify(data.searchable_fields),
          filterable_fields_json: JSON.stringify(data.filterable_fields),
          is_download_allowed: data.is_download_allowed,
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
  async updatePageConfig(masterDb, pageKey, payload) {
    const schema = Joi.object({
      title: Joi.string().min(1).max(200),
      data_source: Joi.string().min(1).max(100).pattern(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
      columns: Joi.array()
        .items(
          Joi.object({
            name: Joi.string().required(),
            label: Joi.string().required(),
            type: Joi.string().valid('string', 'number', 'date', 'boolean').optional(),
            width: Joi.number().optional(),
          })
        )
        .min(1),
      searchable_fields: Joi.array().items(Joi.string()).min(0),
      filterable_fields: Joi.array()
        .items(
          Joi.object({
            name: Joi.string().required(),
            label: Joi.string().required(),
            type: Joi.string().valid('text', 'select', 'number', 'date').required(),
            options: Joi.array().items(Joi.string()).optional(),
          })
        )
        .min(0),
      is_download_allowed: Joi.boolean(),
      default_sort: Joi.object({
        field: Joi.string().required(),
        order: Joi.string().valid('ASC', 'DESC').default('ASC'),
      }).allow(null),
      page_size_default: Joi.number().integer().min(1).max(100),
    });

    const data = validate(schema, payload);
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
      if (data.data_source !== undefined) updateData.data_source = data.data_source;
      if (data.columns !== undefined) updateData.columns_json = JSON.stringify(data.columns);
      if (data.searchable_fields !== undefined)
        updateData.searchable_fields_json = JSON.stringify(data.searchable_fields);
      if (data.filterable_fields !== undefined)
        updateData.filterable_fields_json = JSON.stringify(data.filterable_fields);
      if (data.is_download_allowed !== undefined) updateData.is_download_allowed = data.is_download_allowed;
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

