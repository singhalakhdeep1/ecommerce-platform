module.exports = (sequelize, DataTypes) => {
  const Campaign = sequelize.define('Campaign', {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('email', 'sms', 'push', 'social'),
      allowNull: false,
      defaultValue: 'email'
    },
    subject: {
      type: DataTypes.STRING
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    segmentId: {
      type: DataTypes.INTEGER
    },
    status: {
      type: DataTypes.ENUM('draft', 'scheduled', 'sent', 'paused', 'completed'),
      defaultValue: 'draft'
    },
    scheduledAt: {
      type: DataTypes.DATE
    },
    sentAt: {
      type: DataTypes.DATE
    },
    sentCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    openedCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    clickedCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    timestamps: true
  });

  Campaign.associate = (models) => {
    Campaign.belongsTo(models.CustomerSegment, { foreignKey: 'segmentId' });
  };

  return Campaign;
};
