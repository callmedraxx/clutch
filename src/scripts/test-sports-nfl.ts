/**
 * Test script to get NFL games from Sports WebSocket
 * Run with: npm run test:sports-nfl
 */

import dotenv from 'dotenv';
import { sportsWebSocketService } from '../services/polymarket/sports-websocket.service';
import { logger } from '../config/logger';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

async function main() {
  logger.info({
    message: 'Starting NFL games collection from Sports WebSocket',
  });

  try {
    // Connect to WebSocket
    await sportsWebSocketService.connect();

    // Wait for games to come in (give it 60 seconds to collect all initial games)
    // Games may come in gradually as they transition to live status
    logger.info({
      message: 'Waiting 60 seconds to collect all NFL games (games may come in gradually)...',
    });
    await new Promise((resolve) => setTimeout(resolve, 60000));

    // Get all NFL games
    const nflGames = sportsWebSocketService.getGamesByLeague('nfl');
    
    logger.info({
      message: 'NFL games collected',
      count: nflGames.length,
    });

    // Get all games for reference
    const allGames = sportsWebSocketService.getAllGames();
    logger.info({
      message: 'Total games received',
      total: allGames.length,
      nflCount: nflGames.length,
      otherLeagues: Array.from(new Set(allGames.map(g => g.leagueAbbreviation))),
    });

    // Save NFL games to JSON file
    const outputPath = path.join(process.cwd(), 'nfl-games.json');
    fs.writeFileSync(outputPath, JSON.stringify(nflGames, null, 2));

    logger.info({
      message: 'NFL games saved to file',
      filePath: outputPath,
      gameCount: nflGames.length,
    });

    // Also log a summary
    logger.info({
      message: 'NFL Games Summary',
      games: nflGames.map(game => ({
        gameId: game.gameId,
        title: `${game.awayTeam || 'Away'} @ ${game.homeTeam || 'Home'}`,
        score: game.score,
        period: game.period,
        elapsed: game.elapsed,
        live: game.live,
        ended: game.ended,
        status: game.status,
      })),
    });

    // Keep connection alive for a bit more to see if we get updates
    // Games may transition to live status over time
    logger.info({
      message: 'Keeping connection alive for 60 more seconds to capture games that transition to live...',
    });
    await new Promise((resolve) => setTimeout(resolve, 60000));

    // Check for updates
    const updatedNflGames = sportsWebSocketService.getGamesByLeague('nfl');
    if (updatedNflGames.length !== nflGames.length) {
      logger.info({
        message: 'NFL games updated',
        previousCount: nflGames.length,
        newCount: updatedNflGames.length,
      });

      // Save updated games
      fs.writeFileSync(outputPath, JSON.stringify(updatedNflGames, null, 2));
      logger.info({
        message: 'Updated NFL games saved to file',
        filePath: outputPath,
      });
    }

    // Disconnect
    sportsWebSocketService.disconnect();
    logger.info({
      message: 'Sports WebSocket disconnected',
    });

  } catch (error) {
    logger.error({
      message: 'Error collecting NFL games',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Run the script
main()
  .then(() => {
    logger.info({
      message: 'NFL games collection completed',
    });
    process.exit(0);
  })
  .catch((error) => {
    logger.error({
      message: 'Fatal error in NFL games collection',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  });

