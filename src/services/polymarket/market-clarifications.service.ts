/**
 * Market Clarifications Service
 * Fetches market clarifications from Polymarket Gamma API
 */

import { logger } from '../../config/logger';
import { polymarketClient } from './polymarket.client';
import {
  MarketClarificationResult,
  MarketClarificationsResults,
  MarketClarificationsResponse,
} from './polymarket.types';
import { PolymarketError, ErrorCode } from '../../utils/errors';

/**
 * Market Clarifications Service
 */
export class MarketClarificationsService {
  /**
   * Fetch clarifications for a single market
   */
  async getMarketClarification(marketId: string): Promise<MarketClarificationResult> {
    try {
      logger.info({
        message: 'Fetching market clarification',
        marketId,
      });

      // Validate market ID
      if (!marketId || typeof marketId !== 'string' || marketId.trim() === '') {
        throw new PolymarketError(
          ErrorCode.BAD_REQUEST,
          `Invalid market ID: ${marketId}`
        );
      }

      // Fetch from API
      const response = await polymarketClient.get<MarketClarificationsResponse>(
        '/market-clarifications',
        { market_id: marketId.trim() }
      );

      // The API returns an array directly
      const clarifications = Array.isArray(response) ? response : [];

      logger.info({
        message: 'Market clarification fetched successfully',
        marketId,
        clarificationCount: clarifications.length,
      });

      return {
        marketId,
        clarifications,
        status: 'success',
      };
    } catch (error) {
      logger.error({
        message: 'Error fetching market clarification',
        marketId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Determine error message
      let errorMessage = 'Failed to fetch market clarification';
      if (error instanceof PolymarketError) {
        errorMessage = error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      return {
        marketId,
        clarifications: [],
        status: 'error',
        error: errorMessage,
      };
    }
  }

  /**
   * Fetch clarifications for multiple markets in parallel
   */
  async getMarketClarifications(marketIds: string[]): Promise<MarketClarificationsResults> {
    logger.info({
      message: 'Fetching market clarifications',
      marketCount: marketIds.length,
    });

    // Validate market IDs
    const validMarketIds = marketIds
      .filter((id) => id && typeof id === 'string' && id.trim() !== '')
      .map((id) => id.trim());

    if (validMarketIds.length === 0) {
      logger.warn({
        message: 'No valid market IDs provided',
        marketIds,
      });

      return {
        results: [],
      };
    }

    // Make parallel requests using Promise.allSettled to handle partial failures
    const promises = validMarketIds.map((marketId) =>
      this.getMarketClarification(marketId)
    );

    const results = await Promise.allSettled(promises);

    // Map results, handling both fulfilled and rejected promises
    const clarificationResults: MarketClarificationResult[] = results.map((result, index) => {
      const marketId = validMarketIds[index];

      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // This shouldn't happen since getMarketClarification catches errors,
        // but handle it just in case
        logger.error({
          message: 'Unexpected error in market clarification request',
          marketId,
          error: result.reason,
        });

        return {
          marketId,
          clarifications: [],
          status: 'error',
          error: result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
        };
      }
    });

    logger.info({
      message: 'Market clarifications fetched',
      total: clarificationResults.length,
      successful: clarificationResults.filter((r) => r.status === 'success').length,
      failed: clarificationResults.filter((r) => r.status === 'error').length,
    });

    return {
      results: clarificationResults,
    };
  }
}

// Export singleton instance
export const marketClarificationsService = new MarketClarificationsService();

