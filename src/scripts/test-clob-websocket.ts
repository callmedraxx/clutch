/**
 * Test script to explore CLOB WebSocket connection
 * Run with: npx ts-node src/scripts/test-clob-websocket.ts
 */

import dotenv from 'dotenv';
import { clobWebSocketService } from '../services/polymarket/clob-websocket.service';
import { logger } from '../config/logger';

// Load environment variables
dotenv.config();

async function main() {
  logger.info({
    message: 'Starting CLOB WebSocket exploration',
  });

  try {
    // Connect to WebSocket
    await clobWebSocketService.connect();

    // Wait passively for initial messages from server (30 seconds)
    // Don't send anything - just see what the server sends us
    logger.info({
      message: 'Waiting passively for 30 seconds to see if server sends any initial messages...',
    });

    await new Promise((resolve) => setTimeout(resolve, 30000));

    // Check status
    const status = clobWebSocketService.getStatus();
    logger.info({
      message: 'WebSocket status after passive wait',
      status,
    });

    // Get message history
    const messages = clobWebSocketService.getMessageHistory();
    logger.info({
      message: 'Message history after passive wait',
      count: messages.length,
      allMessages: messages,
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
          hasChannel: 'channel' in msg,
          hasData: 'data' in msg,
        });
      });
    } else {
      logger.info({
        message: 'No messages received. Trying the correct subscription format with assets_ids.',
      });
      
      // Use the correct format: {"assets_ids":["..."],"type":"market"}
      // Let's try with a sample token ID (you can replace this with a real one from your data)
      const sampleAssetId = '79582254082838461298332796975720054327136374562196770992070812664072096367481';
      
      logger.info({
        message: 'Subscribing to asset using correct format',
        assetId: sampleAssetId,
      });

      // Use the new subscribeToAssets method
      clobWebSocketService.subscribeToAssets([sampleAssetId]);

      // Wait to see what messages we get
      logger.info({
        message: 'Waiting 20 seconds to see market updates...',
      });
      await new Promise((resolve) => setTimeout(resolve, 20000));

      const currentStatus = clobWebSocketService.getStatus();
      const currentMessages = clobWebSocketService.getMessageHistory();

      logger.info({
        message: 'Result after subscription',
        stillConnected: currentStatus.isConnected,
        messagesReceived: currentMessages.length,
        latestMessages: currentMessages.slice(-5),
      });

      // If we got messages, analyze them
      if (currentMessages.length > 0) {
        logger.info({
          message: 'Received messages after subscription! Analyzing...',
        });
        
        // Check for order book updates
        const orderBookHistory = clobWebSocketService.getOrderBookHistory();
        if (orderBookHistory.length > 0) {
          logger.info({
            message: 'Order book updates received!',
            count: orderBookHistory.length,
          });

          // Show latest order book for the subscribed asset
          const latestOrderBook = clobWebSocketService.getLatestOrderBook(sampleAssetId);
          if (latestOrderBook) {
            logger.info({
              message: 'Latest order book for subscribed asset',
              market: latestOrderBook.market,
              asset_id: latestOrderBook.asset_id,
              timestamp: latestOrderBook.timestamp,
              bestBid: latestOrderBook.bids[0] || null,
              bestAsk: latestOrderBook.asks[0] || null,
              lastTradePrice: latestOrderBook.last_trade_price,
              totalBids: latestOrderBook.bids.length,
              totalAsks: latestOrderBook.asks.length,
            });
          }
        }
        
        currentMessages.forEach((msg, index) => {
          logger.info({
            message: `Message ${index + 1} details`,
            msgData: msg,
            keys: Object.keys(msg),
          });
        });
      }
    }

    // Get final message history
    const finalMessages = clobWebSocketService.getMessageHistory();
    logger.info({
      message: 'Final message history',
      count: finalMessages.length,
      allMessages: finalMessages,
    });

    // Disconnect
    clobWebSocketService.disconnect();
    logger.info({
      message: 'WebSocket disconnected',
    });

  } catch (error) {
    logger.error({
      message: 'Error in WebSocket exploration',
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
      message: 'WebSocket exploration completed',
    });
    process.exit(0);
  })
  .catch((error) => {
    logger.error({
      message: 'Fatal error in WebSocket exploration',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  });

