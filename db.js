const { Sequelize, DataTypes } = require('sequelize')

const {
  MYSQL_USERNAME,
  MYSQL_PASSWORD,
  MYSQL_ADDRESS = ''
} = process.env

const [host, port] = MYSQL_ADDRESS.split(':')

const sequelize = new Sequelize(
  'nodejs_demo',
  MYSQL_USERNAME,
  MYSQL_PASSWORD,
  {
    host,
    port,
    dialect: 'mysql',
    logging: false
  }
)

const Application = sequelize.define(
  'Application',
  {
    applicationNo: {
      type: DataTypes.STRING(32),
      allowNull: false,
      unique: true
    },

    openid: {
      type: DataTypes.STRING(128),
      allowNull: false
    },

    name: {
      type: DataTypes.STRING(50),
      allowNull: false
    },

    phone: {
      type: DataTypes.STRING(20),
      allowNull: false
    },

    idCardCiphertext: {
      type: DataTypes.TEXT,
      allowNull: false
    },

    idCardLast4: {
      type: DataTypes.STRING(4),
      allowNull: false
    },

    birthYear: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    school: {
      type: DataTypes.STRING(100),
      allowNull: false
    },

    screenshotPath: {
      type: DataTypes.STRING(500),
      allowNull: true
    },

    status: {
      type: DataTypes.ENUM(
        'pending',
        'approved',
        'rejected',
        'redeemed'
      ),
      allowNull: false,
      defaultValue: 'pending'
    },

    reviewNote: {
      type: DataTypes.STRING(255),
      allowNull: true
    },

    redeemedAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  },
  {
    tableName: 'applications',
    indexes: [
      {
        fields: ['openid']
      }
    ]
  }
)

async function init() {
  await Application.sync({ alter: true })
}

module.exports = {
  init,
  Application
}