/**
 * Polymarket API routes
 * Handles requests for market events with validation and error handling
 */

import { Router, Request, Response, NextFunction } from 'express';
import { polymarketService } from '../services/polymarket/polymarket.service';
import { marketClarificationsService } from '../services/polymarket/market-clarifications.service';
import { priceHistoryService } from '../services/polymarket/price-history.service';
import { sportsPropsService } from '../services/polymarket/sports-props.service';
import { seriesSummaryService } from '../services/polymarket/series-summary.service';
import { teamsService } from '../services/polymarket/teams.service';
import { gameEventsService } from '../services/polymarket/game-events.service';
import { orderbookService } from '../services/polymarket/orderbook.service';
import { sportsPriceHistoryService } from '../services/polymarket/sports-price-history.service';
import { getLeagueForSport } from '../services/polymarket/teams.config';
import { ValidationError, ErrorCode, createErrorResponse } from '../utils/errors';
import { logger } from '../config/logger';
import {
  Category,
  OrderBy,
  EventsQueryParams,
  SearchQueryParams,
  SearchSort,
  EventsStatus,
  Recurrence,
  PriceHistoryQueryParams,
  PriceHistoryInterval,
} from '../services/polymarket/polymarket.types';
import { injectedUrlsService } from '../services/polymarket/injected-urls.service';

const router = Router();

/**
 * Validate category
 */
function validateCategory(category: string | undefined): Category | null {
  if (!category) return null;
  const validCategories: Category[] = ['trending', 'politics', 'crypto', 'finance', 'sports'];
  return validCategories.includes(category as Category) ? (category as Category) : null;
}

/**
 * Validate limit
 */
function validateLimit(limit: string | undefined): number | null {
  if (!limit) return null;
  const num = parseInt(limit, 10);
  if (isNaN(num) || num < 20 || num > 50) {
    return null;
  }
  return num;
}

/**
 * Validate offset
 */
function validateOffset(offset: string | undefined): number | null {
  if (!offset) return null;
  const num = parseInt(offset, 10);
  if (isNaN(num) || num < 0) {
    return null;
  }
  return num;
}

/**
 * Validate order
 */
function validateOrder(order: string | undefined): OrderBy | null {
  if (!order) return null;
  const validOrders: OrderBy[] = ['volume24hr', 'volume', 'featuredOrder'];
  return validOrders.includes(order as OrderBy) ? (order as OrderBy) : null;
}

/**
 * Validate events status
 */
function validateEventsStatusForEvents(status: string | undefined): EventsStatus | null {
  if (!status) return null;
  const validStatuses: EventsStatus[] = ['active', 'resolved'];
  return validStatuses.includes(status as EventsStatus) ? (status as EventsStatus) : null;
}

/**
 * Validate recurrence for events endpoint
 */
function validateRecurrenceForEvents(recurrence: string | undefined): Recurrence | null {
  if (!recurrence) return null;
  const validRecurrences: Recurrence[] = ['daily', 'weekly', 'monthly'];
  return validRecurrences.includes(recurrence as Recurrence) ? (recurrence as Recurrence) : null;
}

/**
 * Validate query parameters
 */
function validateQueryParams(req: Request): EventsQueryParams {
  const category = validateCategory(req.query.category as string);
  const limit = validateLimit(req.query.limit as string);
  const offset = validateOffset(req.query.offset as string);
  const order = validateOrder(req.query.order as string);
  const tag_slug = req.query.tag_slug as string | undefined;
  const tag_id = req.query.tag_id as string | undefined;
  const active = req.query.active !== undefined ? req.query.active === 'true' : undefined;
  const archived = req.query.archived !== undefined ? req.query.archived === 'true' : undefined;
  const closed = req.query.closed !== undefined ? req.query.closed === 'true' : undefined;
  const ascending = req.query.ascending !== undefined ? req.query.ascending === 'true' : undefined;
  const end_date_min = req.query.end_date_min as string | undefined;
  
  // Additional filters from search endpoint
  const events_status = validateEventsStatusForEvents(req.query.events_status as string);
  const sort = validateSearchSort(req.query.sort as string);
  const recurrence = validateRecurrenceForEvents(req.query.recurrence as string);

  // Validate required parameters
  if (limit !== null && (limit < 20 || limit > 50)) {
    throw new ValidationError(
      ErrorCode.INVALID_LIMIT,
      `Limit must be between 20 and 50, got ${limit}`
    );
  }

  if (offset !== null && offset < 0) {
    throw new ValidationError(
      ErrorCode.INVALID_OFFSET,
      `Offset must be non-negative, got ${offset}`
    );
  }

  if (order !== null && !['volume24hr', 'volume', 'featuredOrder'].includes(order)) {
    throw new ValidationError(
      ErrorCode.INVALID_ORDER,
      `Invalid order: ${order}`
    );
  }

  // Map events_status to active/closed flags if provided
  let finalActive = active;
  let finalClosed = closed;
  if (events_status) {
    if (events_status === 'resolved') {
      finalClosed = true;
      finalActive = false;
    } else if (events_status === 'active') {
      finalClosed = false;
      finalActive = true;
    }
  }

  // Use sort if provided, otherwise use order
  const finalOrder = sort ? undefined : (order ?? undefined);
  const finalSort = sort;

  return {
    category: category || 'trending',
    limit: limit || undefined,
    offset: offset || undefined,
    order: finalOrder,
    tag_slug,
    tag_id,
    active: finalActive,
    archived,
    closed: finalClosed,
    ascending,
    end_date_min,
    events_status: events_status || undefined,
    sort: finalSort || undefined,
    recurrence: recurrence || undefined,
  };
}

