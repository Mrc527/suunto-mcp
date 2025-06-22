// This is a basic migration script example for Sequelize CLI.
// For production, use the Sequelize CLI to generate and run migrations.
// See: https://sequelize.org/docs/v6/other-topics/migrations/

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Users', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      suuntoUsername: {
        type: Sequelize.STRING,
        allowNull: false
      },
      suuntoToken: {
        type: Sequelize.STRING,
        allowNull: false
      },
      mcpToken: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      suuntoRefreshToken: {
        type: Sequelize.STRING,
        allowNull: true
      },
      suuntoTokenExpires: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Users');
  }
};
