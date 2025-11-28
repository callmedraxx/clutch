/**
 * Polymarket API routes
 * Handles requests for market events with validation and error handling
 */

import { Router, Request, Response, NextFunction } from 'express';
import { polymarketService } from '../services/polymarket/polymarket.service';
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
} from '../services/polymarket/polymarket.types';

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

export default router;

