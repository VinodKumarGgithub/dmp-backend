const PBM_PriorAuthorizations_conf = require('./PBM_PriorAuthorizations_conf');
const PBM_PriorAuthorizations_RQRS = require('./PBM_PriorAuthorizations_RQRS');

async function initModels(sequelize) {
  const models = {
    PBM_PriorAuthorizations_conf: PBM_PriorAuthorizations_conf(sequelize),
    PBM_PriorAuthorizations_RQRS: PBM_PriorAuthorizations_RQRS(sequelize),
    
  };

  Object.values(models).forEach((model) => {
    if (typeof model.associate === 'function') model.associate(models);
  });

  return models;
}

module.exports = { initModels };


