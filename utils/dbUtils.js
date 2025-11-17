async function withTransaction(sequelize, work) {
  return sequelize.transaction(async (t) => work(t));
}

async function findOrFail(model, query) {
  const record = await model.findOne(query);
  if (!record) throw new Error("Record not found");
  return record;
}

async function exists(model, query) {
  const count = await model.count(query);
  return count > 0;
}

module.exports = { withTransaction, findOrFail, exists };


