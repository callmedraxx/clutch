/**
 * Script to verify live games table and service
 * Run with: npm run build && node dist/scripts/verify-live-games.js
 */

import { pool } from '../config/database';
import { logger } from '../config/logger';
import { getAllLiveGames, getInMemoryStats } from '../services/polymarket/live-games.service';
import { liveGamesService } from '../services/polymarket/live-games.service';

async function verifyLiveGames() {
  const client = await pool.connect();
  
  try {
    logger.info('=== Verifying Live Games Setup ===');
    
    // 1. Check if table exists
    logger.info('\n1. Checking if live_games table exists...');
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'live_games'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      logger.error('❌ live_games table does NOT exist!');
      logger.error('Please run migrations: npm run migrate');
      process.exit(1);
    }
    logger.info('✅ live_games table exists');
    
    // 2. Check table structure
    logger.info('\n2. Checking table structure...');
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'live_games'
      ORDER BY ordinal_position;
    `);
    
    const requiredColumns = [
      'id', 'ticker', 'slug', 'title', 'description', 'resolution_source',
      'start_date', 'end_date', 'image', 'icon', 'active', 'closed', 'archived',
      'restricted', 'liquidity', 'volume', 'volume_24hr', 'competitive',
      'sport', 'league', 'series_id', 'game_id', 'score', 'period', 'elapsed',
      'live', 'ended', 'transformed_data', 'raw_data', 'created_at', 'updated_at'
    ];
    
    const existingColumns = columns.rows.map((r: any) => r.column_name);
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
    
    if (missingColumns.length > 0) {
      logger.warn(`⚠️  Missing columns: ${missingColumns.join(', ')}`);
      logger.warn('Please run migrations to add missing columns');
    } else {
      logger.info(`✅ All required columns exist (${columns.rows.length} total)`);
    }
    
    // 3. Check indexes
    logger.info('\n3. Checking indexes...');
    const indexes = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'live_games';
    `);
    
    logger.info(`✅ Found ${indexes.rows.length} indexes:`);
    indexes.rows.forEach((idx: any) => {
      logger.info(`   - ${idx.indexname}`);
    });
    
    // 4. Check row count
    logger.info('\n4. Checking stored games...');
    const countResult = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE active = true AND closed = false) as active,
        COUNT(*) FILTER (WHERE live = true) as live,
        COUNT(*) FILTER (WHERE ended = true) as ended
      FROM live_games;
    `);
    
    const stats = countResult.rows[0];
    logger.info(`✅ Database stats:`);
    logger.info(`   - Total games: ${stats.total}`);
    logger.info(`   - Active games: ${stats.active}`);
    logger.info(`   - Live games: ${stats.live || 0}`);
    logger.info(`   - Ended games: ${stats.ended || 0}`);
    
    // 5. Check service status
    logger.info('\n5. Checking live games service status...');
    const serviceStatus = liveGamesService.getStatus();
    logger.info(`✅ Service status:`);
    logger.info(`   - Running: ${serviceStatus.isRunning}`);
    logger.info(`   - Polling interval: ${serviceStatus.intervalMinutes} minutes`);
    
    // 6. Check in-memory stats (development)
    if (process.env.NODE_ENV !== 'production') {
      logger.info('\n6. Checking in-memory storage (development)...');
      const inMemoryStats = getInMemoryStats();
      logger.info(`✅ In-memory stats:`);
      logger.info(`   - Games in memory: ${inMemoryStats.count}`);
    }
    
    // 7. Test fetching games
    logger.info('\n7. Testing getAllLiveGames()...');
    try {
      const games = await getAllLiveGames();
      logger.info(`✅ Successfully fetched ${games.length} games`);
      
      if (games.length > 0) {
        const sample = games[0];
        logger.info(`   Sample game: ${sample.title} (${sample.sport || 'unknown sport'})`);
        logger.info(`   - ID: ${sample.id}`);
        logger.info(`   - Active: ${sample.active}, Closed: ${sample.closed}`);
        logger.info(`   - Live: ${sample.live || false}, Ended: ${sample.ended || false}`);
      }
    } catch (error) {
      logger.error(`❌ Error fetching games: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    logger.info('\n=== Verification Complete ===');
    
  } catch (error) {
    logger.error('Verification failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run if executed directly
if (require.main === module) {
  verifyLiveGames()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('Script failed:', error);
      process.exit(1);
    });
}

export { verifyLiveGames };

