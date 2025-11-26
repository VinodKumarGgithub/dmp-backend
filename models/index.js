
async function initModels(sequelize) {
  const models = {
  };

  Object.values(models).forEach((model) => {
    if (typeof model.associate === 'function') model.associate(models);
  });

  return models;
}

module.exports = { initModels };