/**
 * @swagger
 * /api/polymarket/events:
 *   get:
 *     summary: Fetch market events with optional filtering and pagination
 *     description: Returns transformed and grouped events data. Markets are grouped by event, and data is cleaned and standardized for frontend consumption.
 *     tags: [Polymarket]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [trending, politics, crypto, finance, sports]
 *           default: trending
 *         description: Event category
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 20
 *           maximum: 50
 *           default: 20
 *         description: Number of events to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Pagination offset
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [volume24hr, volume, featuredOrder]
 *           default: volume24hr
 *         description: Sort order
 *       - in: query
 *         name: tag_slug
 *         schema:
 *           type: string
 *         description: Filter by tag slug
 *       - in: query
 *         name: tag_id
 *         schema:
 *           type: string
 *         description: Filter by tag ID
 *     responses:
 *       200:
 *         description: Events fetched successfully (transformed data)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     events:
 *                       type: array
 *                       description: Transformed events with grouped markets
 *                       items:
 *                         $ref: '#/components/schemas/TransformedEvent'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: Service unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/events',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info({
        message: 'Events request received',
        query: req.query,
        ip: req.ip,
      });

      // Validate query parameters
      const params = validateQueryParams(req);

      // Fetch events
      const result = await polymarketService.getEvents(params);

      logger.info({
        message: 'Events request completed',
        category: params.category,
        eventCount: result.events.length,
        hasMore: result.pagination.hasMore,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error({
        message: 'Error in events endpoint',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        query: req.query,
      });

      if (error instanceof ValidationError) {
        const errorResponse = createErrorResponse(error);
        res.status(errorResponse.statusCode).json({
          success: false,
          error: errorResponse,
        });
        return;
      }

      next(error);
    }
  }
);

/**
 * @swagger
 * /api/polymarket/events/{eventId}:
 *   get:
 *     summary: Get single event by ID
 *     tags: [Polymarket]
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event found
 *       404:
 *         description: Event not found
 */
router.get(
  '/events/:eventId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const eventId = req.params.eventId;

      logger.info({
        message: 'Event by ID request received',
        eventId,
        ip: req.ip,
      });

      if (!eventId) {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'Event ID is required'
        );
      }

      const event = await polymarketService.getEventById(eventId);

      if (!event) {
        const errorResponse = createErrorResponse(
          new ValidationError(ErrorCode.NOT_FOUND, `Event ${eventId} not found`)
        );
        res.status(errorResponse.statusCode).json({
          success: false,
          error: errorResponse,
        });
        return;
      }

      logger.info({
        message: 'Event by ID request completed',
        eventId,
      });

      res.json({
        success: true,
        data: { event },
      });
    } catch (error) {
      logger.error({
        message: 'Error in event by ID endpoint',
        error: error instanceof Error ? error.message : String(error),
        eventId: req.params.eventId,
      });

      if (error instanceof ValidationError) {
        const errorResponse = createErrorResponse(error);
        res.status(errorResponse.statusCode).json({
          success: false,
          error: errorResponse,
        });
        return;
      }

      next(error);
    }
  }
);

/**
 * @swagger
 * /api/polymarket/refresh/{category}:
 *   post:
 *     summary: Force refresh cache for a category
 *     tags: [Polymarket]
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *           enum: [trending, politics, crypto, finance, sports]
 *         description: Category to refresh
 *     responses:
 *       200:
 *         description: Cache refreshed successfully
 *       400:
 *         description: Invalid category
 */
router.post(
  '/refresh/:category',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const category = req.params.category as Category;

      logger.info({
        message: 'Refresh cache request received',
        category,
        ip: req.ip,
      });

      if (!validateCategory(category)) {
        throw new ValidationError(
          ErrorCode.INVALID_CATEGORY,
          `Invalid category: ${category}`
        );
      }

      await polymarketService.refreshCache(category);

      logger.info({
        message: 'Cache refreshed',
        category,
      });

      res.json({
        success: true,
        message: `Cache refreshed for category: ${category}`,
      });
    } catch (error) {
      logger.error({
        message: 'Error in refresh cache endpoint',
        error: error instanceof Error ? error.message : String(error),
        category: req.params.category,
      });

      if (error instanceof ValidationError) {
        const errorResponse = createErrorResponse(error);
        res.status(errorResponse.statusCode).json({
          success: false,
          error: errorResponse,
        });
        return;
      }

      next(error);
    }
  }
);

/**
 * Validate search sort
 */
function validateSearchSort(sort: string | undefined): SearchSort | null {
  if (!sort) return null;
  const validSorts: SearchSort[] = ['volume_24hr', 'end_date', 'start_date', 'volume', 'liquidity', 'closed_time', 'competitive'];
  return validSorts.includes(sort as SearchSort) ? (sort as SearchSort) : null;
}

/**
 * Validate events status
 */
function validateEventsStatus(status: string | undefined): EventsStatus | null {
  if (!status) return null;
  const validStatuses: EventsStatus[] = ['active', 'resolved'];
  return validStatuses.includes(status as EventsStatus) ? (status as EventsStatus) : null;
}

/**
 * Validate recurrence
 */
function validateRecurrence(recurrence: string | undefined): Recurrence | null {
  if (!recurrence) return null;
  const validRecurrences: Recurrence[] = ['daily', 'weekly', 'monthly'];
  return validRecurrences.includes(recurrence as Recurrence) ? (recurrence as Recurrence) : null;
}

/**
 * Validate search query parameters
 */
function validateSearchQueryParams(req: Request): SearchQueryParams {
  const q = req.query.q as string | undefined;
  const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
  const limit_per_type = req.query.limit_per_type ? parseInt(req.query.limit_per_type as string, 10) : undefined;
  const type = req.query.type as 'events' | 'markets' | undefined;
  const events_status = validateEventsStatus(req.query.events_status as string);
  const sort = validateSearchSort(req.query.sort as string);
  const ascending = req.query.ascending !== undefined ? req.query.ascending === 'true' : undefined;
  const recurrence = validateRecurrence(req.query.recurrence as string);
  const tag_slug = req.query.tag_slug as string | undefined;
  const presets = req.query.presets 
    ? (Array.isArray(req.query.presets) ? req.query.presets as string[] : [req.query.presets as string])
    : undefined;

  // Validate required: at least one of q, tag_slug, or recurrence
  if (!q && !tag_slug && !recurrence) {
    throw new ValidationError(
      ErrorCode.BAD_REQUEST,
      'At least one of q, tag_slug, or recurrence must be provided'
    );
  }

  // Validate page
  if (page !== undefined && (isNaN(page) || page < 1)) {
    throw new ValidationError(
      ErrorCode.INVALID_LIMIT,
      `Page must be >= 1, got ${page}`
    );
  }

  // Validate limit_per_type
  if (limit_per_type !== undefined && (isNaN(limit_per_type) || limit_per_type < 1 || limit_per_type > 50)) {
    throw new ValidationError(
      ErrorCode.INVALID_LIMIT,
      `limit_per_type must be between 1 and 50, got ${limit_per_type}`
    );
  }

  // Validate type
  if (type !== undefined && !['events', 'markets'].includes(type)) {
    throw new ValidationError(
      ErrorCode.BAD_REQUEST,
      `Invalid type: ${type}. Must be 'events' or 'markets'`
    );
  }

  // Validate sort for closed events
  const isClosed = events_status === 'resolved';
  if (isClosed && sort === 'volume_24hr' && !req.query.sort) {
    // Will default to closed_time in service
  } else if (isClosed && sort && sort !== 'closed_time') {
    // Allow other sorts even for closed events, but warn
    logger.warn({
      message: 'Using non-closed_time sort for resolved events',
      sort,
      events_status,
    });
  }

  return {
    q,
    page: page || 1,
    limit_per_type: limit_per_type || 20,
    type: type || 'events',
    events_status: events_status || 'active',
    sort: sort || 'volume_24hr',
    ascending,
    recurrence: recurrence ?? undefined,
    tag_slug,
    presets,
  };
}

