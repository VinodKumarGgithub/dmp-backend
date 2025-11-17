const dayjs = require('dayjs');

function nowUtcIso() {
  return dayjs().toDate().toISOString();
}

module.exports = { nowUtcIso };


