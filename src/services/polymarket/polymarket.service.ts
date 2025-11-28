/**
 * Main Polymarket service
 * Orchestrates data fetching, transformation, merging, and caching
 */

import { logger } from '../../config/logger';
import { polymarketClient } from './polymarket.client';
import { transformEvents, mergePollingData } from './polymarket.transformer';
import { getCache, setCache, deleteCache } from '../../utils/cache';
import { CacheError, ErrorCode } from '../../utils/errors';
import {
  Category,
  EventsQueryParams,
  TransformedEventsResponse,
  TransformedEvent,
  PolymarketApiResponse,
  EndpointConfig,
  SearchQueryParams,
  SearchApiResponse,
  SearchSort,
  EventsStatus,
} from './polymarket.types';

const CACHE_TTL = parseInt(process.env.POLYMARKET_CACHE_TTL || '30', 10);

/**
 * Get endpoint configuration for a category
 * Now supports additional filters from search endpoint
 */
function getEndpointConfig(
  category: Category,
  params: EventsQueryParams
): EndpointConfig {
  const limit = params.limit || 20;
  const offset = params.offset || 0;
  const order = params.order || 'volume24hr';
  const ascending = params.ascending !== undefined ? params.ascending : false;

  // Map sort to order if sort is provided
  // The API accepts string values for order, not just OrderBy types
  let finalOrder: string = order;
  if (params.sort && !order) {
    // Map search sort options to order parameter
    // Note: The API accepts these as strings even though they're not in the OrderBy type
    const sortMap: Record<string, string> = {
      'volume_24hr': 'volume24hr',
      'volume': 'volume',
      'end_date': 'endDate',
      'start_date': 'startDate',
      'closed_time': 'closedTime',
    };
    finalOrder = sortMap[params.sort] || order;
  }

  const baseParams: Record<string, string | number | boolean> = {
    limit,
    active: params.active !== undefined ? params.active : true,
    archived: params.archived !== undefined ? params.archived : false,
    closed: params.closed !== undefined ? params.closed : false,
    order: finalOrder,
    ascending,
    offset,
  };

  // Add recurrence if provided
  if (params.recurrence) {
    baseParams.recurrence = params.recurrence;
  }

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
          tag_slug: params.tag_slug || 'politics',
        },
      };

    case 'crypto':
      return {
        path: '/events/pagination',
        params: {
          ...baseParams,
          tag_slug: params.tag_slug || '15M',
        },
        pollingPath: '/events',
        pollingParams: {
          tag_id: params.tag_id || '102531',
          closed: false,
          limit: 100,
        },
        pollingInterval: 15,
      };

    case 'finance':
      return {
        path: '/events/pagination',
        params: {
          ...baseParams,
          tag_id: params.tag_id || '120',
          end_date_min: params.end_date_min || new Date().toISOString(),
        },
      };

    case 'sports':
      return {
        path: '/events/pagination',
        params: {
          ...baseParams,
          tag_slug: params.tag_slug || 'sports',
          order: params.order || 'volume',
        },
      };

    default:
      return {
        path: '/events/pagination',
        params: baseParams,
      };
  }
}

/**
 * Generate cache key for events
 */
function getCacheKey(category: Category, offset: number, limit: number): string {
  return `polymarket:events:${category}:${offset}:${limit}`;
}

/**
 * Polymarket Service
 */
