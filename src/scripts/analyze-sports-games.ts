/**
 * Quick script to analyze what games we get on initial connection
 */

import dotenv from 'dotenv';
import { sportsWebSocketService } from '../services/polymarket/sports-websocket.service';
import { logger } from '../config/logger';

dotenv.config();

async function main() {
  logger.info({
    message: 'Analyzing Sports WebSocket initial connection data',
  });

  try {
    await sportsWebSocketService.connect();

    // Wait 20 seconds to collect all initial games
    logger.info({
      message: 'Waiting 20 seconds to collect all initial games...',
    });
    await new Promise((resolve) => setTimeout(resolve, 20000));

    const allGames = sportsWebSocketService.getAllGames();
    
    // Analyze games
    const liveGames = allGames.filter(g => g.live && !g.ended);
    const endedGames = allGames.filter(g => g.ended);
    const otherGames = allGames.filter(g => !g.live && !g.ended);

    logger.info({
      message: 'Game Analysis',
      totalGames: allGames.length,
      liveGames: liveGames.length,
      endedGames: endedGames.length,
      otherGames: otherGames.length,
    });

    // Show breakdown by league
    const leagueBreakdown = new Map<string, { total: number; live: number; ended: number }>();
    allGames.forEach(game => {
      const league = game.leagueAbbreviation;
      if (!leagueBreakdown.has(league)) {
        leagueBreakdown.set(league, { total: 0, live: 0, ended: 0 });
      }
      const stats = leagueBreakdown.get(league)!;
      stats.total++;
      if (game.live && !game.ended) stats.live++;
      if (game.ended) stats.ended++;
    });

    logger.info({
      message: 'Breakdown by League',
      leagues: Array.from(leagueBreakdown.entries()).map(([league, stats]) => ({
        league,
        total: stats.total,
        live: stats.live,
        ended: stats.ended,
      })),
    });

    // Show sample ended games
    if (endedGames.length > 0) {
      logger.info({
        message: 'Sample Ended Games',
        count: endedGames.length,
        samples: endedGames.slice(0, 5).map(g => ({
          gameId: g.gameId,
          league: g.leagueAbbreviation,
          score: g.score,
          period: g.period,
          status: g.status,
        })),
      });
    }

    // Show sample live games
    if (liveGames.length > 0) {
      logger.info({
        message: 'Sample Live Games',
        count: liveGames.length,
        samples: liveGames.slice(0, 5).map(g => ({
          gameId: g.gameId,
          league: g.leagueAbbreviation,
          score: g.score,
          period: g.period,
          elapsed: g.elapsed,
          status: g.status,
        })),
      });
    }

    sportsWebSocketService.disconnect();
  } catch (error) {
    logger.error({
      message: 'Error analyzing games',
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

main().then(() => process.exit(0));

