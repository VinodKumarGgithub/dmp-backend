async function runInTransaction(sequelize, handler) {
  return sequelize.transaction(async (t) => handler(t));
}

module.exports = { runInTransaction };


