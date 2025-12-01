import { pool } from '../config/database';
import { logger } from '../config/logger';

/**
 * Example migration script
 * Create your database tables here
 */
export const runMigrations = async (): Promise<void> => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Example: Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Example: Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
    `);
    
    // Create teams table for sports games
    await client.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        league VARCHAR(50) NOT NULL,
        record VARCHAR(50),
        logo TEXT,
        abbreviation VARCHAR(10),
        alias VARCHAR(255),
        provider_id INTEGER,
        color VARCHAR(20),
        api_created_at TIMESTAMP,
        api_updated_at TIMESTAMP,
        db_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        db_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes for teams table
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_teams_league ON teams(league)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_teams_abbreviation ON teams(abbreviation)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_teams_league_abbreviation ON teams(league, abbreviation)
    `);
    
    await client.query('COMMIT');
    logger.info('Migrations completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Migration error:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info('Migrations finished');
      pool.end().then(() => process.exit(0));
    })
    .catch((error) => {
      logger.error('Migration failed:', error);
      pool.end().then(() => process.exit(1));
    });
}

