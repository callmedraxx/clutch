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
import { injectedUrlsService } from './injected-urls.service';

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
 * Includes all relevant query parameters to ensure cache uniqueness
 */
export function getCacheKey(params: EventsQueryParams): string {
  const category = params.category || 'trending';
  const limit = params.limit || 20;
  const offset = params.offset || 0;

  // Create a normalized params object with only the parameters that affect results
  // Sort keys to ensure consistent cache keys
  const cacheParams: Record<string, string | number | boolean | undefined> = {
    category,
    limit,
    offset,
    order: params.order,
    tag_slug: params.tag_slug,
    tag_id: params.tag_id,
    active: params.active,
    archived: params.archived,
    closed: params.closed,
    ascending: params.ascending,
    end_date_min: params.end_date_min,
    events_status: params.events_status,
    sort: params.sort,
    recurrence: params.recurrence,
  };

  // Create a deterministic string representation
  // Filter out undefined values and sort keys for consistency
  const filteredParams: Record<string, string | number | boolean> = {};
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

  // Use a hash-like approach: create a short identifier from the params
  // For cache keys, we'll use the full string but limit length if needed
  return `polymarket:events:${paramString}`;
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
    const cacheKey = getCacheKey(params);
    logger.debug({
      message: 'Cache key generated',
      cacheKey,
      params,
    });
    try {
      const cached = await getCache(cacheKey);
      if (cached) {
        logger.info({
          message: 'Cache hit',
          category,
          offset,
          limit,
          cacheKey,
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

      // For trending category, also fetch and merge injected URLs
      if (category === 'trending') {
        try {
          const injectedEvents = await this.fetchInjectedUrls();
          if (injectedEvents.length > 0) {
            transformedEvents = mergePollingData(transformedEvents, injectedEvents);
            logger.info({
              message: 'Merged injected URL events with trending',
              injectedEventCount: injectedEvents.length,
              totalEventCount: transformedEvents.length,
            });
          }
        } catch (error) {
          logger.warn({
            message: 'Error fetching injected URLs, continuing with main data',
            error: error instanceof Error ? error.message : String(error),
          });
        }
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
          // Create a basic params object for cache lookup
          const cacheParams: EventsQueryParams = {
            category,
            limit: 50,
            offset: 0,
          };
          const cacheKey = getCacheKey(cacheParams);
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
      // New format: polymarket:events:category:${category}|limit:...|offset:...|...
      // Since keys are sorted alphabetically, category will be first
      // Pattern matches: polymarket:events:category:${category}*
      const pattern = `polymarket:events:category:${category}*`;
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
   * Fetch events from all injected URLs
   */
  private async fetchInjectedUrls(): Promise<TransformedEvent[]> {
    const injectedUrls = injectedUrlsService.getAllUrls();
    
    if (injectedUrls.length === 0) {
      return [];
    }

    logger.info({
      message: 'Fetching injected URLs',
      count: injectedUrls.length,
    });

    const allEvents: TransformedEvent[] = [];

    // Fetch from each injected URL
    for (const injectedUrl of injectedUrls) {
      try {
        logger.info({
          message: 'Fetching injected URL',
          id: injectedUrl.id,
          path: injectedUrl.path,
          params: injectedUrl.params,
        });

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

        const transformedEvents = transformEvents(events);
        allEvents.push(...transformedEvents);

        logger.info({
          message: 'Injected URL fetched successfully',
          id: injectedUrl.id,
          eventCount: transformedEvents.length,
        });
      } catch (error) {
        logger.error({
          message: 'Error fetching injected URL',
          id: injectedUrl.id,
          url: injectedUrl.url,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with other URLs even if one fails
      }
    }

    logger.info({
      message: 'Injected URLs fetch completed',
      urlCount: injectedUrls.length,
      totalEventCount: allEvents.length,
    });

    return allEvents;
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