/**
 * @swagger
 * /api/polymarket/search:
 *   get:
 *     summary: Search market events with various filters
 *     description: Search events using text query, category filters, recurrence filters, and various sort options. Results are transformed using the same pipeline as regular events.
 *     tags: [Polymarket]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search query string (optional if tag_slug or recurrence is provided)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Pagination page number
 *       - in: query
 *         name: limit_per_type
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 20
 *         description: Number of results per type
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [events, markets]
 *           default: events
 *         description: Search type
 *       - in: query
 *         name: events_status
 *         schema:
 *           type: string
 *           enum: [active, resolved]
 *           default: active
 *         description: Filter by event status
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [volume_24hr, end_date, start_date, volume, liquidity, closed_time, competitive]
 *           default: volume_24hr
 *         description: Sort option
 *       - in: query
 *         name: ascending
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Sort direction
 *       - in: query
 *         name: recurrence
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *         description: Filter by recurrence type
 *       - in: query
 *         name: tag_slug
 *         schema:
 *           type: string
 *         description: Filter by category tag slug (e.g., politics, crypto, sports)
 *     responses:
 *       200:
 *         description: Search results (transformed data)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     events:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/TransformedEvent'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *                 message:
 *                   type: string
 *                   description: Optional message (e.g., when no results found)
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: Service unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/search',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info({
        message: 'Search request received',
        query: req.query,
        ip: req.ip,
      });

      // Validate query parameters
      const params = validateSearchQueryParams(req);

      // Search events
      const result = await polymarketService.searchEvents(params);

      logger.info({
        message: 'Search request completed',
        eventCount: result.events.length,
        hasMore: result.pagination.hasMore,
        totalResults: result.pagination.totalResults,
      });

      // If no results, include a message
      const response: any = {
        success: true,
        data: result,
      };

      if (result.events.length === 0) {
        response.message = 'No markets available for the selected filters';
      }

      res.json(response);
    } catch (error) {
      logger.error({
        message: 'Error in search endpoint',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        query: req.query,
      });

      if (error instanceof ValidationError) {
        const errorResponse = createErrorResponse(error);
        res.status(errorResponse.statusCode).json({
          success: false,
          error: errorResponse,
        });
        return;
      }

      next(error);
    }
  }
);

/**
 * @swagger
 * /api/polymarket/injected-urls:
 *   get:
 *     summary: Get all injected URLs
 *     description: Returns all dynamically injected URLs that are being polled for trending events
 *     tags: [Polymarket]
 *     responses:
 *       200:
 *         description: List of injected URLs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     urls:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           url:
 *                             type: string
 *                           path:
 *                             type: string
 *                           params:
 *                             type: object
 *                           createdAt:
 *                             type: string
 *                     count:
 *                       type: number
 */
router.get(
  '/injected-urls',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const urls = injectedUrlsService.getAllUrls();
      const count = injectedUrlsService.getCount();

      logger.info({
        message: 'Injected URLs list requested',
        count,
      });

      res.json({
        success: true,
        data: {
          urls,
          count,
        },
      });
    } catch (error) {
      logger.error({
        message: 'Error listing injected URLs',
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/polymarket/injected-urls:
 *   post:
 *     summary: Add a new injected URL
 *     description: Adds a new URL to be polled and merged with trending events. The URL should be a full Polymarket API URL (e.g., https://gamma-api.polymarket.com/events?slug=cfb-miss-mspst-2025-11-28)
 *     tags: [Polymarket]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 example: https://gamma-api.polymarket.com/events?slug=cfb-miss-mspst-2025-11-28
 *     responses:
 *       200:
 *         description: URL added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     injectedUrl:
 *                       type: object
 *       400:
 *         description: Validation error
 */
router.post(
  '/injected-urls',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { url } = req.body;

      if (!url || typeof url !== 'string') {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'URL is required and must be a string'
        );
      }

      // Validate URL format
      try {
        new URL(url);
      } catch {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'Invalid URL format'
        );
      }

      logger.info({
        message: 'Adding injected URL',
        url,
      });

      const injectedUrl = injectedUrlsService.addUrl(url);

      logger.info({
        message: 'Injected URL added successfully',
        id: injectedUrl.id,
        url,
      });

      res.json({
        success: true,
        data: {
          injectedUrl,
        },
      });
    } catch (error) {
      logger.error({
        message: 'Error adding injected URL',
        error: error instanceof Error ? error.message : String(error),
        body: req.body,
      });

      if (error instanceof ValidationError) {
        const errorResponse = createErrorResponse(error);
        res.status(errorResponse.statusCode).json({
          success: false,
          error: errorResponse,
        });
        return;
      }

      next(error);
    }
  }
);

/**
 * @swagger
 * /api/polymarket/injected-urls/{identifier}:
 *   delete:
 *     summary: Remove an injected URL
 *     description: Removes an injected URL by ID or URL string. The identifier can be either the URL ID or the full URL string.
 *     tags: [Polymarket]
 *     parameters:
 *       - in: path
 *         name: identifier
 *         required: true
 *         schema:
 *           type: string
 *         description: URL ID or full URL string
 *     responses:
 *       200:
 *         description: URL removed successfully
 *       404:
 *         description: URL not found
 */
