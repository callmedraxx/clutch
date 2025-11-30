/**
 * Sports Props Service
 * Fetches sports prop markets from Polymarket Gamma API
 */

import { logger } from '../../config/logger';
import { polymarketClient } from './polymarket.client';
import { transformEvents } from './polymarket.transformer';
import { getTagIdForSport, isValidSport, getAvailableSports } from './sports-props.config';
import { PolymarketApiResponse, PolymarketEvent, TransformedEventsResponse, TransformedEvent } from './polymarket.types';
import { PolymarketError, ErrorCode, ValidationError } from '../../utils/errors';

/**
 * Fixed parameters for sports props endpoint
 */
const FIXED_LIMIT = 12;
const EXCLUDE_TAG_ID = '100639'; // Excludes game props, only returns sports props
const RELATED_TAGS = true;
const CLOSED = false;
const INCLUDE_BEST_LINES = true;

/**
 * Sports Props Service
 */
export class SportsPropsService {
  /**
   * Fetch sports props markets for a given sport and page
   * @param sport - Sport category name (e.g., 'nfl', 'nba')
   * @param page - Page number (default: 1, min: 1)
   * @returns Transformed events response with pagination
   */
  async getSportsProps(sport: string, page: number = 1): Promise<TransformedEventsResponse> {
    // Validate sport
    if (!sport || typeof sport !== 'string' || sport.trim() === '') {
      throw new ValidationError(
        ErrorCode.BAD_REQUEST,
        'Sport parameter is required and must be a non-empty string'
      );
    }

    // Validate page
    if (page < 1 || !Number.isInteger(page)) {
      throw new ValidationError(
        ErrorCode.BAD_REQUEST,
        `Page must be a positive integer, got ${page}`
      );
    }

    // Check if sport is valid
    if (!isValidSport(sport)) {
      const availableSports = ['nfl', 'nba', 'mlb', 'nhl', 'ufc', 'epl', 'la-liga'].join(', ');
      throw new ValidationError(
        ErrorCode.BAD_REQUEST,
        `Invalid sport: ${sport}. Available sports: ${availableSports}`
      );
    }

    // Get tag_id for sport
    const tagId = getTagIdForSport(sport);
    if (!tagId) {
      throw new ValidationError(
        ErrorCode.BAD_REQUEST,
        `No tag_id found for sport: ${sport}`
      );
    }

    // Calculate offset from page (page 1 = offset 0, page 2 = offset 12, etc.)
    const offset = (page - 1) * FIXED_LIMIT;

    logger.info({
      message: 'Fetching sports props',
      sport,
      page,
      tagId,
      offset,
    });

    try {
      // Build query parameters
      const params: Record<string, string | number | boolean> = {
        tag_id: tagId,
        related_tags: RELATED_TAGS,
        closed: CLOSED,
        limit: FIXED_LIMIT,
        include_best_lines: INCLUDE_BEST_LINES,
        exclude_tag_id: EXCLUDE_TAG_ID,
        offset,
      };

      logger.info({
        message: 'Fetching from Polymarket Gamma API',
        path: '/events',
        params,
      });

      // Fetch from API
      const response = await polymarketClient.get<PolymarketApiResponse | PolymarketEvent[]>(
        '/events',
        params
      );

      // Handle both wrapped response {data: [...]} and direct array [...]
      let events: PolymarketEvent[] = [];
      if (Array.isArray(response)) {
        events = response as PolymarketEvent[];
      } else if (response && 'data' in response) {
        const responseData = (response as PolymarketApiResponse).data;
        if (Array.isArray(responseData)) {
          events = responseData;
        } else if (responseData) {
          // Single event wrapped in data
          events = [responseData];
        }
      }

      // Transform the events
      const transformedEvents = transformEvents(events);

      // Calculate pagination
      const hasMore = transformedEvents.length === FIXED_LIMIT;
      const totalResults = transformedEvents.length; // API doesn't provide total, so we estimate

      logger.info({
        message: 'Sports props fetched successfully',
        sport,
        page,
        eventCount: transformedEvents.length,
        hasMore,
      });

      return {
        events: transformedEvents,
        pagination: {
          hasMore,
          totalResults,
          offset,
          limit: FIXED_LIMIT,
        },
      };
    } catch (error) {
      logger.error({
        message: 'Error fetching sports props',
        sport,
        page,
        tagId,
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
        `Failed to fetch sports props for ${sport}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Fetch sports props for all sports and merge them into a single response
   * Each event will have a `sport` field added for frontend grouping
   * @param page - Page number for each sport (default: 1, min: 1). Page 1 fetches page 1 for all sports, page 2 fetches page 2 for all sports, etc.
   * @param offset - Alternative to page: offset for each sport (mutually exclusive with page)
   * @returns Transformed events response with all sports merged, each event tagged with its sport
   */
  async getAllSportsProps(page?: number, offset?: number): Promise<TransformedEventsResponse & { events: Array<TransformedEvent & { sport: string }> }> {
    // Validate parameters - either page or offset, but not both
    if (page !== undefined && offset !== undefined) {
      throw new ValidationError(
        ErrorCode.BAD_REQUEST,
        'Cannot specify both page and offset. Use either page or offset, not both.'
      );
    }

    // Calculate page from offset if offset is provided
    let actualPage = page;
    if (offset !== undefined) {
      if (offset < 0 || !Number.isInteger(offset)) {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          `Offset must be a non-negative integer, got ${offset}`
        );
      }
      // Convert offset to page (offset 0 = page 1, offset 12 = page 2, etc.)
      actualPage = Math.floor(offset / FIXED_LIMIT) + 1;
    }

    // Default to page 1 if neither is provided
    if (actualPage === undefined) {
      actualPage = 1;
    }

    // Validate page
    if (actualPage < 1 || !Number.isInteger(actualPage)) {
      throw new ValidationError(
        ErrorCode.BAD_REQUEST,
        `Page must be a positive integer, got ${actualPage}`
      );
    }

    const availableSports = getAvailableSports();

    logger.info({
      message: 'Fetching all sports props',
      sports: availableSports,
      page: actualPage,
      offset,
    });

    try {
      // Fetch props for all sports in parallel
      const sportPromises = availableSports.map(async (sport) => {
        try {
          const result = await this.getSportsProps(sport, actualPage!);
          // Add sport field to each event
          const eventsWithSport = result.events.map((event) => ({
            ...event,
            sport,
          }));
          return {
            sport,
            events: eventsWithSport,
            hasMore: result.pagination.hasMore,
            success: true,
          };
        } catch (error) {
          logger.warn({
            message: 'Failed to fetch sports props for sport',
            sport,
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            sport,
            events: [],
            hasMore: false,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });

      const results = await Promise.all(sportPromises);

      // Merge all events into a single array
      const allEvents: Array<TransformedEvent & { sport: string }> = [];
      let totalFetched = 0;
      let totalFailed = 0;
      let sportsWithMore = 0; // Track how many sports still have more data

      for (const result of results) {
        if (result.success) {
          allEvents.push(...result.events);
          totalFetched += result.events.length;
          // Track if this sport has more data
          if (result.hasMore) {
            sportsWithMore++;
          }
        } else {
          totalFailed++;
        }
      }

      // Sort by volume24Hr descending (most active first)
      allEvents.sort((a, b) => (b.volume24Hr || 0) - (a.volume24Hr || 0));

      // Calculate if there's more data
      // If any sport has more data, or if we got a full page worth of results, there might be more
      const expectedMinResults = availableSports.length * FIXED_LIMIT * 0.5; // At least 50% of expected
      const hasMore = sportsWithMore > 0 || allEvents.length >= expectedMinResults;

      // Calculate offset based on page (each page fetches page N for all sports)
      // If offset was provided, use it; otherwise calculate from page
      const calculatedOffset = offset !== undefined 
        ? offset 
        : (actualPage! - 1) * FIXED_LIMIT * availableSports.length;

      logger.info({
        message: 'All sports props fetched successfully',
        totalEvents: allEvents.length,
        totalFetched,
        totalFailed,
        sports: availableSports.length,
        sportsWithMore,
        hasMore,
        page: actualPage,
        offset: calculatedOffset,
      });

      return {
        events: allEvents,
        pagination: {
          hasMore,
          totalResults: allEvents.length,
          offset: calculatedOffset,
          limit: allEvents.length,
        },
      };
    } catch (error) {
      logger.error({
        message: 'Error fetching all sports props',
        page: actualPage,
        offset,
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
        `Failed to fetch all sports props: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

// Export singleton instance
export const sportsPropsService = new SportsPropsService();

