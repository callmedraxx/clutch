/**
 * Test script to explore Sports WebSocket connection
 * Run with: npm run test:sports-ws
 */

import dotenv from 'dotenv';
import { sportsWebSocketService } from '../services/polymarket/sports-websocket.service';
import { logger } from '../config/logger';

// Load environment variables
dotenv.config();

async function main() {
  logger.info({
    message: 'Starting Sports WebSocket exploration',
  });

  try {
    // Connect to WebSocket
    await sportsWebSocketService.connect();

    // Wait passively for initial messages from server (30 seconds)
    logger.info({
      message: 'Waiting passively for 30 seconds to see if server sends any initial messages...',
    });

    await new Promise((resolve) => setTimeout(resolve, 30000));

    // Check status
    const status = sportsWebSocketService.getStatus();
    logger.info({
      message: 'Sports WebSocket status after passive wait',
      status,
    });

    // Get message history
    const messages = sportsWebSocketService.getMessageHistory();
    logger.info({
      message: 'Message history after passive wait',
      count: messages.length,
      allMessages: messages,
    });

    // Get game updates
    const games = sportsWebSocketService.getAllGames();
    logger.info({
      message: 'Game updates received',
      count: games.length,
      games: games,
    });

    // If we got messages, analyze them
    if (messages.length > 0) {
      logger.info({
        message: 'Server sent messages! Analyzing structure...',
      });
      
      messages.forEach((msg, index) => {
        logger.info({
          message: `Message ${index + 1} analysis`,
          msgData: msg,
          keys: Object.keys(msg),
          hasType: 'type' in msg,
          hasEvent: 'event' in msg,
          hasAction: 'action' in msg,
        });
      });
    }

    // If we got games, show them organized
    if (games.length > 0) {
      logger.info({
        message: 'Games received! Organizing by league...',
      });

      // Group by league
      const gamesByLeague = new Map<string, typeof games>();
      games.forEach((game) => {
        const league = game.leagueAbbreviation;
        if (!gamesByLeague.has(league)) {
          gamesByLeague.set(league, []);
        }
        gamesByLeague.get(league)!.push(game);
      });

      gamesByLeague.forEach((leagueGames, league) => {
        logger.info({
          message: `League: ${league}`,
          gameCount: leagueGames.length,
          games: leagueGames.map((g) => ({
            gameId: g.gameId,
            score: g.score,
            period: g.period,
            elapsed: g.elapsed,
            homeTeam: g.homeTeam,
            awayTeam: g.awayTeam,
            live: g.live,
            ended: g.ended,
          })),
        });
      });

      // Show live games
      const liveGames = sportsWebSocketService.getLiveGames();
      logger.info({
        message: 'Live games',
        count: liveGames.length,
        games: liveGames,
      });
    } else {
      logger.info({
        message: 'No games received. Trying subscription patterns...',
      });

      // Try different subscription patterns
      const subscriptionPatterns = [
        { name: 'Pattern 1: subscribe all', message: { type: 'subscribe', games: 'all' } },
        { name: 'Pattern 2: subscribe action', message: { action: 'subscribe', games: 'all' } },
        { name: 'Pattern 3: subscribe event', message: { event: 'subscribe', data: { games: 'all' } } },
        { name: 'Pattern 4: subscribe leagues', message: { type: 'subscribe', leagues: ['nfl', 'nba', 'mlb'] } },
        { name: 'Pattern 5: subscribe without type', message: { subscribe: 'games' } },
      ];

      for (const pattern of subscriptionPatterns) {
        // Reconnect if needed
        if (!sportsWebSocketService.getStatus().isConnected) {
          logger.info({
            message: 'Reconnecting before trying next pattern...',
          });
          await sportsWebSocketService.connect();
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        logger.info({
          message: `Trying ${pattern.name}`,
          pattern: pattern.message,
        });

        sportsWebSocketService.send(pattern.message);

        // Wait 10 seconds to see if we get a response
        await new Promise((resolve) => setTimeout(resolve, 10000));

        const currentStatus = sportsWebSocketService.getStatus();
        const currentMessages = sportsWebSocketService.getMessageHistory();
        const currentGames = sportsWebSocketService.getAllGames();

        logger.info({
          message: `Result after ${pattern.name}`,
          stillConnected: currentStatus.isConnected,
          messagesReceived: currentMessages.length,
          gamesReceived: currentGames.length,
          latestMessages: currentMessages.slice(-3),
          latestGames: currentGames.slice(-3),
        });

        // If we got games, break
        if (currentGames.length > 0) {
          logger.info({
            message: 'Successfully received games!',
            games: currentGames,
          });
          break;
        }

        // If connection closed, wait a bit before reconnecting
        if (!currentStatus.isConnected) {
          logger.warn({
            message: 'Connection closed after sending message. Waiting before next attempt...',
          });
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    // Get final status
    const finalStatus = sportsWebSocketService.getStatus();
    const finalGames = sportsWebSocketService.getAllGames();
    const finalMessages = sportsWebSocketService.getMessageHistory();

    logger.info({
      message: 'Final exploration results',
      status: finalStatus,
      totalGames: finalGames.length,
      totalMessages: finalMessages.length,
      allGames: finalGames,
      allMessages: finalMessages.slice(-10), // Last 10 messages
    });

    // Keep connection alive for a bit more to see if we get more updates
    logger.info({
      message: 'Keeping connection alive for 30 more seconds to see live updates...',
    });
    await new Promise((resolve) => setTimeout(resolve, 30000));

    // Final check
    const finalGamesAfterWait = sportsWebSocketService.getAllGames();
    logger.info({
      message: 'Final games after additional wait',
      count: finalGamesAfterWait.length,
      games: finalGamesAfterWait,
    });

    // Disconnect
    sportsWebSocketService.disconnect();
    logger.info({
      message: 'Sports WebSocket disconnected',
    });

  } catch (error) {
    logger.error({
      message: 'Error in Sports WebSocket exploration',
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
      message: 'Sports WebSocket exploration completed',
    });
    process.exit(0);
  })
  .catch((error) => {
    logger.error({
      message: 'Fatal error in Sports WebSocket exploration',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  });

