module.exports = (sequelize, DataTypes) => {
  const CustomerSegment = sequelize.define('CustomerSegment', {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    description: {
      type: DataTypes.TEXT
    },
    criteria: {
      type: DataTypes.JSON,
      defaultValue: {}
    },
    customerCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    timestamps: true
  });

  CustomerSegment.associate = (models) => {
    CustomerSegment.hasMany(models.Campaign, { foreignKey: 'segmentId' });
  };

  return CustomerSegment;
};
