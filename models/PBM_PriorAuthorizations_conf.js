const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PBM_PriorAuthorizations_conf = sequelize.define('pbm_priorauthorizations_conf',
    {
        confid: {
            type: DataTypes.STRING,
            autoIncrement: true,
            primaryKey: true
        },
        confname: {type: DataTypes.STRING},
        status: {
            type: DataTypes.STRING,
            defaultValue: 'ACTIVE'
        },
        conf_desc: {type: DataTypes.STRING},

        createdBy: {type: DataTypes.STRING},
        createdOn: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        updatedOn: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        }
    },{
        timestamps: false,
        tableName: 'pbm_priorauthorizations_conf'
    }
);

  return PBM_PriorAuthorizations_conf;
};


