/**
 * Test script to explore Live Data WebSocket connection
 * Run with: npm run test:live-data-ws
 */

import dotenv from 'dotenv';
import { liveDataWebSocketService } from '../services/polymarket/live-data-websocket.service';
import { logger } from '../config/logger';

// Load environment variables
dotenv.config();

async function main() {
  logger.info({
    message: 'Starting Live Data WebSocket exploration',
  });

  try {
    // Connect to WebSocket
    await liveDataWebSocketService.connect();

    // Wait for connection_id (usually comes immediately)
    logger.info({
      message: 'Waiting 5 seconds for connection_id...',
    });
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Check status
    const status = liveDataWebSocketService.getStatus();
    logger.info({
      message: 'Live Data WebSocket status',
      status,
    });

    // Try subscribing to the example event from the user
    const exampleEventSlug = 'nfl-hou-ind-2025-11-30';
    logger.info({
      message: 'Subscribing to example event activity',
      eventSlug: exampleEventSlug,
    });

    liveDataWebSocketService.subscribeToEventActivity(exampleEventSlug);

    // Wait to see what we get
    logger.info({
      message: 'Waiting 30 seconds to see order matches and other activity...',
    });
    await new Promise((resolve) => setTimeout(resolve, 30000));

    // Check what we received
    const messages = liveDataWebSocketService.getMessageHistory();
    const ordersMatched = liveDataWebSocketService.getOrdersMatched();

    logger.info({
      message: 'Messages received',
      totalMessages: messages.length,
      ordersMatched: ordersMatched.length,
    });

    // Analyze message types
    const topics = new Set<string>();
    const types = new Set<string>();
    messages.forEach((msg) => {
      if (msg.topic) topics.add(msg.topic);
      if (msg.type) types.add(msg.type);
    });

    logger.info({
      message: 'Message analysis',
      topics: Array.from(topics),
      types: Array.from(types),
    });

    // Show sample orders matched
    if (ordersMatched.length > 0) {
      logger.info({
        message: 'Sample orders matched',
        count: ordersMatched.length,
        samples: ordersMatched.slice(0, 5).map((order) => ({
          eventSlug: order.eventSlug,
          title: order.title,
          outcome: order.outcome,
          side: order.side,
          price: order.price,
          size: order.size,
          timestamp: order.timestamp,
        })),
      });
    }

    // Try subscribing to comments as well
    logger.info({
      message: 'Trying to subscribe to comments...',
    });
    liveDataWebSocketService.subscribeToComments(10187, 'Series');

    // Wait a bit more
    logger.info({
      message: 'Waiting 20 more seconds to see comments...',
    });
    await new Promise((resolve) => setTimeout(resolve, 20000));

    // Check for comments
    const commentMessages = liveDataWebSocketService.getMessagesByTopic('comments');
    logger.info({
      message: 'Comment messages received',
      count: commentMessages.length,
      samples: commentMessages.slice(0, 3),
    });

    // Final status
    const finalStatus = liveDataWebSocketService.getStatus();
    const finalMessages = liveDataWebSocketService.getMessageHistory();
    const finalOrdersMatched = liveDataWebSocketService.getOrdersMatched();

    logger.info({
      message: 'Final exploration results',
      status: finalStatus,
      totalMessages: finalMessages.length,
      totalOrdersMatched: finalOrdersMatched.length,
      allTopics: Array.from(new Set(finalMessages.map(m => m.topic).filter(Boolean))),
      allTypes: Array.from(new Set(finalMessages.map(m => m.type).filter(Boolean))),
      recentMessages: finalMessages.slice(-10),
    });

    // Disconnect
    liveDataWebSocketService.disconnect();
    logger.info({
      message: 'Live Data WebSocket disconnected',
    });

  } catch (error) {
    logger.error({
      message: 'Error in Live Data WebSocket exploration',
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
      message: 'Live Data WebSocket exploration completed',
    });
    process.exit(0);
  })
  .catch((error) => {
    logger.error({
      message: 'Fatal error in Live Data WebSocket exploration',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  });