export class PolymarketService {
  /**
   * Fetch events with caching and transformation
   */
  async getEvents(params: EventsQueryParams): Promise<TransformedEventsResponse> {
    const category = params.category || 'trending';
    const limit = params.limit || 20;
    const offset = params.offset || 0;

    logger.info({
      message: 'Fetching events',
      category,
      limit,
      offset,
    });

    // Check cache first
    const cacheKey = getCacheKey(category, offset, limit);
    try {
      const cached = await getCache(cacheKey);
      if (cached) {
        logger.info({
          message: 'Cache hit',
          category,
          offset,
          limit,
        });
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.warn({
        message: 'Cache read error, continuing with API fetch',
        category,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Fetch from API
    try {
      const config = getEndpointConfig(category, params);
      const endpointConfig = config;

      // Fetch main data
      logger.info({
        message: 'Fetching from Polymarket API',
        path: endpointConfig.path,
        params: endpointConfig.params,
      });

      const mainResponse = await polymarketClient.get<PolymarketApiResponse>(
        endpointConfig.path,
        endpointConfig.params
      );

      // Fetch polling data if configured
      let pollingEvents: TransformedEvent[] = [];
      if (endpointConfig.pollingPath && endpointConfig.pollingParams) {
        try {
          logger.info({
            message: 'Fetching polling data',
            path: endpointConfig.pollingPath,
            params: endpointConfig.pollingParams,
          });

          const pollingResponse = await polymarketClient.get<PolymarketApiResponse>(
            endpointConfig.pollingPath,
            endpointConfig.pollingParams
          );

          pollingEvents = transformEvents(pollingResponse.data || []);
        } catch (error) {
          logger.warn({
            message: 'Polling data fetch failed, continuing with main data',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Transform main data
      let transformedEvents = transformEvents(mainResponse.data || []);

      // Merge polling data if available
      if (pollingEvents.length > 0) {
        transformedEvents = mergePollingData(transformedEvents, pollingEvents);
      }

      // Apply pagination
      const totalResults = transformedEvents.length;
      const paginatedEvents = transformedEvents.slice(offset, offset + limit);
      const hasMore = offset + limit < totalResults;

      const response: TransformedEventsResponse = {
        events: paginatedEvents,
        pagination: {
          hasMore,
          totalResults,
          offset,
          limit,
        },
      };

      // Cache the result
      try {
        await setCache(cacheKey, JSON.stringify(response), CACHE_TTL);
        logger.info({
          message: 'Cached events',
          category,
          offset,
          limit,
          ttl: CACHE_TTL,
        });
      } catch (error) {
        logger.warn({
          message: 'Cache write error',
          category,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      logger.info({
        message: 'Events fetched successfully',
        category,
        count: paginatedEvents.length,
        totalResults,
      });

      return response;
    } catch (error) {
      logger.error({
        message: 'Error fetching events',
        category,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Try to return cached data as fallback
      try {
        const cached = await getCache(cacheKey);
        if (cached) {
          logger.info({
            message: 'Returning cached data as fallback',
            category,
          });
          return JSON.parse(cached);
        }
      } catch (cacheError) {
        logger.error({
          message: 'Cache fallback failed',
          category,
          error: cacheError instanceof Error ? cacheError.message : String(cacheError),
        });
      }

      throw error;
    }
  }

  /**
   * Get single event by ID
   */
  async getEventById(eventId: string): Promise<TransformedEvent | null> {
    logger.info({
      message: 'Fetching event by ID',
      eventId,
    });

    try {
      // Try to find in cache first by searching all categories
      const categories: Category[] = ['trending', 'politics', 'crypto', 'finance', 'sports'];
      
      for (const category of categories) {
        try {
          const cacheKey = getCacheKey(category, 0, 50);
          const cached = await getCache(cacheKey);
          if (cached) {
            const data: TransformedEventsResponse = JSON.parse(cached);
            const event = data.events.find((e) => e.id === eventId);
            if (event) {
              logger.info({
                message: 'Event found in cache',
                eventId,
                category,
              });
              return event;
            }
          }
        } catch (error) {
          // Continue to next category
        }
      }

      // If not in cache, fetch from API
      // This would require a specific endpoint - for now, return null
      logger.warn({
        message: 'Event not found in cache, API endpoint not available',
        eventId,
      });

      return null;
    } catch (error) {
      logger.error({
        message: 'Error fetching event by ID',
        eventId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Refresh cache for a category
   */
  async refreshCache(category: Category): Promise<void> {
    logger.info({
      message: 'Refreshing cache',
      category,
    });

    try {
      // Clear all cache keys for this category
      const pattern = `polymarket:events:${category}:*`;
      const keys = await this.getCacheKeys(pattern);
      
      for (const key of keys) {
        await deleteCache(key);
      }

      logger.info({
        message: 'Cache refreshed',
        category,
        keysDeleted: keys.length,
      });
    } catch (error) {
      logger.error({
        message: 'Error refreshing cache',
        category,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new CacheError(
        ErrorCode.CACHE_WRITE_FAILED,
        `Failed to refresh cache for ${category}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get cache keys matching pattern
   */
  private async getCacheKeys(pattern: string): Promise<string[]> {
    try {
      const { getRedisClient } = await import('../../config/redis');
      const client = await getRedisClient();
      const keys = await client.keys(pattern);
      return keys;
    } catch (error) {
      logger.error({
        message: 'Error getting cache keys',
        pattern,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Map search sort to pagination order parameter
   */
  private mapSortToOrder(sort: SearchSort | undefined): string {
    if (!sort) return 'volume24hr';
    
    const sortMap: Record<SearchSort, string> = {
      volume_24hr: 'volume24hr',
      end_date: 'endDate',
      start_date: 'startDate',
      volume: 'volume',
      liquidity: 'liquidity',
      closed_time: 'closedTime',
      competitive: 'competitive',
    };
    
    return sortMap[sort] || 'volume24hr';
  }

  /**
   * Map search sort to public-search sort parameter
   */
  private mapSortToPublicSearchSort(sort: SearchSort | undefined): string | undefined {
    if (!sort) return 'volume_24hr';
    
    const sortMap: Record<SearchSort, string> = {
      volume_24hr: 'volume_24hr',
      end_date: 'end_date',
      start_date: 'start_date',
      volume: 'volume',
      liquidity: 'liquidity',
      closed_time: 'closed_time',
      competitive: 'volume_24hr', // competitive doesn't use sort param
    };
    
    return sortMap[sort] || 'volume_24hr';
  }

  /**
   * Map events_status to active/archived/closed flags
   */
  private mapEventsStatusToFlags(events_status: EventsStatus | undefined): {
    active: boolean;
    archived: boolean;
    closed: boolean;
  } {
    if (events_status === 'resolved') {
      return {
        active: true,
        archived: false,
        closed: true,
      };
    }
    
    // Default to active
    return {
      active: true,
      archived: false,
      closed: false,
    };
  }

  /**
   * Search events with various filters
   */
  async searchEvents(params: SearchQueryParams): Promise<TransformedEventsResponse> {
    const q = params.q;
    const page = params.page || 1;
    const limit_per_type = params.limit_per_type || 20;
    const type = params.type || 'events';
    const events_status = params.events_status || 'active';
    const sort = params.sort || 'volume_24hr';
    const ascending = params.ascending !== undefined ? params.ascending : false;
    const recurrence = params.recurrence;
    const tag_slug = params.tag_slug;

    logger.info({
      message: 'Searching events',
      q,
      page,
      limit_per_type,
      type,
      events_status,
      sort,
      ascending,
      recurrence,
      tag_slug,
    });

    // Validate that at least one search parameter is provided
    if (!q && !tag_slug && !recurrence) {
      logger.warn({
        message: 'No search parameters provided',
      });
      return {
        events: [],
        pagination: {
          hasMore: false,
          totalResults: 0,
          offset: (page - 1) * limit_per_type,
          limit: limit_per_type,
        },
      };
    }

    try {
      // Determine which endpoint to use
      const usePaginationEndpoint = !!recurrence || !!tag_slug;
      
      if (usePaginationEndpoint) {
        // Use /events/pagination endpoint
        const flags = this.mapEventsStatusToFlags(events_status);
        const order = this.mapSortToOrder(sort);
        const offset = (page - 1) * limit_per_type;
        
        // Handle status-based sorting: if closed=true, default to closedTime unless another sort is specified
        let finalOrder = order;
        if (flags.closed && sort === 'volume_24hr') {
          // For closed/resolved events, default to closedTime sort
          finalOrder = 'closedTime';
        }
        
        const paginationParams: Record<string, string | number | boolean> = {
          limit: limit_per_type,
          active: flags.active,
          archived: flags.archived,
          closed: flags.closed,
          order: finalOrder,
          ascending,
          offset,
        };

        if (recurrence) {
          paginationParams.recurrence = recurrence;
        }

        if (tag_slug) {
          paginationParams.tag_slug = tag_slug;
        }

        logger.info({
          message: 'Fetching from Polymarket pagination endpoint',
          path: '/events/pagination',
          params: paginationParams,
        });

        const response = await polymarketClient.get<PolymarketApiResponse>(
          '/events/pagination',
          paginationParams
        );

        // Transform the response
        const transformedEvents = transformEvents(response.data || []);

        // Map pagination
        const pagination = response.pagination || { hasMore: false, totalResults: 0 };
        const totalResults = pagination.totalResults;
        const hasMore = pagination.hasMore;

        return {
          events: transformedEvents,
          pagination: {
            hasMore,
            totalResults,
            offset,
            limit: limit_per_type,
          },
        };
      } else {
        // Use /public-search endpoint
        const publicSearchSort = this.mapSortToPublicSearchSort(sort);
        const presets = params.presets || ['EventsTitle', 'Events'];
        
        const searchParams: Record<string, string | number | boolean | string[]> = {
          q: q || '',
          page,
          limit_per_type,
          type,
          events_status,
          sort: publicSearchSort || 'volume_24hr',
          ascending,
          presets, // Axios will convert array to multiple query params
        };

        logger.info({
          message: 'Fetching from Polymarket public-search endpoint',
          path: '/public-search',
          params: searchParams,
        });

        const response = await polymarketClient.get<SearchApiResponse>(
          '/public-search',
          searchParams
        );

        // Transform the response
        const transformedEvents = transformEvents(response.events || []);

        // Map pagination from public-search format
        const pagination = response.pagination || { hasMore: false, totalResults: 0 };
        const totalResults = pagination.totalResults;
        const hasMore = pagination.hasMore;
        const offset = (page - 1) * limit_per_type;

        return {
          events: transformedEvents,
          pagination: {
            hasMore,
            totalResults,
            offset,
            limit: limit_per_type,
          },
        };
      }
    } catch (error) {
      logger.error({
        message: 'Error searching events',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        params,
      });

      // Return empty results instead of throwing error for invalid filter combinations
      logger.warn({
        message: 'Returning empty results due to error',
        params,
      });

      return {
        events: [],
        pagination: {
          hasMore: false,
          totalResults: 0,
          offset: (page - 1) * limit_per_type,
          limit: limit_per_type,
        },
      };
    }
  }
}

// Export singleton instance
export const polymarketService = new PolymarketService();

