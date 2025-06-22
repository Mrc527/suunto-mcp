import { Sequelize, DataTypes, Model } from 'sequelize';
// @ts-ignore
import pg from 'pg';

// Use DATABASE_URL from environment for PostgreSQL
const databaseUrl = process.env.DATABASE_URL || '';
export const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  protocol: 'postgres',
  logging: false,
  dialectModule: pg,
  dialectOptions: {
    ssl: databaseUrl.includes('sslmode=require') ? { require: true, rejectUnauthorized: false } : false,
  },
});

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

// Initialize DB connection and run migrations if needed
export async function initDb() {
  try {
    await sequelize.authenticate();
    if (process.env.NODE_ENV !== 'production') {
      // Safe to use sync in development only
      await sequelize.sync();
      console.log('Database connected and models synchronized (development mode).');
    } else {
      // In production, use migrations only
      console.log('Database connected (production mode). Run migrations separately.');
    }
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
}
