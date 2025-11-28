# Clutch Backend

Production-ready Express.js backend with TypeScript, PostgreSQL, Redis, and Swagger documentation.

## Features

- ✅ **Express.js** with TypeScript
- ✅ **PostgreSQL** database with connection pooling
- ✅ **Redis** for caching and session management
- ✅ **Swagger/OpenAPI** documentation
- ✅ **Docker** and Docker Compose setup
- ✅ **Production-ready** features:
  - Winston logging
  - Error handling middleware
  - Rate limiting
  - Health check endpoints
  - Security headers (Helmet)
  - CORS configuration
  - Request compression
  - Graceful shutdown

## Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Docker and Docker Compose (for containerized setup)

## Quick Start

### Using Docker Compose (Recommended)

1. Clone the repository and navigate to the project directory:
```bash
cd clutch_backend
```

2. Create a `.env` file from the example:
```bash
cp .env.example .env
```

3. **Important**: Update the `.env` file with your actual credentials. The `.env` file contains all sensitive configuration including database passwords, Redis passwords, and API keys. Never commit the `.env` file to version control.

4. Start all services:
```bash
docker-compose up -d
```

This will start:
- Express.js application on port 3000
- PostgreSQL database on port 5432
- Redis on port 6379

5. Access the API:
- API: http://localhost:3000
- API Documentation (Swagger): http://localhost:3000/api-docs
- Health Check: http://localhost:3000/health

### Local Development Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file:
```bash
cp .env.example .env
```

3. Update the `.env` file with your local database and Redis configuration

4. Start PostgreSQL and Redis (using Docker Compose for just the services):
```bash
docker-compose up -d postgres redis
```

5. Run database migrations:
```bash
npm run build
npm run migrate
```

6. Start the development server:
```bash
npm run dev
```

## Project Structure

```
clutch_backend/
├── src/
│   ├── config/
│   │   ├── database.ts      # PostgreSQL connection pool
│   │   ├── redis.ts         # Redis client configuration
│   │   ├── logger.ts        # Winston logger setup
│   │   └── swagger.ts       # Swagger/OpenAPI configuration
│   ├── middleware/
│   │   ├── errorHandler.ts  # Error handling middleware
│   │   └── rateLimiter.ts   # Rate limiting middleware
│   ├── routes/
│   │   ├── health.ts        # Health check endpoints
│   │   └── api.ts           # API routes
│   ├── database/
│   │   └── migrate.ts       # Database migrations
│   └── server.ts            # Express app entry point
├── dist/                    # Compiled JavaScript (generated)
├── logs/                    # Application logs
├── Dockerfile               # Production Docker image
├── docker-compose.yml       # Docker Compose configuration
├── tsconfig.json            # TypeScript configuration
└── package.json             # Dependencies and scripts
```

## Environment Variables

Key environment variables (see `.env.example` for full list):

- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 3000)
- `DATABASE_URL` - PostgreSQL connection string
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` - Database config
- `DB_POOL_MIN`, `DB_POOL_MAX` - Connection pool settings
- `REDIS_URL` - Redis connection string
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` - Redis config
- `RATE_LIMIT_WINDOW_MS` - Rate limit window (default: 15 minutes)
- `RATE_LIMIT_MAX_REQUESTS` - Max requests per window (default: 100)
- `LOG_LEVEL` - Logging level (default: info)

## API Endpoints

### Health Checks

- `GET /health` - Overall health check (database + Redis)
- `GET /health/ready` - Readiness probe
- `GET /health/live` - Liveness probe

### API

- `GET /api` - API information
- `GET /api-docs` - Swagger UI documentation
- `GET /api-docs.json` - OpenAPI JSON specification

## Database Migrations

Run migrations after building:
```bash
npm run build
npm run migrate
```

## Production Deployment

### Building the Docker Image

```bash
docker build -t clutch-backend .
```

### Running with Docker Compose

```bash
docker-compose up -d
```

### Monitoring

- Check logs: `docker-compose logs -f app`
- Check health: `curl http://localhost:3000/health`
- View API docs: http://localhost:3000/api-docs

## Development

### Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm run start` - Start production server
- `npm run migrate` - Run database migrations
- `npm run lint` - Run ESLint

### Adding New Routes

1. Create a new route file in `src/routes/`
2. Import and use it in `src/server.ts`
3. Add Swagger documentation using JSDoc comments

Example:
```typescript
/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/', async (req, res) => {
  // Your code here
});
```

## Performance Considerations

- **Connection Pooling**: PostgreSQL uses connection pooling (2-20 connections by default)
- **Redis Caching**: Use Redis for caching frequently accessed data
- **Rate Limiting**: Configured to prevent abuse (100 requests per 15 minutes by default)
- **Compression**: Response compression enabled for better performance
- **Health Checks**: Kubernetes/Docker health checks configured

## Security

- Helmet.js for security headers
- CORS configuration
- Rate limiting
- Environment variable management
- Non-root Docker user
- Input validation ready (express-validator included)

## Troubleshooting

### Database Connection Issues

- Verify PostgreSQL is running: `docker-compose ps postgres`
- Check connection string in `.env`
- Verify database credentials

### Redis Connection Issues

- Verify Redis is running: `docker-compose ps redis`
- Check Redis password in `.env`
- Test connection: `docker-compose exec redis redis-cli -a clutch_redis_password ping`

### Port Conflicts

- Change ports in `docker-compose.yml` if 3000, 5432, or 6379 are in use
- Update `.env` file accordingly

## Sample Frontend

A sample frontend is included to test the Polymarket transformer data structure. It demonstrates how to use the `groupedOutcomes` and other card-friendly fields.

### Running the Sample Frontend

1. Make sure your backend is running on `http://localhost:3000`

2. Navigate to the sample frontend directory:
```bash
cd sample-frontend
```

3. Serve the frontend (choose one method):

**Using the provided script:**
```bash
./serve.sh
```

**Using Python:**
```bash
python3 -m http.server 8000
```

**Using Node.js:**
```bash
npx http-server -p 8000
```

4. Open `http://localhost:8000` in your browser

The frontend will:
- Display market events as cards
- Show grouped outcomes with probabilities, prices, and volumes
- Support different categories (trending, politics, crypto, finance, sports)
- Display statistics about group items vs regular markets

See `sample-frontend/README.md` for more details.

## License

ISC

# clutch