router.delete(
  '/injected-urls/:identifier',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identifier } = req.params;

      if (!identifier) {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'Identifier is required'
        );
      }

      logger.info({
        message: 'Removing injected URL',
        identifier,
      });

      const removed = injectedUrlsService.removeUrl(identifier);

      if (!removed) {
        throw new ValidationError(
          ErrorCode.NOT_FOUND,
          `URL not found: ${identifier}`
        );
      }

      logger.info({
        message: 'Injected URL removed successfully',
        identifier,
      });

      res.json({
        success: true,
        message: 'URL removed successfully',
      });
    } catch (error) {
      logger.error({
        message: 'Error removing injected URL',
        error: error instanceof Error ? error.message : String(error),
        identifier: req.params.identifier,
      });

      if (error instanceof ValidationError) {
        const errorResponse = createErrorResponse(error);
        res.status(errorResponse.statusCode).json({
          success: false,
          error: errorResponse,
        });
        return;
      }

      next(error);
    }
  }
);

/**
 * @swagger
 * /api/polymarket/injected-urls:
 *   delete:
 *     summary: Clear all injected URLs
 *     description: Removes all injected URLs at once
 *     tags: [Polymarket]
 *     responses:
 *       200:
 *         description: All URLs cleared successfully
 */
router.delete(
  '/injected-urls',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info({
        message: 'Clearing all injected URLs',
      });

      injectedUrlsService.clearAll();

      logger.info({
        message: 'All injected URLs cleared',
      });

      res.json({
        success: true,
        message: 'All injected URLs cleared successfully',
      });
    } catch (error) {
      logger.error({
        message: 'Error clearing injected URLs',
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/polymarket/market-clarifications:
 *   get:
 *     summary: Fetch market clarifications for one or multiple market IDs
 *     description: Returns official clarifications from Polymarket for the specified market(s). Supports both single and multiple market IDs. Each result includes the market ID, clarifications array, and status (success/error).
 *     tags: [Polymarket]
 *     parameters:
 *       - in: query
 *         name: market_id
 *         required: true
 *         schema:
 *           oneOf:
 *             - type: string
 *             - type: array
 *               items:
 *                 type: string
 *         description: Market ID(s) to fetch clarifications for. Can be a single ID or multiple IDs.
 *         example: "570360"
 *     responses:
 *       200:
 *         description: Market clarifications fetched successfully (may include partial failures)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           marketId:
 *                             type: string
 *                             example: "570360"
 *                           clarifications:
 *                             type: array
 *                             description: Array of clarification objects
 *                             items:
 *                               type: object
 *                           status:
 *                             type: string
 *                             enum: [success, error]
 *                             example: "success"
 *                           error:
 *                             type: string
 *                             description: Error message if status is error
 *                             example: "Failed to fetch market clarification"
 *       400:
 *         description: Validation error (no market_id provided)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/market-clarifications',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse market_id parameter (can be single or array)
      const marketIdParam = req.query.market_id;
      
      if (!marketIdParam) {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'market_id query parameter is required'
        );
      }

      // Convert to array format (handle both single and multiple values)
      const marketIds: string[] = Array.isArray(marketIdParam)
        ? (marketIdParam as string[])
        : [marketIdParam as string];

      // Validate market IDs (non-empty strings)
      const validMarketIds = marketIds.filter((id) => {
        if (!id || typeof id !== 'string' || id.trim() === '') {
          logger.warn({
            message: 'Invalid market ID provided',
            marketId: id,
          });
          return false;
        }
        return true;
      });

      if (validMarketIds.length === 0) {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'At least one valid market_id is required'
        );
      }

      logger.info({
        message: 'Market clarifications request received',
        marketIds: validMarketIds,
        ip: req.ip,
      });

      // Fetch clarifications for all market IDs
      const results = await marketClarificationsService.getMarketClarifications(validMarketIds);

      logger.info({
        message: 'Market clarifications request completed',
        total: results.results.length,
        successful: results.results.filter((r) => r.status === 'success').length,
        failed: results.results.filter((r) => r.status === 'error').length,
      });

      res.json({
        success: true,
        data: results,
      });
    } catch (error) {
      logger.error({
        message: 'Error in market clarifications endpoint',
        error: error instanceof Error ? error.message : String(error),
        query: req.query,
      });

      if (error instanceof ValidationError) {
        const errorResponse = createErrorResponse(error);
        res.status(errorResponse.statusCode).json({
          success: false,
          error: errorResponse,
        });
        return;
      }

      next(error);
    }
  }
);

