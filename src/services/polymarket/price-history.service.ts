/**
 * Price History Service
 * Handles fetching price history from Polymarket CLOB API
 */

import { logger } from '../../config/logger';
import { polymarketClient } from './polymarket.client';
import {
  PriceHistoryQueryParams,
  PriceHistoryResponse,
  PriceHistoryInterval,
} from './polymarket.types';
import { ValidationError, ErrorCode } from '../../utils/errors';
import { getCache, setCache } from '../../utils/cache';

/**
 * Map interval to default fidelity value
 */
const INTERVAL_FIDELITY_MAP: Record<PriceHistoryInterval, number> = {
  '1h': 1,
  '6h': 1,
  '1d': 5,
  '1w': 30,
  '1m': 180,
};

/**
 * Default fidelity for startTs mode
 */
const DEFAULT_STARTTS_FIDELITY = 720;

/**
 * Buffer to subtract from startDate when converting to startTs (in seconds)
 */
const STARTTS_BUFFER_SECONDS = 20;

/**
 * Cache TTL for price history (5 minutes / 300 seconds)
 * Frontend polls every 30s, so this allows 10 cached responses before refetching
 */
const PRICE_HISTORY_CACHE_TTL = 300;

/**
 * Generate cache key for price history
 */
function getPriceHistoryCacheKey(params: PriceHistoryQueryParams, startTs?: number, interval?: string, fidelity?: number): string {
  const { clobTokenId } = params;
  const cacheParams: Record<string, string | number | undefined> = {
    clobTokenId,
    startTs,
    interval,
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

  return `polymarket:price-history:${paramString}`;
}

/**
 * Price History Service
 */
export class PriceHistoryService {
  /**
   * Get price history for a given clobTokenId
   */
  async getPriceHistory(params: PriceHistoryQueryParams): Promise<PriceHistoryResponse & { clobTokenId: string }> {
    // Validate parameters
    this.validateParams(params);

    const { clobTokenId, startDate, interval, fidelity } = params;

    // Determine query parameters
    let startTs: number | undefined;
    let finalInterval: string | undefined;
    let finalFidelity: number;

    if (startDate) {
      // Convert startDate to startTs with buffer
      startTs = this.convertStartDateToStartTs(startDate);
      finalFidelity = fidelity ?? DEFAULT_STARTTS_FIDELITY;
    } else if (interval) {
      // Use interval mode
      finalInterval = interval;
      finalFidelity = fidelity ?? INTERVAL_FIDELITY_MAP[interval];
    } else {
      // Default to interval mode with 1h if nothing specified
      finalInterval = '1h';
      finalFidelity = fidelity ?? INTERVAL_FIDELITY_MAP['1h'];
    }

    // Generate cache key
    const cacheKey = getPriceHistoryCacheKey(params, startTs, finalInterval, finalFidelity);

    // Check cache first
    try {
      const cached = await getCache(cacheKey);
      if (cached) {
        logger.info({
          message: 'Price history cache hit',
          clobTokenId,
          cacheKey,
        });
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.warn({
        message: 'Cache read error, continuing with API fetch',
        clobTokenId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.info({
      message: 'Fetching price history from API',
      clobTokenId,
      startTs,
      interval: finalInterval,
      fidelity: finalFidelity,
    });

    try {
      // Fetch from CLOB API
      const response = await polymarketClient.getClobPriceHistory(clobTokenId, {
        startTs,
        interval: finalInterval,
        fidelity: finalFidelity,
      });

      logger.info({
        message: 'Price history fetched successfully',
        clobTokenId,
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
        clobTokenId,
      };

      // Cache the transformed result
      try {
        await setCache(cacheKey, JSON.stringify(result), PRICE_HISTORY_CACHE_TTL);
        logger.debug({
          message: 'Price history cached',
          clobTokenId,
          cacheKey,
          ttl: PRICE_HISTORY_CACHE_TTL,
        });
      } catch (error) {
        logger.warn({
          message: 'Cache write error, continuing without cache',
          clobTokenId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return result;
    } catch (error) {
      logger.error({
        message: 'Error fetching price history',
        clobTokenId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate query parameters
   */
  private validateParams(params: PriceHistoryQueryParams): void {
    const { clobTokenId, startDate, interval } = params;

    // Validate clobTokenId is required
    if (!clobTokenId || typeof clobTokenId !== 'string' || clobTokenId.trim() === '') {
      throw new ValidationError(
        ErrorCode.BAD_REQUEST,
        'clobTokenId is required and must be a non-empty string'
      );
    }

    // Validate that startDate and interval are mutually exclusive
    if (startDate && interval) {
      throw new ValidationError(
        ErrorCode.BAD_REQUEST,
        'startDate and interval are mutually exclusive. Provide either startDate or interval, not both.'
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

    // Validate interval if provided
    if (interval && !['1h', '6h', '1d', '1w', '1m'].includes(interval)) {
      throw new ValidationError(
        ErrorCode.BAD_REQUEST,
        'interval must be one of: 1h, 6h, 1d, 1w, 1m'
      );
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
export const priceHistoryService = new PriceHistoryService();

