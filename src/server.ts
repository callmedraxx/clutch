import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';
import { setupSwagger } from './config/swagger';
import healthRoutes from './routes/health';
import apiRoutes from './routes/api';
import polymarketRoutes from './routes/polymarket';

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());

// CORS configuration - support multiple origins
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    // Get allowed origins from environment variable (comma-separated)
    // Default to allowing all origins if not specified
    const allowedOrigins = process.env.CORS_ORIGIN 
      ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
      : [];

    // If no CORS_ORIGIN is set, allow all origins (but note: credentials won't work with *)
    // If specific origins are set, check against them
    if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
      // Allow all origins when not specified or '*' is set
      // Note: When using credentials: true, browser will reject '*' but we'll allow the origin
      return callback(null, true);
    }

    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Reject origin
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
};

app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Rate limiting
app.use('/api/', apiLimiter);

// Request logging middleware
app.use((req: Request, _res: Response, next) => {
  logger.info({
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Routes
app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'Clutch Backend API',
    version: '1.0.0',
    documentation: '/api-docs',
    health: '/health',
  });
});

app.use('/health', healthRoutes);
app.use('/api', apiRoutes);
app.use('/api/polymarket', polymarketRoutes);

// Swagger documentation
setupSwagger(app);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  
  // Close server
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close database connections
    import('./config/database').then(({ pool }) => {
      pool.end(() => {
        logger.info('Database pool closed');
        process.exit(0);
      });
    }).catch(() => {
      process.exit(1);
    });
    
    // Close Redis connection
    import('./config/redis').then(({ closeRedisConnection }) => {
      closeRedisConnection().then(() => {
        logger.info('Redis connection closed');
      }).catch(() => {
        logger.error('Error closing Redis connection');
      });
    });

    // Stop teams refresh service
    import('./services/polymarket/teams-refresh.service').then(({ teamsRefreshService }) => {
      teamsRefreshService.stop();
      logger.info('Teams refresh service stopped');
    }).catch(() => {
      logger.error('Error stopping teams refresh service');
    });

    // Stop live games service
    import('./services/polymarket/live-games.service').then(({ liveGamesService }) => {
      liveGamesService.stop();
      logger.info('Live games service stopped');
    }).catch(() => {
      logger.error('Error stopping live games service');
    });

    // Polling service is disabled, no need to stop
  });
};

// Start server
const server = app.listen(PORT, async () => {
  logger.info(`Server is running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`API Documentation: http://localhost:${PORT}/api-docs`);
  
  // Test database and Redis connections
  try {
    const { testConnection } = await import('./config/database');
    const { testRedisConnection } = await import('./config/redis');
    
    await testConnection();
    await testRedisConnection();
  } catch (error) {
    logger.error('Failed to initialize connections:', error);
  }

  // Background polling service disabled - using on-demand fetching with cache instead
  // This reduces API calls and prevents rate limiting
  // Data is fetched only when frontend requests it and cache is expired
  logger.info('Using on-demand fetching with cache (background polling disabled)');

  // Start teams refresh service
  try {
    const { teamsRefreshService } = await import('./services/polymarket/teams-refresh.service');
    teamsRefreshService.start();
    logger.info('Teams refresh service started');
  } catch (error) {
    logger.error('Failed to start teams refresh service:', error);
  }

  // Start live games service
  try {
    const { liveGamesService } = await import('./services/polymarket/live-games.service');
    const { broadcastGameUpdate } = await import('./routes/polymarket');
    
    // Set up SSE broadcast callback
    liveGamesService.setSSEBroadcastCallback(broadcastGameUpdate);
    
    liveGamesService.start();
    logger.info('Live games service started');
  } catch (error) {
    logger.error('Failed to start live games service:', error);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;

