const Joi = require('joi');
const { fromCode } = require('./errors');

function validate(schema, payload) {
  const { error, value } = schema.validate(payload, { abortEarly: false, stripUnknown: true });
  if (error) {
    const details = error.details.map(d => d.message);
    throw fromCode('VALIDATION_ERROR', details);
  }
  return value;
}

module.exports = { Joi, validate };


