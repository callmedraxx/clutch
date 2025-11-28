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
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

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

    // Stop polling service
    import('./services/polymarket/polling.service').then(({ pollingService }) => {
      pollingService.stop();
      logger.info('Polling service stopped');
    }).catch(() => {
      logger.error('Error stopping polling service');
    });
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

  // Start Polymarket polling service
  try {
    const { pollingService } = await import('./services/polymarket/polling.service');
    pollingService.start();
    logger.info('Polymarket polling service started');
  } catch (error) {
    logger.error('Failed to start polling service:', error);
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

