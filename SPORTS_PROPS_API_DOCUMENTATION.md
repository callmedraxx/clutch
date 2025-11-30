# Sports Props API Integration Documentation

## Overview

The Sports Props API allows your frontend to fetch sports prop markets from Polymarket. The API supports fetching props for individual sports or all sports merged together, with built-in pagination support.

## Base Endpoint

```
GET /api/polymarket/sports-props
```

## Request Parameters

### Required Parameters
- None (sport parameter is optional)

### Optional Parameters

#### `sport` (string, optional)
- **Values**: `nfl`, `nba`, `mlb`, `nhl`, `ufc`, `epl`, `la-liga`, or `all`
- **Default behavior**: If omitted or set to `all`, returns props for all sports merged together
- **Usage**: 
  - Use a specific sport value (e.g., `nfl`) to fetch props for that sport only
  - Use `all` or omit the parameter to fetch props for all sports merged together

#### `page` (integer, optional)
- **Minimum**: 1
- **Default**: 1
- **Usage**: 
  - For single sport: Each page returns 12 results for that sport
  - For all sports: Page N fetches page N for each sport, then merges and sorts all results
- **Note**: Mutually exclusive with `offset` - use one or the other, not both

#### `offset` (integer, optional)
- **Minimum**: 0
- **Usage**: Alternative to `page` for more granular control
  - For single sport: Direct offset (0, 12, 24, etc.)
  - For all sports: Offset is converted to page number for each sport
- **Note**: Mutually exclusive with `page` - use one or the other, not both

## Request Examples

### Fetch All Sports (Default)
```
GET /api/polymarket/sports-props
GET /api/polymarket/sports-props?sport=all
GET /api/polymarket/sports-props?sport=all&page=1
```

### Fetch Specific Sport
```
GET /api/polymarket/sports-props?sport=nfl
GET /api/polymarket/sports-props?sport=nfl&page=2
GET /api/polymarket/sports-props?sport=nba&page=1
```

### Pagination Examples
```
GET /api/polymarket/sports-props?sport=all&page=2
GET /api/polymarket/sports-props?sport=nfl&offset=12
```

## Response Structure

### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "event-id",
        "title": "Event Title",
        "slug": "event-slug",
        "sport": "nfl",  // Only present when fetching all sports
        "description": "Event description",
        "image": "image-url",
        "icon": "icon-url",
        "totalVolume": 1234567.89,
        "volume24Hr": 12345.67,
        "volume1Wk": 123456.78,
        "volume1Mo": 1234567.89,
        "volume1Yr": 12345678.90,
        "liquidity": 123456.78,
        "openInterest": 0,
        "competitive": 0.95,
        "active": true,
        "closed": false,
        "archived": false,
        "restricted": false,
        "featured": false,
        "commentCount": 0,
        "markets": [
          {
            "id": "market-id",
            "question": "Market question",
            "slug": "market-slug",
            "conditionId": "condition-id",
            "volume": 123456.78,
            "volume24Hr": 1234.56,
            "volume1Wk": 12345.67,
            "volume1Mo": 123456.78,
            "volume1Yr": 1234567.89,
            "active": true,
            "closed": false,
            "archived": false,
            "image": "image-url",
            "icon": "icon-url",
            "description": "Market description",
            "structuredOutcomes": [
              {
                "label": "Yes",
                "shortLabel": "YES",
                "price": "0.8500",
                "probability": 85,
                "volume": 123456,
                "icon": "icon-url",
                "clobTokenId": "token-id",
                "conditionId": "condition-id"
              },
              {
                "label": "No",
                "shortLabel": "NO",
                "price": "0.1500",
                "probability": 15,
                "volume": 12345,
                "icon": "icon-url",
                "clobTokenId": "token-id",
                "conditionId": "condition-id"
              }
            ],
            "clobTokenIds": ["token-id-1", "token-id-2"],
            "endDate": "2026-01-06T12:00:00Z",
            "startDate": "2025-05-01T00:20:58.274Z",
            "lastTradePrice": 0.84,
            "bestBid": 0.80,
            "bestAsk": 0.83,
            "spread": 0.03,
            "competitive": 0.95,
            "liquidity": 12345.67
          }
        ],
        "tags": [
          {
            "id": "tag-id",
            "label": "NFL",
            "slug": "nfl"
          }
        ],
        "startDate": "2025-05-01T00:23:20.500815Z",
        "endDate": "2026-01-06T12:00:00Z",
        "createdAt": "2025-04-30T12:28:35.961983Z",
        "updatedAt": "2025-11-30T13:06:07.243842Z",
        "hasGroupItems": false,
        "groupedOutcomes": [
          {
            "label": "Tampa Bay",
            "shortLabel": "TAM",
            "price": "0.8150",
            "probability": 81,
            "volume": 123456,
            "icon": "icon-url",
            "clobTokenId": "token-id"
          }
        ]
      }
    ],
    "pagination": {
      "hasMore": true,
      "totalResults": 84,
      "offset": 0,
      "limit": 84
    }
  }
}
```

### Error Response (400 Bad Request)

```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid sport: invalid_sport. Available sports: nfl, nba, mlb, nhl, ufc, epl, la-liga",
    "statusCode": 400
  }
}
```

## Integration Guide for Frontend

### 1. Filter Button Integration

Your UI shows filter buttons: "All Sports", "NFL", "NBA", "MLB", "NHL", "Soccer", "UFC/MMA"

**Mapping:**
- **"All Sports"** → Omit `sport` parameter or use `sport=all`
- **"NFL"** → `sport=nfl`
- **"NBA"** → `sport=nba`
- **"MLB"** → `sport=mlb`
- **"NHL"** → `sport=nhl`
- **"Soccer"** → Use `sport=epl` or `sport=la-liga` (or fetch both separately)
- **"UFC/MMA"** → `sport=ufc`

**Implementation:**
- When user clicks "All Sports", make request without `sport` parameter or with `sport=all`
- When user clicks a specific sport button, include `sport={sport_name}` in the request
- Store the selected sport filter in component state to maintain selection

### 2. Extracting and Grouping Data

#### When Fetching All Sports (`sport=all` or omitted)

Each event in the response includes a `sport` field that identifies which sport it belongs to. Use this field to group events:

1. **Extract the `events` array** from `response.data.events`
2. **Group by `sport` field**: 
   - Iterate through events
   - For each event, check the `sport` field (values: `nfl`, `nba`, `mlb`, `nhl`, `ufc`, `epl`, `la-liga`)
   - Group events into separate arrays by sport name
3. **Display grouped results**:
   - You can show all events together (already sorted by volume)
   - Or create separate sections/tabs for each sport
   - The `sport` field allows you to filter/group on the frontend without additional API calls

#### When Fetching Single Sport

Events do not include the `sport` field since all events belong to the same sport. Simply use the `events` array directly.

### 3. Displaying Market Cards

For each event in the `events` array:

1. **Event Title**: Use `event.title`
2. **Event Image/Icon**: Use `event.image` or `event.icon`
3. **Markets**: Iterate through `event.markets` array
4. **Outcomes**: For each market, use `market.structuredOutcomes` array
   - Each outcome has:
     - `label`: Full outcome name (e.g., "Tampa Bay Buccaneers")
     - `shortLabel`: Short abbreviation (e.g., "TAM")
     - `probability`: Percentage (0-100)
     - `price`: Price as string (e.g., "0.8150")
     - `clobTokenId`: Token ID for trading (if available)
5. **Volume**: Display `event.volume24Hr` for 24-hour volume
6. **Probability**: Use `outcome.probability` for percentage display

### 4. Handling Pagination

#### Pagination State

The response includes a `pagination` object with:
- `hasMore`: Boolean indicating if more results are available
- `totalResults`: Total number of events in current response
- `offset`: Current offset value
- `limit`: Number of results in current response

#### Loading More Data

**For Single Sport:**
- Start with `page=1` (or omit page parameter)
- When user scrolls to bottom or clicks "Load More":
  - Increment page number: `page=2`, `page=3`, etc.
  - Append new events to existing list
  - Stop when `pagination.hasMore` is `false`

**For All Sports:**
- Page N fetches page N for each sport, then merges results
- Same pagination logic applies:
  - Start with `page=1`
  - Increment page for next batch
  - Append results to existing list
  - Stop when `pagination.hasMore` is `false`

#### Infinite Scroll Implementation

1. Track current page number in component state
2. Initially fetch with `page=1`
3. When user scrolls near bottom:
   - Check if `pagination.hasMore` is `true`
   - If true, increment page and fetch next page
   - Append new events to existing array
   - Update pagination state

#### Load More Button Implementation

1. Display "Load More" button when `pagination.hasMore` is `true`
2. On click:
   - Increment current page
   - Fetch next page
   - Append to existing events
   - Hide button when `pagination.hasMore` becomes `false`

### 5. Price History Integration

To determine if price history should be fetched for a market:

**Check for these fields in the market object:**
- `market.volume24Hr` - Must be present and have a value
- `market.volume24HrClob` - Should be present (indicates CLOB trading activity)
- `market.clobTokenIds` - Must be present and non-empty array

**Logic:**
- If `volume24Hr` exists and has a value > 0, the market has recent trading activity
- If `clobTokenIds` array exists and has at least one element, price history can be fetched
- Use the first `clobTokenId` from `market.structuredOutcomes[0].clobTokenId` or `market.clobTokenIds[0]` to fetch price history

**Note:** Markets without `volume24Hr` or `volume24HrClob` fields likely don't have price history available and should not trigger price history API calls.

### 6. Error Handling

**Invalid Sport:**
- Response: 400 Bad Request
- Error message includes available sports
- Display error message to user
- Reset to default "All Sports" filter

**Network Errors:**
- Handle timeout and connection errors
- Show user-friendly error message
- Provide retry option

**Empty Results:**
- When `events` array is empty, show "No markets available" message
- Check `pagination.hasMore` to determine if pagination should be disabled

### 7. UI State Management

**Loading States:**
- Show loading indicator when fetching initial data
- Show loading indicator when fetching next page (if using infinite scroll)
- Disable filter buttons during loading

**Selected Filter:**
- Highlight the active sport filter button
- Store selected filter in component state
- Update URL query parameters if using URL-based state

**Data Refresh:**
- Optionally implement pull-to-refresh
- Refetch data when filter changes
- Clear existing events when filter changes

### 8. Search Integration

Your UI shows a "Search market" input field. While the sports props API doesn't include search functionality, you can:

1. **Client-side filtering**: Filter the fetched events array by title, description, or market question
2. **Use existing search endpoint**: If you have a general search endpoint, use that for market search
3. **Debounce search input**: Wait for user to stop typing before filtering

### 9. Response Data Usage Summary

**Event-level data:**
- `event.title` - Display as card header
- `event.image` / `event.icon` - Display as event image
- `event.volume24Hr` - Show 24-hour volume
- `event.totalVolume` - Show total volume
- `event.sport` - Use for grouping (only when fetching all sports)

**Market-level data:**
- `market.question` - Display as market question
- `market.structuredOutcomes` - Display outcomes with probabilities
- `market.volume24Hr` - Check for price history availability
- `market.clobTokenIds` - Use for trading/token operations

**Outcome-level data:**
- `outcome.label` - Full outcome name
- `outcome.shortLabel` - Abbreviation
- `outcome.probability` - Percentage to display
- `outcome.price` - Price value
- `outcome.clobTokenId` - Token ID for price history or trading

## Best Practices

1. **Caching**: Cache responses to avoid unnecessary API calls when switching between filters
2. **Debouncing**: Debounce filter changes to avoid rapid API calls
3. **Error Recovery**: Implement retry logic for failed requests
4. **Loading States**: Always show loading indicators during data fetching
5. **Empty States**: Handle empty results gracefully with helpful messages
6. **Pagination**: Load next page only when user requests it (scroll or button click)
7. **Data Freshness**: Consider refetching data periodically for active markets
8. **Performance**: For "All Sports", consider fetching in the background and showing cached data while new data loads

## API Rate Limits

- Be mindful of API rate limits
- Implement request throttling if making multiple rapid requests
- Cache responses appropriately to reduce API calls

## Support

For API issues or questions, refer to the Swagger documentation at `/api-docs` endpoint.
