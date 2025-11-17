const { v4: uuidv4 } = require('uuid');

function generateId(prefix = '') {
  const id = process.hrtime.bigint()
  return `${prefix}${prefix ? '_' : ''}${id}`;
}

module.exports = { generateId };


