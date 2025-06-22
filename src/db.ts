import { Sequelize, DataTypes, Model } from 'sequelize';

// In-memory SQLite DB
export const sequelize = new Sequelize('sqlite::memory:', { logging: false });

export class User extends Model {
  public id!: number;
  public suuntoUsername!: string;
  public suuntoToken!: string;
  public mcpToken!: string;
  public suuntoRefreshToken!: string;
  public suuntoTokenExpires!: number;
}

User.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    suuntoUsername: { type: DataTypes.STRING, allowNull: false },
    suuntoToken: { type: DataTypes.STRING, allowNull: false },
    mcpToken: { type: DataTypes.STRING, allowNull: false, unique: true },
    suuntoRefreshToken: { type: DataTypes.STRING, allowNull: true },
    suuntoTokenExpires: { type: DataTypes.INTEGER, allowNull: true },
  },
  { sequelize, modelName: 'User' }
);

export async function syncDb() {
  await sequelize.sync();
}
