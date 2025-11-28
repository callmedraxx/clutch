/**
 * Background polling service for Polymarket data
 * Polls endpoints at category-specific intervals
 */

import { logger } from '../../config/logger';
import { polymarketClient } from './polymarket.client';
import { transformEvents, mergePollingData } from './polymarket.transformer';
import { getCache, setCache } from '../../utils/cache';
import {
  Category,
  PolymarketApiResponse,
  EndpointConfig,
  EventsQueryParams,
} from './polymarket.types';
import { injectedUrlsService } from './injected-urls.service';
import { getCacheKey } from './polymarket.service';

const POLLING_INTERVALS: Record<Category, number> = {
  trending: parseInt(process.env.POLYMARKET_POLLING_INTERVAL_TRENDING || '30', 10),
  politics: parseInt(process.env.POLYMARKET_POLLING_INTERVAL_POLITICS || '45', 10),
  crypto: parseInt(process.env.POLYMARKET_POLLING_INTERVAL_CRYPTO || '20', 10),
  finance: parseInt(process.env.POLYMARKET_POLLING_INTERVAL_FINANCE || '60', 10),
  sports: parseInt(process.env.POLYMARKET_POLLING_INTERVAL_SPORTS || '60', 10),
};

const POLLING_ENDPOINT_INTERVAL = 15; // seconds for polling endpoints like /events?tag_id=xxx

/**
 * Polling Service
 */
export class PollingService {
  private intervals: Map<Category, NodeJS.Timeout> = new Map();
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;

  /**
   * Start polling for all categories
   */
  start(): void {
    if (this.isRunning) {
      logger.warn({
        message: 'Polling service already running',
      });
      return;
    }

    this.isRunning = true;
    logger.info({
      message: 'Starting polling service',
      intervals: POLLING_INTERVALS,
    });

    // Start polling for each category
    const categories: Category[] = ['trending', 'politics', 'crypto', 'finance', 'sports'];
    for (const category of categories) {
      this.startCategoryPolling(category);
    }

    // Start polling for special polling endpoints
    this.startPollingEndpoints();
  }

  /**
   * Stop all polling
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logger.info({
      message: 'Stopping polling service',
    });

    // Clear all intervals
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();

    for (const interval of this.pollingIntervals.values()) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();
  }

  /**
   * Start polling for a specific category
   */
  private startCategoryPolling(category: Category): void {
    const interval = POLLING_INTERVALS[category];

    // Poll immediately
    this.pollCategory(category);

    // Then poll at interval
    const timer = setInterval(() => {
      this.pollCategory(category);
    }, interval * 1000);

    this.intervals.set(category, timer);

    logger.info({
      message: 'Started category polling',
      category,
      intervalSeconds: interval,
    });
  }

