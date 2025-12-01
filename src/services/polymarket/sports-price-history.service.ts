/**
 * Sports Price History Service
 * Handles fetching price history from Polymarket CLOB API for sports games
 * Uses different fidelity mapping than regular price history
 */

import { logger } from '../../config/logger';
import { polymarketClient } from './polymarket.client';
import { PriceHistoryResponse } from './polymarket.types';
import { ValidationError, ErrorCode } from '../../utils/errors';
import { getCache, setCache } from '../../utils/cache';

/**
 * Map interval to fidelity value for sports games
 * 1h, 6h, 1d use interval mode
 * 1w, 1m use startTs mode with fidelity=30
 */
const SPORTS_INTERVAL_FIDELITY_MAP: Record<string, number> = {
  '1h': 1,
  '6h': 1,
  '1d': 5,
  '1w': 30,
  '1m': 30,
};

/**
 * Intervals that require startTs mode (use startDate parameter)
 */
const STARTTS_INTERVALS = ['1w', '1m'];

/**
 * Buffer to subtract from startDate when converting to startTs (in seconds)
 */
const STARTTS_BUFFER_SECONDS = 20;

/**
 * Cache TTL for price history (5 minutes / 300 seconds)
 */
const PRICE_HISTORY_CACHE_TTL = 300;

/**
 * Generate cache key for sports price history
 */
function getSportsPriceHistoryCacheKey(
  market: string,
  interval?: string,
  startTs?: number,
  fidelity?: number
): string {
  const cacheParams: Record<string, string | number | undefined> = {
    market,
    interval,
    startTs,
    fidelity,
  };

  // Filter out undefined values and create deterministic string
  const filteredParams: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(cacheParams)) {
    if (value !== undefined) {
      filteredParams[key] = value;
    }
  }

  // Sort keys to ensure consistent ordering
  const sortedKeys = Object.keys(filteredParams).sort();
  const paramString = sortedKeys
    .map((key) => `${key}:${filteredParams[key]}`)
    .join('|');

  return `polymarket:sports-price-history:${paramString}`;
}

/**
 * Sports Price History Service
 */
export class SportsPriceHistoryService {
  /**
   * Get price history for a sports game market
   * @param market - Token ID (market identifier)
   * @param interval - Time interval (1h, 6h, 1d, 1w, 1m)
   * @param startDate - Optional start date (required for 1w and 1m intervals)
   * @returns Price history with transformed probabilities
   */
  async getPriceHistory(
    market: string,
    interval: string,
    startDate?: string
  ): Promise<PriceHistoryResponse & { market: string }> {
    // Validate parameters
    this.validateParams(market, interval, startDate);

    // Determine query parameters based on interval
    let startTs: number | undefined;
    let finalInterval: string | undefined;
    let finalFidelity: number;

    if (STARTTS_INTERVALS.includes(interval)) {
      // For 1w and 1m, use startTs mode with fidelity=30
      if (!startDate) {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          `startDate is required for interval ${interval}`
        );
      }
      startTs = this.convertStartDateToStartTs(startDate);
      finalFidelity = SPORTS_INTERVAL_FIDELITY_MAP[interval]; // 30
    } else {
      // For 1h, 6h, 1d, use interval mode
      finalInterval = interval;
      finalFidelity = SPORTS_INTERVAL_FIDELITY_MAP[interval];
    }

    // Generate cache key
    const cacheKey = getSportsPriceHistoryCacheKey(
      market,
      finalInterval,
      startTs,
      finalFidelity
    );

    // Check cache first
    try {
      const cached = await getCache(cacheKey);
      if (cached) {
        logger.info({
          message: 'Sports price history cache hit',
          market,
          interval,
          cacheKey,
        });
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.warn({
        message: 'Cache read error, continuing with API fetch',
        market,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.info({
      message: 'Fetching sports price history from API',
      market,
      interval,
      startTs,
      fidelity: finalFidelity,
    });

    try {
      // Fetch from CLOB API
      const response = await polymarketClient.getClobPriceHistory(market, {
        startTs,
        interval: finalInterval,
        fidelity: finalFidelity,
      });

      logger.info({
        message: 'Sports price history fetched successfully',
        market,
        historyLength: response.history?.length || 0,
      });

      // Transform price (p) from decimal to percentage (multiply by 100)
      // Keep timestamp (t) as is
      const transformedHistory = (response.history || []).map((point) => ({
        t: point.t, // Keep timestamp unchanged
        p: Math.max(0, Math.min(100, Math.round(point.p * 100))), // Convert decimal to percentage (0-100)
      }));

      const result = {
        history: transformedHistory,
        market,
      };

      // Cache the transformed result
      try {
        await setCache(cacheKey, JSON.stringify(result), PRICE_HISTORY_CACHE_TTL);
        logger.debug({
          message: 'Sports price history cached',
          market,
          cacheKey,
          ttl: PRICE_HISTORY_CACHE_TTL,
        });
      } catch (error) {
        logger.warn({
          message: 'Cache write error, continuing without cache',
          market,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return result;
    } catch (error) {
      logger.error({
        message: 'Error fetching sports price history',
        market,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate query parameters
   */
  private validateParams(
    market: string,
    interval: string,
    startDate?: string
  ): void {
    // Validate market is required
    if (!market || typeof market !== 'string' || market.trim() === '') {
      throw new ValidationError(
        ErrorCode.BAD_REQUEST,
        'market is required and must be a non-empty string'
      );
    }

    // Validate interval
    if (!interval || typeof interval !== 'string') {
      throw new ValidationError(
        ErrorCode.BAD_REQUEST,
        'interval is required and must be a string'
      );
    }

    if (!['1h', '6h', '1d', '1w', '1m'].includes(interval)) {
      throw new ValidationError(
        ErrorCode.BAD_REQUEST,
        'interval must be one of: 1h, 6h, 1d, 1w, 1m'
      );
    }

    // Validate startDate format if provided
    if (startDate) {
      const date = new Date(startDate);
      if (isNaN(date.getTime())) {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'startDate must be a valid ISO date string'
        );
      }
    }
  }

  /**
   * Convert ISO date string to Unix timestamp (seconds) with buffer
   */
  private convertStartDateToStartTs(startDate: string): number {
    const date = new Date(startDate);
    const timestampSeconds = Math.floor(date.getTime() / 1000);
    // Subtract buffer to ensure we capture data from the start
    return timestampSeconds - STARTTS_BUFFER_SECONDS;
  }
}

// Export singleton instance
export const sportsPriceHistoryService = new SportsPriceHistoryService();

