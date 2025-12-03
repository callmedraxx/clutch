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
    
    // Create live_games table for storing live sports games
    await client.query(`
      CREATE TABLE IF NOT EXISTS live_games (
        id VARCHAR(255) PRIMARY KEY,
        ticker VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        resolution_source TEXT,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        image TEXT,
        icon TEXT,
        active BOOLEAN DEFAULT true,
        closed BOOLEAN DEFAULT false,
        archived BOOLEAN DEFAULT false,
        restricted BOOLEAN,
        liquidity NUMERIC,
        volume NUMERIC,
        volume_24hr NUMERIC,
        competitive NUMERIC,
        sport VARCHAR(50),
        league VARCHAR(50),
        series_id VARCHAR(50),
        game_id INTEGER,
        score VARCHAR(50),
        period VARCHAR(50),
        elapsed VARCHAR(50),
        live BOOLEAN,
        ended BOOLEAN,
        transformed_data JSONB,
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add missing columns if they don't exist (for existing tables)
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='live_games' AND column_name='game_id') THEN
          ALTER TABLE live_games ADD COLUMN game_id INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='live_games' AND column_name='score') THEN
          ALTER TABLE live_games ADD COLUMN score VARCHAR(50);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='live_games' AND column_name='period') THEN
          ALTER TABLE live_games ADD COLUMN period VARCHAR(50);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='live_games' AND column_name='elapsed') THEN
          ALTER TABLE live_games ADD COLUMN elapsed VARCHAR(50);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='live_games' AND column_name='live') THEN
          ALTER TABLE live_games ADD COLUMN live BOOLEAN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='live_games' AND column_name='ended') THEN
          ALTER TABLE live_games ADD COLUMN ended BOOLEAN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='live_games' AND column_name='transformed_data') THEN
          ALTER TABLE live_games ADD COLUMN transformed_data JSONB;
        END IF;
      END $$;
    `);
    
    // Create indexes for live_games table
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_live_games_active ON live_games(active, closed)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_live_games_sport ON live_games(sport)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_live_games_series_id ON live_games(series_id)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_live_games_volume_24hr ON live_games(volume_24hr DESC NULLS LAST)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_live_games_start_date ON live_games(start_date)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_live_games_game_id ON live_games(game_id)
    `);
    
    // Create GIN index on transformed_data for efficient JSON queries (e.g., groupedOutcomes)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_live_games_transformed_data_gin ON live_games USING GIN (transformed_data)
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

