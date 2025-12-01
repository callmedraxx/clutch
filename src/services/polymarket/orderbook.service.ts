/**
 * Orderbook Service
 * Fetches orderbook data from Polymarket CLOB API for multiple token IDs
 */

import { logger } from '../../config/logger';
import { polymarketClient } from './polymarket.client';
import { OrderBookResponse } from './polymarket.types';
import { ValidationError, PolymarketError, ErrorCode } from '../../utils/errors';

/**
 * Orderbook Service
 */
export class OrderbookService {
  /**
   * Get orderbooks for multiple token IDs
   * @param tokenIds - Array of token IDs to fetch orderbooks for
   * @returns Array of orderbook data
   */
  async getOrderBooks(tokenIds: string[]): Promise<OrderBookResponse[]> {
    // Validate token IDs
    this.validateTokenIds(tokenIds);

    logger.info({
      message: 'Fetching orderbooks',
      tokenCount: tokenIds.length,
    });

    try {
      const orderbooks = await polymarketClient.getOrderBooks(tokenIds);

      logger.info({
        message: 'Orderbooks fetched successfully',
        tokenCount: tokenIds.length,
        orderbookCount: orderbooks.length,
      });

      return orderbooks;
    } catch (error) {
      logger.error({
        message: 'Error fetching orderbooks',
        tokenCount: tokenIds.length,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Re-throw validation errors
      if (error instanceof ValidationError) {
        throw error;
      }

      // Convert other errors to PolymarketError
      if (error instanceof PolymarketError) {
        throw error;
      }

      // Wrap unknown errors
      throw new PolymarketError(
        ErrorCode.POLYMARKET_FETCH_FAILED,
        `Failed to fetch orderbooks: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Validate token IDs array
   * @param tokenIds - Array of token IDs to validate
   */
  private validateTokenIds(tokenIds: string[]): void {
    if (!Array.isArray(tokenIds)) {
      throw new ValidationError(
        ErrorCode.BAD_REQUEST,
        'tokenIds must be an array'
      );
    }

    if (tokenIds.length === 0) {
      throw new ValidationError(
        ErrorCode.BAD_REQUEST,
        'tokenIds array cannot be empty'
      );
    }

    // Validate each token ID
    for (let i = 0; i < tokenIds.length; i++) {
      const tokenId = tokenIds[i];
      if (typeof tokenId !== 'string' || tokenId.trim() === '') {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          `tokenIds[${i}] must be a non-empty string`
        );
      }
    }

    // Check for duplicates
    const uniqueTokenIds = new Set(tokenIds);
    if (uniqueTokenIds.size !== tokenIds.length) {
      throw new ValidationError(
        ErrorCode.BAD_REQUEST,
        'tokenIds array contains duplicate values'
      );
    }
  }
}

// Export singleton instance
export const orderbookService = new OrderbookService();

