/**
 * Centralized Error Management System
 * Provides custom error classes, error codes, and user-friendly messages
 * Never exposes internal Polymarket errors to frontend
 */

export enum ErrorCode {
  // Polymarket API Errors
  POLYMARKET_API_ERROR = 'POLYMARKET_API_ERROR',
  POLYMARKET_FETCH_FAILED = 'POLYMARKET_FETCH_FAILED',
  POLYMARKET_TIMEOUT = 'POLYMARKET_TIMEOUT',
  POLYMARKET_RATE_LIMIT = 'POLYMARKET_RATE_LIMIT',
  POLYMARKET_INVALID_RESPONSE = 'POLYMARKET_INVALID_RESPONSE',
  
  // Cache Errors
  CACHE_ERROR = 'CACHE_ERROR',
  CACHE_READ_FAILED = 'CACHE_READ_FAILED',
  CACHE_WRITE_FAILED = 'CACHE_WRITE_FAILED',
  
  // Validation Errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_CATEGORY = 'INVALID_CATEGORY',
  INVALID_LIMIT = 'INVALID_LIMIT',
  INVALID_OFFSET = 'INVALID_OFFSET',
  INVALID_ORDER = 'INVALID_ORDER',
  
  // Transformation Errors
  TRANSFORMATION_ERROR = 'TRANSFORMATION_ERROR',
  DATA_PARSING_ERROR = 'DATA_PARSING_ERROR',
  
  // General Errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  BAD_REQUEST = 'BAD_REQUEST',
}

export interface ErrorResponse {
  code: ErrorCode;
  message: string;
  statusCode: number;
}

/**
 * User-friendly error messages
 * These are shown to the frontend - never expose internal errors
 */
const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.POLYMARKET_API_ERROR]: 'Unable to fetch market data. Please try again later.',
  [ErrorCode.POLYMARKET_FETCH_FAILED]: 'Unable to fetch market data. Please try again later.',
  [ErrorCode.POLYMARKET_TIMEOUT]: 'Request timed out. Please try again later.',
  [ErrorCode.POLYMARKET_RATE_LIMIT]: 'Too many requests. Please try again in a moment.',
  [ErrorCode.POLYMARKET_INVALID_RESPONSE]: 'Received invalid data from market service. Please try again later.',
  
  [ErrorCode.CACHE_ERROR]: 'Cache service error. Please try again.',
  [ErrorCode.CACHE_READ_FAILED]: 'Unable to retrieve cached data. Please try again.',
  [ErrorCode.CACHE_WRITE_FAILED]: 'Unable to cache data. Please try again.',
  
  [ErrorCode.VALIDATION_ERROR]: 'Invalid request parameters. Please check your input.',
  [ErrorCode.INVALID_CATEGORY]: 'Invalid category. Valid categories are: trending, politics, crypto, finance, sports.',
  [ErrorCode.INVALID_LIMIT]: 'Invalid limit. Limit must be between 20 and 50.',
  [ErrorCode.INVALID_OFFSET]: 'Invalid offset. Offset must be a non-negative number.',
  [ErrorCode.INVALID_ORDER]: 'Invalid order. Valid orders are: volume24hr, volume, featuredOrder.',
  
  [ErrorCode.TRANSFORMATION_ERROR]: 'Data processing error. Please try again later.',
  [ErrorCode.DATA_PARSING_ERROR]: 'Data parsing error. Please try again later.',
  
  [ErrorCode.INTERNAL_SERVER_ERROR]: 'Internal server error. Please try again later.',
  [ErrorCode.NOT_FOUND]: 'Resource not found.',
  [ErrorCode.BAD_REQUEST]: 'Bad request. Please check your input.',
};

/**
 * HTTP status code mapping for error codes
 */
const ERROR_STATUS_CODES: Record<ErrorCode, number> = {
  [ErrorCode.POLYMARKET_API_ERROR]: 503,
  [ErrorCode.POLYMARKET_FETCH_FAILED]: 503,
  [ErrorCode.POLYMARKET_TIMEOUT]: 504,
  [ErrorCode.POLYMARKET_RATE_LIMIT]: 429,
  [ErrorCode.POLYMARKET_INVALID_RESPONSE]: 502,
  
  [ErrorCode.CACHE_ERROR]: 503,
  [ErrorCode.CACHE_READ_FAILED]: 503,
  [ErrorCode.CACHE_WRITE_FAILED]: 503,
  
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.INVALID_CATEGORY]: 400,
  [ErrorCode.INVALID_LIMIT]: 400,
  [ErrorCode.INVALID_OFFSET]: 400,
  [ErrorCode.INVALID_ORDER]: 400,
  
  [ErrorCode.TRANSFORMATION_ERROR]: 500,
  [ErrorCode.DATA_PARSING_ERROR]: 500,
  
  [ErrorCode.INTERNAL_SERVER_ERROR]: 500,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.BAD_REQUEST]: 400,
};

/**
 * Base custom error class
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly userMessage: string;
  public readonly internalMessage?: string;

  constructor(
    code: ErrorCode,
    internalMessage?: string,
    isOperational: boolean = true
  ) {
    const userMessage = ERROR_MESSAGES[code];
    const statusCode = ERROR_STATUS_CODES[code];
    
    super(userMessage);
    
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.userMessage = userMessage;
    this.internalMessage = internalMessage;
    
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to API response format
   */
  toResponse(): ErrorResponse {
    return {
      code: this.code,
      message: this.userMessage,
      statusCode: this.statusCode,
    };
  }
}

/**
 * Polymarket-specific error class
 */
export class PolymarketError extends AppError {
  constructor(code: ErrorCode, internalMessage?: string) {
    super(code, internalMessage, true);
  }
}

/**
 * Validation error class
 */
export class ValidationError extends AppError {
  constructor(code: ErrorCode, internalMessage?: string) {
    super(code, internalMessage, true);
  }
}

/**
 * Cache error class
 */
export class CacheError extends AppError {
  constructor(code: ErrorCode, internalMessage?: string) {
    super(code, internalMessage, true);
  }
}

/**
 * Transformation error class
 */
export class TransformationError extends AppError {
  constructor(code: ErrorCode, internalMessage?: string) {
    super(code, internalMessage, true);
  }
}

/**
 * Helper function to create error response
 */
export function createErrorResponse(error: Error | AppError): ErrorResponse {
  if (error instanceof AppError) {
    return error.toResponse();
  }
  
  // For non-AppError errors, return generic internal server error
  return {
    code: ErrorCode.INTERNAL_SERVER_ERROR,
    message: ERROR_MESSAGES[ErrorCode.INTERNAL_SERVER_ERROR],
    statusCode: ERROR_STATUS_CODES[ErrorCode.INTERNAL_SERVER_ERROR],
  };
}

/**
 * Helper function to get user-friendly message for error code
 */
export function getErrorMessage(code: ErrorCode): string {
  return ERROR_MESSAGES[code];
}

/**
 * Helper function to get status code for error code
 */
export function getErrorStatusCode(code: ErrorCode): number {
  return ERROR_STATUS_CODES[code];
}

