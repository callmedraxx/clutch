import swaggerJsdoc from 'swagger-jsdoc';
import { Express, Request } from 'express';
import swaggerUi from 'swagger-ui-express';
import path from 'path';

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
        url: '/',
        description: 'Current server (auto-detected)',
      },
      {
        url: `http://localhost:${process.env.PORT || 3000}`,
        description: 'Development server',
      },
      {
        url: process.env.API_BASE_URL || `https://dev.api.tryclutch.app`,
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
        TransformedOutcome: {
          type: 'object',
          description: 'Transformed outcome with probability and pricing information',
          properties: {
            label: { type: 'string', example: 'Yes' },
            shortLabel: { type: 'string', example: 'YES' },
            price: { type: 'string', example: '18.5', description: 'Price in cents' },
            probability: { type: 'number', example: 18, description: 'Probability percentage (0-100)' },
            volume: { type: 'number', example: 221599, description: 'Individual outcome volume' },
            icon: { type: 'string', description: 'Outcome image URL' },
            clobTokenId: { type: 'string', description: 'Token ID for trading' },
            conditionId: { type: 'string', description: 'Condition ID' },
            isWinner: { type: 'boolean', description: 'True if this outcome won (for resolved markets)' },
          },
        },
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
            outcomes: { type: 'array', items: { type: 'string' }, description: 'Deprecated: use structuredOutcomes instead' },
            outcomePrices: { type: 'array', items: { type: 'string' }, description: 'Deprecated: use structuredOutcomes instead' },
            structuredOutcomes: {
              type: 'array',
              description: 'Structured outcomes array with probability and pricing information',
              items: { $ref: '#/components/schemas/TransformedOutcome' },
            },
            isGroupItem: { type: 'boolean', description: 'Indicates if this is part of a group' },
            groupItemTitle: { type: 'string', description: 'Title for group item' },
            groupItemThreshold: { type: 'string', description: 'Threshold for group item' },
            clobTokenIds: { type: 'array', items: { type: 'string' }, description: 'Token IDs for trading' },
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
            closedTime: { type: 'string', description: 'Time when market was closed' },
            resolvedBy: { type: 'string', description: 'Who resolved the market' },
            resolutionSource: { type: 'string', description: 'Source of resolution' },
            umaResolutionStatus: { type: 'string', description: 'UMA resolution status' },
            automaticallyResolved: { type: 'boolean', description: 'Whether market was automatically resolved' },
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
            hasGroupItems: { type: 'boolean', description: 'Indicates if event has group items' },
            groupedOutcomes: {
              type: 'array',
              description: 'Aggregated outcomes from group items or best market, sorted by probability',
              items: { $ref: '#/components/schemas/TransformedOutcome' },
            },
            closedTime: { type: 'string', description: 'Time when event was closed' },
            isResolved: { type: 'boolean', description: 'Computed: true if event or all markets are resolved' },
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
  apis: [
    // Use absolute paths to source files (needed for swagger-jsdoc to find JSDoc comments)
    path.resolve(process.cwd(), 'src/routes/*.ts'),
    path.resolve(process.cwd(), 'src/server.ts'),
  ],
};

const swaggerSpec = swaggerJsdoc(options);

export const setupSwagger = (app: Express): void => {
  // Create a dynamic Swagger spec that uses the current server URL
  const swaggerUiHandler = swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Clutch Backend API Documentation',
    swaggerOptions: {
      // Use the first server (relative path '/') by default
      // This ensures all requests are same-origin
      url: '/api-docs.json',
      // Default to relative server URL to avoid CORS issues
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 1,
      persistAuthorization: true,
      // Configure request interceptor to use relative URLs
      requestInterceptor: (req: any) => {
        // Convert absolute URLs to relative URLs for same-origin requests
        if (typeof req.url === 'string' && req.url.startsWith('http')) {
          try {
            const url = new URL(req.url);
            // Extract pathname and query, making it relative
            req.url = url.pathname + url.search;
          } catch (e) {
            // If URL parsing fails, use as-is
          }
        }
        return req;
      },
    },
  });

  app.use('/api-docs', swaggerUi.serve, swaggerUiHandler);

  // Swagger JSON endpoint with CORS headers
  app.get('/api-docs.json', (_req: Request, res) => {
    // Create a modified spec with the current server URL
    const protocol = _req.protocol;
    const host = _req.get('host');
    const baseUrl = `${protocol}://${host}`;
    
    // Clone the spec and update servers
    const dynamicSpec = JSON.parse(JSON.stringify(swaggerSpec));
    dynamicSpec.servers = [
      {
        url: '/',
        description: 'Current server (same origin)',
      },
      {
        url: baseUrl,
        description: 'Current server (absolute URL)',
      },
      ...(dynamicSpec.servers?.filter((s: any) => s.url !== '/' && s.url !== baseUrl) || []),
    ];

    res.setHeader('Content-Type', 'application/json');
    res.send(dynamicSpec);
  });
};

export default swaggerSpec;

