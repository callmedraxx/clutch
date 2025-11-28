import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { AppError, createErrorResponse, ErrorCode } from '../utils/errors';

export const errorHandler = (
  err: AppError | Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Use centralized error response if it's an AppError
  if (err instanceof AppError) {
    const errorResponse = createErrorResponse(err);
    
    logger.error({
      error: {
        code: errorResponse.code,
        message: err.userMessage || errorResponse.message,
        internalMessage: err.internalMessage,
        statusCode: errorResponse.statusCode,
        stack: err.stack,
        path: req.path,
        method: req.method,
      },
    });

    res.status(errorResponse.statusCode).json({
      success: false,
      error: errorResponse,
    });
    return;
  }

  // Fallback for non-AppError errors
  const statusCode = (err as AppError).statusCode || 500;
  const message = err.message || 'Internal Server Error';

  logger.error({
    error: {
      message,
      stack: err.stack,
      statusCode,
      path: req.path,
      method: req.method,
    },
  });

  res.status(statusCode).json({
    success: false,
    error: {
      message: process.env.NODE_ENV === 'production' && statusCode === 500
        ? 'Internal Server Error'
        : message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  });
};

export const notFoundHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const error = new AppError(
    ErrorCode.NOT_FOUND,
    `Route ${req.originalUrl} not found`
  );
  next(error);
};

