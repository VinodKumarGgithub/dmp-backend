const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PBM_PriorAuthorizations_RQRS = sequelize.define('PBM_PriorAuthorizations_RQRS',
    {
        requestid: { type: DataTypes.STRING },
        version: { type: DataTypes.INTEGER },
        txn_type: { type: DataTypes.INTEGER },
        reqBody: { type: DataTypes.TEXT },
        respBody: { type: DataTypes.TEXT }
    }, {
        timestamps: true,
        tableName: 'PBM_PriorAuthorizations_RQRS'
    }
  );

  return PBM_PriorAuthorizations_RQRS;
};
