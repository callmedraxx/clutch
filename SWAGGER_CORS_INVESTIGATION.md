# Swagger & CORS Investigation Report

## Executive Summary

✅ **Swagger is correctly picking up all endpoint routes from the source files**
✅ **The `series-summary` endpoint is properly registered in Swagger**
✅ **The endpoint works correctly (returns 200 OK)**
⚠️ **CORS headers are being sent, but there may be configuration issues affecting Swagger UI**

## Findings

### 1. Swagger Route Registration ✅

**Status: WORKING CORRECTLY**

- Total endpoints in Swagger: **20 endpoints**
- Swagger configuration points to: `src/routes/*.ts` and `src/server.ts`
- Dockerfile correctly copies `src/` directory to production (line 39)
- The `series-summary` endpoint **IS** in Swagger JSON:
  - `/api/polymarket/series-summary/sport/{sport}`
  - `/api/polymarket/series-summary/{seriesId}`

**Confirmed in `/api-docs.json`:**
```json
{
  "paths": {
    "/api/polymarket/series-summary/sport/{sport}": { ... },
    "/api/polymarket/series-summary/{seriesId}": { ... }
  }
}
```

### 2. Endpoint Functionality ✅

**Status: WORKING**

The endpoint responds correctly:
```bash
curl -X GET 'https://dev.api.tryclutch.app/api/polymarket/series-summary/sport/nfl'
# Returns: 200 OK with valid JSON data
```

### 3. CORS Configuration Analysis ⚠️

**Status: NEEDS ATTENTION**

**Current CORS Configuration:**
- CORS middleware is configured at line 58 in `src/server.ts`
- Allows all origins when `CORS_ORIGIN` env var is not set or is `*`
- When `CORS_ORIGIN` is set with specific origins, only those are allowed
- CORS headers ARE being sent:
  - `access-control-allow-origin` ✅
  - `access-control-allow-credentials: true` ✅
  - `access-control-allow-methods: GET,POST,PUT,DELETE,OPTIONS` ✅
  - `access-control-allow-headers: Content-Type,Authorization,X-API-Key` ✅

**Potential Issues:**

1. **Swagger UI Same-Origin Requests:**
   - When Swagger UI runs from `https://dev.api.tryclutch.app/api-docs`, it makes requests to the same origin
   - Browsers may still apply CORS policies depending on how requests are made
   - If Swagger UI is embedded via iframe or uses fetch/XHR, CORS headers are still checked

2. **Missing CORS Headers in Some Responses:**
   - GET requests only include CORS headers when `Origin` header is present
   - Some clients might not send `Origin` header, causing CORS failures
   - The `cors` middleware should handle this, but may need verification

3. **CORS Configuration for Swagger UI:**
   - Swagger UI might need explicit configuration to allow requests
   - The `credentials: true` setting can cause issues with wildcard origins

## Issues Identified

### Issue #1: CORS Headers Not Always Present

**Problem:** When making requests without an `Origin` header (like direct curl), CORS headers are not included. This shouldn't affect browsers, but Swagger UI might have issues.

**Evidence:**
- Direct GET request without Origin header: No CORS headers
- GET request with Origin header: CORS headers present
- OPTIONS request (preflight): CORS headers present

### Issue #2: Swagger UI Configuration

**Problem:** Swagger UI might not be configured to properly handle CORS for requests made from the documentation page.

**Current Swagger Setup:**
```typescript
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Clutch Backend API Documentation',
}));
```

**Missing:** No explicit CORS configuration for Swagger UI endpoints or request handling.

### Issue #3: Environment Variable Configuration

**Problem:** The `CORS_ORIGIN` environment variable behavior:
- If not set → allows all origins (wildcard behavior)
- If set to `*` → allows all origins
- If set to specific origins → only those are allowed

This could cause issues if:
- Production has `CORS_ORIGIN` set to specific domains
- Swagger UI needs to make requests from a different origin
- Frontend applications are on different domains

## Recommendations

### Fix #1: Ensure CORS Headers Always Present

**Action:** Modify CORS configuration to always send CORS headers, not just when Origin is present.

**File:** `src/server.ts`

**Change:** Add explicit CORS header configuration to ensure headers are always sent for API routes.

### Fix #2: Add Swagger-Specific CORS Configuration

**Action:** Add explicit CORS headers for Swagger UI endpoints.

**File:** `src/config/swagger.ts` or `src/server.ts`

**Change:** Ensure Swagger UI endpoints have proper CORS headers.

### Fix #3: Improve CORS Error Handling

**Action:** Add better logging for CORS rejections to diagnose issues.

**File:** `src/server.ts`

**Change:** Log CORS origin checks to identify which origins are being rejected.

### Fix #4: Document CORS Configuration

**Action:** Document the expected `CORS_ORIGIN` environment variable format.

**File:** README.md or .env.example

**Format:** `CORS_ORIGIN=https://example.com,https://app.example.com,https://dev.api.tryclutch.app`

## Testing Checklist

- [ ] Test Swagger UI from production URL
- [ ] Test API endpoints from Swagger UI
- [ ] Test CORS from different origins
- [ ] Verify CORS headers in all responses
- [ ] Test preflight (OPTIONS) requests
- [ ] Verify Swagger UI can make authenticated requests

## All Routes in Swagger (20 Total)

1. `/api` - API information
2. `/api/polymarket/events` - Get events
3. `/api/polymarket/events/{eventId}` - Get event by ID
4. `/api/polymarket/game-events/all` - Get all game events
5. `/api/polymarket/game-events/{sport}/{eventWeek}` - Get game events by sport/week
6. `/api/polymarket/injected-urls` - Manage injected URLs
7. `/api/polymarket/injected-urls/{identifier}` - Get injected URL
8. `/api/polymarket/market-clarifications` - Get market clarifications
9. `/api/polymarket/orderbooks` - Get orderbooks
10. `/api/polymarket/price-history` - Get price history
11. `/api/polymarket/refresh/{category}` - Refresh cache
12. `/api/polymarket/search` - Search events
13. `/api/polymarket/series-summary/sport/{sport}` ✅ **Your endpoint**
14. `/api/polymarket/series-summary/{seriesId}` ✅ **Your endpoint**
15. `/api/polymarket/sports-price-history` - Sports price history
16. `/api/polymarket/sports-props` - Sports props
17. `/api/polymarket/teams/{sport}` - Get teams by sport
18. `/health` - Health check
19. `/health/live` - Liveness check
20. `/health/ready` - Readiness check

## Next Steps

1. **WAIT FOR APPROVAL** before making changes
2. Implement recommended fixes
3. Test thoroughly in staging environment
4. Deploy to production
5. Monitor CORS errors in logs