  /**
   * Poll a specific category
   */
  private async pollCategory(category: Category): Promise<void> {
    try {
      logger.info({
        message: 'Polling category',
        category,
      });

      // Get endpoint config for category
      const config: EndpointConfig = this.getCategoryConfig(category);

      // Fetch data
      const response = await polymarketClient.get<PolymarketApiResponse>(
        config.path,
        config.params
      );

      // Transform data
      let transformedEvents = transformEvents(response.data || []);

      // For trending category, also poll injected URLs and merge
      if (category === 'trending') {
        const injectedEvents = await this.pollInjectedUrls();
        if (injectedEvents.length > 0) {
          transformedEvents = mergePollingData(transformedEvents, injectedEvents);
        }
      }

      // Create base params from config to match the API call parameters
      const baseParams: EventsQueryParams = {
        category,
        limit: config.params.limit as number,
        offset: 0,
        order: config.params.order as any,
        active: config.params.active as boolean,
        archived: config.params.archived as boolean,
        closed: config.params.closed as boolean,
        ascending: config.params.ascending as boolean,
      };

      // Add category-specific parameters
      if (config.params.tag_slug) {
        baseParams.tag_slug = config.params.tag_slug as string;
      }
      if (config.params.tag_id) {
        baseParams.tag_id = config.params.tag_id as string;
      }
      if (config.params.end_date_min) {
        baseParams.end_date_min = config.params.end_date_min as string;
      }

      // Update cache for different offsets with the default limit
      const offsets = [0, 20, 40];
      const defaultLimit = 20;
      for (const offset of offsets) {
        const cacheParams: EventsQueryParams = {
          ...baseParams,
          limit: defaultLimit,
          offset,
        };
        const cacheKey = getCacheKey(cacheParams);
        
        // Get existing cached data
        try {
          const cached = await getCache(cacheKey);
          if (cached) {
            const cachedData = JSON.parse(cached);
            const merged = mergePollingData(cachedData.events || [], transformedEvents);
            
            // Update pagination
            const totalResults = merged.length;
            const paginatedEvents = merged.slice(offset, offset + defaultLimit);
            const hasMore = offset + defaultLimit < totalResults;

            const updatedData = {
              events: paginatedEvents,
              pagination: {
                hasMore,
                totalResults,
                offset,
                limit: defaultLimit,
              },
            };

            await setCache(cacheKey, JSON.stringify(updatedData), 30);
          } else {
            // If no cache, create new cache entry
            const totalResults = transformedEvents.length;
            const paginatedEvents = transformedEvents.slice(offset, offset + defaultLimit);
            const hasMore = offset + defaultLimit < totalResults;

            const newData = {
              events: paginatedEvents,
              pagination: {
                hasMore,
                totalResults,
                offset,
                limit: defaultLimit,
              },
            };

            await setCache(cacheKey, JSON.stringify(newData), 30);
          }
        } catch (error) {
          logger.warn({
            message: 'Error updating cache during polling',
            category,
            offset,
            cacheKey,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info({
        message: 'Category polling completed',
        category,
        eventCount: transformedEvents.length,
      });
    } catch (error) {
      logger.error({
        message: 'Error polling category',
        category,
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue polling even on error
    }
  }

  /**
   * Poll all injected URLs and return transformed events
   */
  private async pollInjectedUrls(): Promise<any[]> {
    const injectedUrls = injectedUrlsService.getAllUrls();
    
    if (injectedUrls.length === 0) {
      return [];
    }

    logger.info({
      message: 'Polling injected URLs',
      count: injectedUrls.length,
    });

    const allEvents: any[] = [];

    // Poll each injected URL
    for (const injectedUrl of injectedUrls) {
      try {
        logger.info({
          message: 'Polling injected URL',
          id: injectedUrl.id,
          path: injectedUrl.path,
          params: injectedUrl.params,
        });

        // Use the full URL path and params
        const response = await polymarketClient.get<any>(
          injectedUrl.path,
          injectedUrl.params
        );

        // Handle both wrapped response {data: [...]} and direct array [...]
        let events: any[] = [];
        if (Array.isArray(response)) {
          events = response;
        } else if (response?.data && Array.isArray(response.data)) {
          events = response.data;
        } else if (response?.data) {
          // Single event wrapped in data
          events = [response.data];
        }

        // Transform the events
        const transformedEvents = transformEvents(events);
        allEvents.push(...transformedEvents);

        logger.info({
          message: 'Injected URL polled successfully',
          id: injectedUrl.id,
          eventCount: transformedEvents.length,
        });
      } catch (error) {
        logger.error({
          message: 'Error polling injected URL',
          id: injectedUrl.id,
          url: injectedUrl.url,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with other URLs even if one fails
      }
    }

    logger.info({
      message: 'Injected URLs polling completed',
      urlCount: injectedUrls.length,
      totalEventCount: allEvents.length,
    });

    return allEvents;
  }

  /**
   * Start polling for special polling endpoints
   */
  private startPollingEndpoints(): void {
    // Crypto polling endpoint
    const cryptoPollingKey = 'crypto-polling';
    const cryptoTimer = setInterval(() => {
      this.pollPollingEndpoint('/events', {
        tag_id: '102531',
        closed: false,
        limit: 100,
      }, cryptoPollingKey);
    }, POLLING_ENDPOINT_INTERVAL * 1000);

    this.pollingIntervals.set(cryptoPollingKey, cryptoTimer);

    logger.info({
      message: 'Started polling endpoints',
      intervalSeconds: POLLING_ENDPOINT_INTERVAL,
    });
  }

  /**
   * Poll a specific polling endpoint
   */
  private async pollPollingEndpoint(
    path: string,
    params: Record<string, any>,
    _key: string
  ): Promise<void> {
    try {
      logger.info({
        message: 'Polling endpoint',
        path,
        params,
      });

      const response = await polymarketClient.get<PolymarketApiResponse>(path, params);
      const transformedEvents = transformEvents(response.data || []);

      // Create params object for cache key generation
      // This is for crypto category with tag_id
      const baseParams: EventsQueryParams = {
        category: 'crypto',
        limit: 20,
        offset: 0,
        active: params.active as boolean | undefined,
        closed: params.closed as boolean | undefined,
      };

      // Add tag_id if present
      if (params.tag_id) {
        baseParams.tag_id = params.tag_id as string;
      }

      // Update cache for crypto category with different offsets
      const offsets = [0, 20, 40];
      const defaultLimit = 20;
      for (const offset of offsets) {
        const cacheParams: EventsQueryParams = {
          ...baseParams,
          offset,
        };
        const cacheKey = getCacheKey(cacheParams);
        
        try {
          const cached = await getCache(cacheKey);
          if (cached) {
            const cachedData = JSON.parse(cached);
            const merged = mergePollingData(cachedData.events || [], transformedEvents);
            
            const totalResults = merged.length;
            const paginatedEvents = merged.slice(offset, offset + defaultLimit);
            const hasMore = offset + defaultLimit < totalResults;

            const updatedData = {
              events: paginatedEvents,
              pagination: {
                hasMore,
                totalResults,
                offset,
                limit: defaultLimit,
              },
            };

            await setCache(cacheKey, JSON.stringify(updatedData), 30);
          }
        } catch (error) {
          logger.warn({
            message: 'Error updating cache during polling endpoint',
            path,
            offset,
            cacheKey,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info({
        message: 'Polling endpoint completed',
        path,
        eventCount: transformedEvents.length,
      });
    } catch (error) {
      logger.error({
        message: 'Error polling endpoint',
        path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get endpoint config for category
   */
  private getCategoryConfig(category: Category): EndpointConfig {
    const baseParams = {
      limit: 50,
      active: true,
      archived: false,
      closed: false,
      order: 'volume24hr' as const,
      ascending: false,
      offset: 0,
    };

    switch (category) {
      case 'trending':
        return {
          path: '/events/pagination',
          params: baseParams,
        };

      case 'politics':
        return {
          path: '/events/pagination',
          params: {
            ...baseParams,
            tag_slug: 'politics',
          },
        };

      case 'crypto':
        return {
          path: '/events/pagination',
          params: {
            ...baseParams,
            tag_slug: '15M',
          },
        };

      case 'finance':
        return {
          path: '/events/pagination',
          params: {
            ...baseParams,
            tag_id: '120',
            end_date_min: new Date().toISOString(),
          },
        };

      case 'sports':
        return {
          path: '/events/pagination',
          params: {
            ...baseParams,
            tag_slug: 'sports',
            order: 'volume',
          },
        };

      default:
        return {
          path: '/events/pagination',
          params: baseParams,
        };
    }
  }
}

// Export singleton instance
export const pollingService = new PollingService();

