import swaggerJsdoc from 'swagger-jsdoc';
import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Clutch Backend API',
      version: '1.0.0',
      description: 'Production-ready Express.js backend API documentation',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3000}`,
        description: 'Development server',
      },
      {
        url: 'https://api.example.com',
        description: 'Production server',
      },
    ],
    tags: [
      {
        name: 'Health',
        description: 'Health check endpoints',
      },
      {
        name: 'API',
        description: 'API information endpoints',
      },
      {
        name: 'Polymarket',
        description: 'Polymarket market events endpoints - returns transformed and grouped data',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
      },
      schemas: {
        TransformedMarket: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '556074' },
            question: { type: 'string', example: 'Monad market cap >$2B one day after launch?' },
            slug: { type: 'string', example: 'monad-market-cap-fdv-2b-one-day-after-launch' },
            conditionId: { type: 'string' },
            volume: { type: 'number', example: 7362833.35 },
            volume24Hr: { type: 'number', example: 14192724.24 },
            volume1Wk: { type: 'number' },
            volume1Mo: { type: 'number' },
            volume1Yr: { type: 'number' },
            active: { type: 'boolean' },
            closed: { type: 'boolean' },
            archived: { type: 'boolean' },
            image: { type: 'string' },
            icon: { type: 'string' },
            description: { type: 'string' },
            outcomes: { type: 'array', items: { type: 'string' } },
            outcomePrices: { type: 'array', items: { type: 'string' } },
            endDate: { type: 'string' },
            startDate: { type: 'string' },
            lastTradePrice: { type: 'number' },
            bestBid: { type: 'number' },
            bestAsk: { type: 'number' },
            spread: { type: 'number' },
            competitive: { type: 'number' },
            liquidity: { type: 'number' },
            createdAt: { type: 'string' },
            updatedAt: { type: 'string' },
          },
        },
        TransformedEvent: {
          type: 'object',
          description: 'Transformed event with grouped markets. Markets are merged into a single event object.',
          properties: {
            id: { type: 'string', example: '29001' },
            title: { type: 'string', example: 'Monad FDV one day after launch?' },
            slug: { type: 'string', example: 'monad-market-cap-fdv-one-day-after-launch' },
            description: { type: 'string' },
            image: { type: 'string' },
            icon: { type: 'string' },
            totalVolume: { type: 'number', example: 43061962.40 },
            volume24Hr: { type: 'number', example: 14192724.24 },
            volume1Wk: { type: 'number' },
            volume1Mo: { type: 'number' },
            volume1Yr: { type: 'number' },
            liquidity: { type: 'number' },
            openInterest: { type: 'number' },
            competitive: { type: 'number' },
            active: { type: 'boolean' },
            closed: { type: 'boolean' },
            archived: { type: 'boolean' },
            restricted: { type: 'boolean' },
            featured: { type: 'boolean' },
            commentCount: { type: 'number' },
            markets: {
              type: 'array',
              description: 'All markets grouped under this event',
              items: { $ref: '#/components/schemas/TransformedMarket' },
            },
            tags: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  label: { type: 'string' },
                  slug: { type: 'string' },
                },
              },
            },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            createdAt: { type: 'string' },
            updatedAt: { type: 'string' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            hasMore: { type: 'boolean', example: true },
            totalResults: { type: 'number', example: 4588 },
            offset: { type: 'number', example: 0 },
            limit: { type: 'number', example: 20 },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'POLYMARKET_FETCH_FAILED' },
                message: { type: 'string', example: 'Unable to fetch market data. Please try again later.' },
                statusCode: { type: 'number', example: 503 },
              },
            },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts', './src/server.ts'],
};

const swaggerSpec = swaggerJsdoc(options);

export const setupSwagger = (app: Express): void => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Clutch Backend API Documentation',
  }));

  // Swagger JSON endpoint
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
};

export default swaggerSpec;