/**
 * @swagger
 * /api/polymarket/price-history:
 *   get:
 *     summary: Fetch price history for a CLOB token
 *     description: Returns historical price data for a given clobTokenId. Supports either startDate-based queries (with startTs) or interval-based queries. Each request handles one token ID to enable concurrent frontend requests.
 *     tags: [Polymarket]
 *     parameters:
 *       - in: query
 *         name: clobTokenId
 *         required: true
 *         schema:
 *           type: string
 *         description: CLOB token ID to fetch price history for
 *         example: "87769991026114894163580777793845523168226980076553814689875238288185044414090"
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: ISO date string for start date. Backend will convert to startTs with -20s buffer. Mutually exclusive with interval.
 *         example: "2025-07-31T19:47:26.391724Z"
 *       - in: query
 *         name: interval
 *         schema:
 *           type: string
 *           enum: [1h, 6h, 1d, 1w, 1m]
 *         description: 'Time interval for price history. Mutually exclusive with startDate. Default fidelity: 1h=1, 6h=1, 1d=5, 1w=30, 1m=180'
 *         example: "1h"
 *       - in: query
 *         name: fidelity
 *         schema:
 *           type: integer
 *         description: Optional fidelity override. Defaults to 720 for startDate mode, or interval-specific defaults for interval mode.
 *         example: 720
 *     responses:
 *       200:
 *         description: Price history fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     clobTokenId:
 *                       type: string
 *                       description: The CLOB token ID that was queried
 *                     history:
 *                       type: array
 *                       description: Array of price history points
 *                       items:
 *                         type: object
 *                         properties:
 *                           t:
 *                             type: integer
 *                             description: Unix timestamp in seconds
 *                             example: 1754006409
 *                           p:
 *                             type: number
 *                             description: Price/probability (0.0-1.0)
 *                             example: 0.575
 *             examples:
 *               startDate:
 *                 value:
 *                   success: true
 *                   data:
 *                     clobTokenId: "87769991026114894163580777793845523168226980076553814689875238288185044414090"
 *                     history:
 *                       - t: 1754006409
 *                         p: 0.575
 *                       - t: 1754049609
 *                         p: 0.545
 *               interval:
 *                 value:
 *                   success: true
 *                   data:
 *                     clobTokenId: "87769991026114894163580777793845523168226980076553814689875238288185044414090"
 *                     history:
 *                       - t: 1764391506
 *                         p: 0.0035
 *                       - t: 1764391565
 *                         p: 0.0035
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: Service unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/price-history',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clobTokenId = req.query.clobTokenId as string | undefined;
      const startDate = req.query.startDate as string | undefined;
      const interval = req.query.interval as PriceHistoryInterval | undefined;
      const fidelity = req.query.fidelity
        ? parseInt(req.query.fidelity as string, 10)
        : undefined;

      logger.info({
        message: 'Price history request received',
        clobTokenId,
        startDate,
        interval,
        fidelity,
        ip: req.ip,
      });

      // Validate clobTokenId is provided
      if (!clobTokenId || typeof clobTokenId !== 'string' || clobTokenId.trim() === '') {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'clobTokenId query parameter is required and must be a non-empty string'
        );
      }

      // Validate that startDate and interval are not both provided
      if (startDate && interval) {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'startDate and interval are mutually exclusive. Provide either startDate or interval, not both.'
        );
      }

      // Validate interval if provided
      if (interval && !['1h', '6h', '1d', '1w', '1m'].includes(interval)) {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'interval must be one of: 1h, 6h, 1d, 1w, 1m'
        );
      }

      // Validate fidelity if provided
      if (fidelity !== undefined && (isNaN(fidelity) || fidelity < 1)) {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'fidelity must be a positive integer'
        );
      }

      // Build query params
      const queryParams: PriceHistoryQueryParams = {
        clobTokenId: clobTokenId.trim(),
        ...(startDate && { startDate }),
        ...(interval && { interval }),
        ...(fidelity !== undefined && { fidelity }),
      };

      // Fetch price history
      const result = await priceHistoryService.getPriceHistory(queryParams);

      logger.info({
        message: 'Price history request completed',
        clobTokenId,
        historyLength: result.history?.length || 0,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error({
        message: 'Error in price history endpoint',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        query: req.query,
      });

      if (error instanceof ValidationError) {
        const errorResponse = createErrorResponse(error);
        res.status(errorResponse.statusCode).json({
          success: false,
          error: errorResponse,
        });
        return;
      }

      next(error);
    }
  }
);

/**
 * @swagger
 * /api/polymarket/sports-props:
 *   get:
 *     summary: Fetch sports prop markets for a specific sport or all sports
 *     description: |
 *       Returns transformed sports prop markets (not game props). 
 *       - If `sport` parameter is provided, returns props for that specific sport
 *       - If `sport` is omitted or set to "all", returns props for all sports merged together
 *       - Each event in the "all" response includes a `sport` field for frontend grouping
 *       - When fetching "all", page N fetches page N for each sport, then merges and sorts by volume
 *       Supports pagination via `page` or `offset` parameter (use one, not both).
 *     tags: [Polymarket]
 *     parameters:
 *       - in: query
 *         name: sport
 *         required: false
 *         schema:
 *           type: string
 *           enum: [nfl, nba, mlb, nhl, ufc, epl, la-liga, all]
 *           example: nfl
 *         description: Sport category name. Omit or use "all" to fetch all sports merged together
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: |
 *           Page number for pagination. 
 *           - For specific sport: each page returns 12 results
 *           - For "all" sports: page N fetches page N for each sport, then merges results
 *         example: 1
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: |
 *           Alternative to page: offset for pagination (mutually exclusive with page).
 *           - For specific sport: offset directly (0, 12, 24, etc.)
 *           - For "all" sports: offset is converted to page for each sport
 *         example: 0
 *     responses:
 *       200:
 *         description: Sports props fetched successfully (transformed data)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     events:
 *                       type: array
 *                       description: Transformed events with sports prop markets. When fetching all sports, each event includes a `sport` field.
 *                       items:
 *                         allOf:
 *                           - $ref: '#/components/schemas/TransformedEvent'
 *                           - type: object
 *                             properties:
 *                               sport:
 *                                 type: string
 *                                 description: Sport name (only present when fetching all sports)
 *                                 example: nfl
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       400:
 *         description: Validation error (invalid sport or page parameter)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: Service unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/sports-props',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sport = req.query.sport as string | undefined;
      
      // Validate and parse page and offset parameters
      const pageParam = req.query.page as string | undefined;
      const offsetParam = req.query.offset as string | undefined;

      logger.info({
        message: 'Sports props request received',
        sport,
        page: pageParam,
        offset: offsetParam,
        ip: req.ip,
      });

      let page: number | undefined;
      let offset: number | undefined;

      if (pageParam !== undefined) {
        const parsedPage = parseInt(pageParam, 10);
        if (isNaN(parsedPage) || parsedPage < 1) {
          throw new ValidationError(
            ErrorCode.BAD_REQUEST,
            `page must be a positive integer, got ${pageParam}`
          );
        }
        page = parsedPage;
      }

      if (offsetParam !== undefined) {
        const parsedOffset = parseInt(offsetParam, 10);
        if (isNaN(parsedOffset) || parsedOffset < 0) {
          throw new ValidationError(
            ErrorCode.BAD_REQUEST,
            `offset must be a non-negative integer, got ${offsetParam}`
          );
        }
        offset = parsedOffset;
      }

      // If no sport specified or sport is "all", fetch all sports
      if (!sport || sport.trim() === '' || sport.toLowerCase() === 'all') {
        // Fetch all sports props
        const result = await sportsPropsService.getAllSportsProps(page, offset);

        logger.info({
          message: 'All sports props request completed',
          page,
          offset,
          eventCount: result.events.length,
        });

        res.json({
          success: true,
          data: result,
        });
        return;
      }

      // Validate sport parameter for specific sport fetch
      if (typeof sport !== 'string' || sport.trim() === '') {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'sport query parameter must be a non-empty string or "all"'
        );
      }

      // Fetch sports props for specific sport
      const result = await sportsPropsService.getSportsProps(sport, page);

      logger.info({
        message: 'Sports props request completed',
        sport,
        page,
        eventCount: result.events.length,
        hasMore: result.pagination.hasMore,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error({
        message: 'Error in sports props endpoint',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        query: req.query,
      });

      if (error instanceof ValidationError) {
        const errorResponse = createErrorResponse(error);
        res.status(errorResponse.statusCode).json({
          success: false,
          error: errorResponse,
        });
        return;
      }

      next(error);
    }
  }
);

/**
 * @swagger
 * /api/polymarket/series-summary/{seriesId}:
 *   get:
 *     summary: Fetch series summary by series ID
 *     description: Returns series summary information including event dates, weeks, and earliest open date for a given series ID. This is a backend/internal endpoint that accepts series IDs directly.
 *     tags: [Polymarket]
 *     parameters:
 *       - in: path
 *         name: seriesId
 *         required: true
 *         schema:
 *           type: string
 *         description: Series ID number (e.g., '10187' for NFL 2025)
 *         example: "10187"
 *     responses:
 *       200:
 *         description: Series summary fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "10187"
 *                     title:
 *                       type: string
 *                       example: "NFL 2025"
 *                     slug:
 *                       type: string
 *                       example: "nfl-2025"
 *                     eventDates:
 *                       type: array
 *                       items:
 *                         type: string
 *                         format: date
 *                       example: ["2025-09-04", "2025-09-05", "2025-09-07"]
 *                     eventWeeks:
 *                       type: array
 *                       items:
 *                         type: integer
 *                       example: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
 *                     earliest_open_week:
 *                       type: integer
 *                       example: 12
 *                     earliest_open_date:
 *                       type: string
 *                       format: date
 *                       example: "2025-11-30"
 *       400:
 *         description: Validation error (invalid series ID)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: Service unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/series-summary/:seriesId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const seriesId = req.params.seriesId;

      logger.info({
        message: 'Series summary request received',
        seriesId,
        ip: req.ip,
      });

      if (!seriesId) {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'Series ID is required'
        );
      }

      const result = await seriesSummaryService.getSeriesSummary(seriesId);

      logger.info({
        message: 'Series summary request completed',
        seriesId,
        title: result.title,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error({
        message: 'Error in series summary endpoint',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        seriesId: req.params.seriesId,
      });

      if (error instanceof ValidationError) {
        const errorResponse = createErrorResponse(error);
        res.status(errorResponse.statusCode).json({
          success: false,
          error: errorResponse,
        });
        return;
      }

      next(error);
    }
  }
);

/**
 * @swagger
 * /api/polymarket/series-summary/sport/{sport}:
 *   get:
 *     summary: Fetch series summary by sport name
 *     description: |
 *       Returns series summary information for a given sport. The sport name is mapped to a series ID using the configuration.
 *       This is a frontend-friendly endpoint that accepts sport names like 'nfl', 'nba', 'nhl', 'epl', etc.
 *       The response includes event dates, weeks, and earliest open date for the sport's series.
 *     tags: [Polymarket]
 *     parameters:
 *       - in: path
 *         name: sport
 *         required: true
 *         schema:
 *           type: string
 *           enum: [nfl, nba, mlb, nhl, ufc, epl, la-liga]
 *         description: Sport category name
 *         example: nfl
 *     responses:
 *       200:
 *         description: Series summary fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "10187"
 *                     title:
 *                       type: string
 *                       example: "NFL 2025"
 *                     slug:
 *                       type: string
 *                       example: "nfl-2025"
 *                     eventDates:
 *                       type: array
 *                       items:
 *                         type: string
 *                         format: date
 *                       example: ["2025-09-04", "2025-09-05", "2025-09-07"]
 *                     eventWeeks:
 *                       type: array
 *                       items:
 *                         type: integer
 *                       example: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
 *                     earliest_open_week:
 *                       type: integer
 *                       example: 12
 *                     earliest_open_date:
 *                       type: string
 *                       format: date
 *                       example: "2025-11-30"
 *       400:
 *         description: Validation error (invalid sport or sport not configured)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: Service unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/series-summary/sport/:sport',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sport = req.params.sport;

      logger.info({
        message: 'Series summary by sport request received',
        sport,
        ip: req.ip,
      });

      if (!sport) {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'Sport parameter is required'
        );
      }

      const result = await seriesSummaryService.getSeriesSummaryBySport(sport);

      logger.info({
        message: 'Series summary by sport request completed',
        sport,
        seriesId: result.id,
        title: result.title,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error({
        message: 'Error in series summary by sport endpoint',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        sport: req.params.sport,
      });

      if (error instanceof ValidationError) {
        const errorResponse = createErrorResponse(error);
        res.status(errorResponse.statusCode).json({
          success: false,
          error: errorResponse,
        });
        return;
      }

      next(error);
    }
  }
);

/**
 * @swagger
 * /api/polymarket/teams/{sport}:
 *   get:
 *     summary: Fetch teams for a specific sport/league
 *     description: |
 *       Returns all teams for a given sport. The sport name is mapped to a league name using the configuration.
 *       This endpoint accepts sport names like 'nfl', 'nba', 'nhl', 'epl', etc.
 *       Teams are stored in PostgreSQL (production) or in-memory (development) and are periodically refreshed.
 *     tags: [Polymarket]
 *     parameters:
 *       - in: path
 *         name: sport
 *         required: true
 *         schema:
 *           type: string
 *           enum: [nfl, nba, mlb, nhl, ufc, epl, la-liga]
 *         description: Sport category name
 *         example: nfl
 *     responses:
 *       200:
 *         description: Teams fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     teams:
 *                       type: array
 *                       description: Array of team objects
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 100045
 *                           name:
 *                             type: string
 *                             example: "Washington Commanders"
 *                           league:
 *                             type: string
 *                             example: "nfl"
 *                           record:
 *                             type: string
 *                             example: "3-8-0"
 *                           logo:
 *                             type: string
 *                             example: "https://polymarket-upload.s3.us-east-2.amazonaws.com/NFL+Team+Logos/WSH.png"
 *                           abbreviation:
 *                             type: string
 *                             example: "was"
 *                           alias:
 *                             type: string
 *                             example: "Commanders"
 *                           providerId:
 *                             type: integer
 *                             example: 35
 *                           color:
 *                             type: string
 *                             example: "#800000"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                     league:
 *                       type: string
 *                       example: "nfl"
 *       400:
 *         description: Validation error (invalid sport)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: Service unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/teams/:sport',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sport = req.params.sport;

      logger.info({
        message: 'Teams request received',
        sport,
        ip: req.ip,
      });

      if (!sport) {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'Sport parameter is required'
        );
      }

      const teams = await teamsService.getTeamsBySport(sport);

      // Get league name for response
      const league = getLeagueForSport(sport.toLowerCase().trim()) || sport;

      logger.info({
        message: 'Teams request completed',
        sport,
        league,
        teamCount: teams.length,
      });

      res.json({
        success: true,
        data: {
          teams,
          league,
        },
      });
    } catch (error) {
      logger.error({
        message: 'Error in teams endpoint',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        sport: req.params.sport,
      });

      if (error instanceof ValidationError) {
        const errorResponse = createErrorResponse(error);
        res.status(errorResponse.statusCode).json({
          success: false,
          error: errorResponse,
        });
        return;
      }

      next(error);
    }
  }
);

/**
 * @swagger
 * /api/polymarket/game-events/{sport}/{eventWeek}:
 *   get:
 *     summary: Fetch game events for a sport and event week
 *     description: |
 *       Returns game events for a given sport and event week. The sport name is mapped to a series ID using the configuration.
 *       Events are transformed using the standard transformer and enriched with team details (homeTeam, awayTeam).
 *       This endpoint accepts sport names like 'nfl', 'nba', 'nhl', 'epl', etc., and an event week number.
 *     tags: [Polymarket]
 *     parameters:
 *       - in: path
 *         name: sport
 *         required: true
 *         schema:
 *           type: string
 *           enum: [nfl, nba, mlb, nhl, ufc, epl, la-liga]
 *         description: Sport category name
 *         example: nfl
 *       - in: path
 *         name: eventWeek
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Event week number
 *         example: 13
 *     responses:
 *       200:
 *         description: Game events fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     events:
 *                       type: array
 *                       description: Array of game events with team details
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "12345"
 *                           title:
 *                             type: string
 *                             example: "Texans vs. Colts"
 *                           slug:
 *                             type: string
 *                             example: "nfl-hou-ind-2025-11-30"
 *                           homeTeam:
 *                             type: object
 *                             description: Home team details (if matched)
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 100045
 *                               name:
 *                                 type: string
 *                                 example: "Houston Texans"
 *                               abbreviation:
 *                                 type: string
 *                                 example: "hou"
 *                               logo:
 *                                 type: string
 *                                 example: "https://..."
 *                               color:
 *                                 type: string
 *                                 example: "#03202f"
 *                           awayTeam:
 *                             type: object
 *                             description: Away team details (if matched)
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 100046
 *                               name:
 *                                 type: string
 *                                 example: "Indianapolis Colts"
 *                               abbreviation:
 *                                 type: string
 *                                 example: "ind"
 *                               logo:
 *                                 type: string
 *                                 example: "https://..."
 *                               color:
 *                                 type: string
 *                                 example: "#003b7b"
 *                           markets:
 *                             type: array
 *                             description: Array of markets for this event
 *                           volume24Hr:
 *                             type: number
 *                             example: 12345.67
 *                           startDate:
 *                             type: string
 *                             format: date-time
 *                     sport:
 *                       type: string
 *                       example: "nfl"
 *                     eventWeek:
 *                       type: integer
 *                       example: 13
 *                     seriesId:
 *                       type: string
 *                       example: "10187"
 *       400:
 *         description: Validation error (invalid sport, invalid event week, or sport not configured)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: Service unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/game-events/:sport/:eventWeek',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sport = req.params.sport;
      const eventWeekParam = req.params.eventWeek;

      logger.info({
        message: 'Game events request received',
        sport,
        eventWeek: eventWeekParam,
        ip: req.ip,
      });

      if (!sport) {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'Sport parameter is required'
        );
      }

      if (!eventWeekParam) {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'Event week parameter is required'
        );
      }

      const eventWeek = parseInt(eventWeekParam, 10);
      if (isNaN(eventWeek) || eventWeek < 1) {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'Event week must be a positive integer'
        );
      }

      const result = await gameEventsService.getGameEvents(sport, eventWeek);

      logger.info({
        message: 'Game events request completed',
        sport,
        eventWeek,
        seriesId: result.seriesId,
        eventCount: result.events.length,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error({
        message: 'Error in game events endpoint',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        sport: req.params.sport,
        eventWeek: req.params.eventWeek,
      });

      if (error instanceof ValidationError) {
        const errorResponse = createErrorResponse(error);
        res.status(errorResponse.statusCode).json({
          success: false,
          error: errorResponse,
        });
        return;
      }

      next(error);
    }
  }
);

/**
 * @swagger
 * /api/polymarket/game-events/all:
 *   get:
 *     summary: Fetch game events for all configured sports
 *     description: |
 *       Returns game events for all sports configured in the games config. For each sport:
 *       - Fetches the series summary to determine the earliest_open_week
 *       - Uses that week to fetch game events
 *       - Transforms and enriches events with team details
 *       - Merges all events together, grouped by sport
 *       If a sport fails (no series ID, API error, etc.), it is skipped and processing continues.
 *     tags: [Polymarket]
 *     responses:
 *       200:
 *         description: All sports game events fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     events:
 *                       type: array
 *                       description: All events flattened into a single array
 *                       items:
 *                         type: object
 *                     sports:
 *                       type: object
 *                       description: Events grouped by sport
 *                       additionalProperties:
 *                         type: object
 *                         properties:
 *                           sport:
 *                             type: string
 *                             example: "nfl"
 *                           seriesId:
 *                             type: string
 *                             example: "10187"
 *                           eventWeek:
 *                             type: integer
 *                             example: 13
 *                           eventCount:
 *                             type: integer
 *                             example: 16
 *                           events:
 *                             type: array
 *                             items:
 *                               type: object
 *                     totalEvents:
 *                       type: integer
 *                       example: 32
 *                     sportsProcessed:
 *                       type: integer
 *                       example: 2
 *                     sportsSkipped:
 *                       type: integer
 *                       example: 5
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/game-events/all',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info({
        message: 'All sports game events request received',
        ip: req.ip,
      });

      const result = await gameEventsService.getAllSportsGameEvents();

      logger.info({
        message: 'All sports game events request completed',
        totalEvents: result.totalEvents,
        sportsProcessed: result.sportsProcessed,
        sportsSkipped: result.sportsSkipped,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error({
        message: 'Error in all sports game events endpoint',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (error instanceof ValidationError) {
        const errorResponse = createErrorResponse(error);
        res.status(errorResponse.statusCode).json({
          success: false,
          error: errorResponse,
        });
        return;
      }

      next(error);
    }
  }
);

/**
 * @swagger
 * /api/polymarket/orderbooks:
 *   post:
 *     summary: Fetch orderbooks for multiple token IDs
 *     description: |
 *       Returns orderbook data (bids, asks, market info) for multiple token IDs from Polymarket CLOB API.
 *       The request body should contain an array of token IDs. Each orderbook includes:
 *       - Market address/ID
 *       - Asset/token ID
 *       - Bids and asks arrays with price and size
 *       - Market metadata (min_order_size, tick_size, neg_risk)
 *     tags: [Polymarket]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tokenIds
 *             properties:
 *               tokenIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of token IDs to fetch orderbooks for
 *                 example: ["1362262070499612196536543020228646841715290686923724811547043222779627929033", "71153762617850327918008626736070729460267755184866151885318205408085249899501"]
 *     responses:
 *       200:
 *         description: Orderbooks fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   description: Array of orderbook data
 *                   items:
 *                     type: object
 *                     properties:
 *                       market:
 *                         type: string
 *                         example: "0xfb271be1fd36d39df248526573b47db09a806722fe1712f27d35279af149f1ff"
 *                       asset_id:
 *                         type: string
 *                         example: "114782618692864822179421796791260116822757553171286093337624870274191590938528"
 *                       timestamp:
 *                         type: string
 *                         example: "1764572247055"
 *                       hash:
 *                         type: string
 *                         example: "3b03e419e89e1ed4389e86d5a0a7541dc1740325"
 *                       bids:
 *                         type: array
 *                         description: Array of bid orders (buy orders)
 *                         items:
 *                           type: object
 *                           properties:
 *                             price:
 *                               type: string
 *                               example: "0.35"
 *                             size:
 *                               type: string
 *                               example: "2670"
 *                       asks:
 *                         type: array
 *                         description: Array of ask orders (sell orders)
 *                         items:
 *                           type: object
 *                           properties:
 *                             price:
 *                               type: string
 *                               example: "0.65"
 *                             size:
 *                               type: string
 *                               example: "2670"
 *                       min_order_size:
 *                         type: string
 *                         example: "5"
 *                       tick_size:
 *                         type: string
 *                         example: "0.01"
 *                       neg_risk:
 *                         type: boolean
 *                         example: false
 *       400:
 *         description: Validation error (invalid tokenIds format)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/orderbooks',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tokenIds } = req.body;

      logger.info({
        message: 'Orderbooks request received',
        tokenCount: Array.isArray(tokenIds) ? tokenIds.length : 0,
        ip: req.ip,
      });

      if (!tokenIds) {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'tokenIds is required in request body'
        );
      }

      if (!Array.isArray(tokenIds)) {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'tokenIds must be an array'
        );
      }

      const orderbooks = await orderbookService.getOrderBooks(tokenIds);

      logger.info({
        message: 'Orderbooks request completed',
        tokenCount: tokenIds.length,
        orderbookCount: orderbooks.length,
      });

      res.json({
        success: true,
        data: orderbooks,
      });
    } catch (error) {
      logger.error({
        message: 'Error in orderbooks endpoint',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (error instanceof ValidationError) {
        const errorResponse = createErrorResponse(error);
        res.status(errorResponse.statusCode).json({
          success: false,
          error: errorResponse,
        });
        return;
      }

      next(error);
    }
  }
);

/**
 * @swagger
 * /api/polymarket/sports-price-history:
 *   post:
 *     summary: Fetch price history for sports games markets
 *     description: |
 *       Returns historical price data for sports games markets from Polymarket CLOB API.
 *       Uses different fidelity mapping than regular price history:
 *       - 1h, 6h intervals: fidelity=1
 *       - 1d interval: fidelity=5
 *       - 1w, 1m intervals: fidelity=30 with startTs (startDate required)
 *       Prices are transformed from decimal (0.01) to percentage (1) before returning.
 *     tags: [Polymarket]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - market
 *               - interval
 *             properties:
 *               market:
 *                 type: string
 *                 description: Token ID (market identifier)
 *                 example: "55399073910241110321143566417499514761728667602612836054219373213410921198138"
 *               interval:
 *                 type: string
 *                 enum: [1h, 6h, 1d, 1w, 1m]
 *                 description: Time interval for price history
 *                 example: "1h"
 *               startDate:
 *                 type: string
 *                 format: date-time
 *                 description: Start date (required for 1w and 1m intervals, ISO 8601 format)
 *                 example: "2025-01-01T00:00:00Z"
 *     responses:
 *       200:
 *         description: Price history fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     market:
 *                       type: string
 *                       example: "55399073910241110321143566417499514761728667602612836054219373213410921198138"
 *                     history:
 *                       type: array
 *                       description: Array of price history points
 *                       items:
 *                         type: object
 *                         properties:
 *                           t:
 *                             type: number
 *                             description: Unix timestamp in seconds
 *                             example: 1764082859
 *                           p:
 *                             type: number
 *                             description: Price as percentage (0-100)
 *                             example: 35
 *       400:
 *         description: Validation error (invalid parameters)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/sports-price-history',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { market, interval, startDate } = req.body;

      logger.info({
        message: 'Sports price history request received',
        market,
        interval,
        startDate,
        ip: req.ip,
      });

      if (!market) {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'market is required in request body'
        );
      }

      if (!interval) {
        throw new ValidationError(
          ErrorCode.BAD_REQUEST,
          'interval is required in request body'
        );
      }

      const result = await sportsPriceHistoryService.getPriceHistory(
        market,
        interval,
        startDate
      );

      logger.info({
        message: 'Sports price history request completed',
        market,
        interval,
        historyLength: result.history?.length || 0,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error({
        message: 'Error in sports price history endpoint',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        body: req.body,
      });

      if (error instanceof ValidationError) {
        const errorResponse = createErrorResponse(error);
        res.status(errorResponse.statusCode).json({
          success: false,
          error: errorResponse,
        });
        return;
      }

      next(error);
    }
  }
);

export default router;

