# Search Endpoint Documentation for Frontend Integration

## Overview

This documentation provides complete instructions for integrating the `/api/polymarket/search` endpoint with the frontend application, specifically for the Politics, Crypto, Finance, and Sports pages.

## Endpoint Details

**Base URL:** `/api/polymarket/search`  
**Method:** `GET`  
**Content-Type:** `application/json`

## Required Parameters

At least ONE of the following must be provided:
- `q` (search query string)
- `tag_slug` (category filter)
- `recurrence` (frequency filter)

## Query Parameters

### Search Parameters

- `q` (string, optional): Text search query. Required if `tag_slug` and `recurrence` are not provided.
- `tag_slug` (string, optional): Category filter. Required if `q` and `recurrence` are not provided.
  - Valid values: `"politics"`, `"crypto"` (use `"15M"`), `"sports"`, or other category slugs
  - **Note:** Finance category does not support `tag_slug` - use text search (`q`) instead
- `recurrence` (string, optional): Frequency filter. Required if `q` and `tag_slug` are not provided.
  - Valid values: `"daily"`, `"weekly"`, `"monthly"`

### Pagination Parameters

- `page` (integer, optional): Page number (default: `1`, minimum: `1`)
- `limit_per_type` (integer, optional): Results per page (default: `20`, range: `1-50`)

### Filter Parameters

- `type` (string, optional): Search type (default: `"events"`)
  - Valid values: `"events"`, `"markets"`
- `events_status` (string, optional): Event status filter (default: `"active"`)
  - Valid values: `"active"`, `"resolved"`
- `sort` (string, optional): Sort option (default: `"volume_24hr"`)
  - Valid values: `"volume_24hr"`, `"end_date"`, `"start_date"`, `"volume"`, `"liquidity"`, `"closed_time"`, `"competitive"`
- `ascending` (boolean, optional): Sort direction (default: `false`)
  - Valid values: `"true"`, `"false"` (as strings in query params)

### Advanced Parameters

- `presets` (array, optional): Preset filters (default: `["EventsTitle", "Events"]`)
  - Can be passed as multiple query params: `?presets=EventsTitle&presets=Events`

## Category-Specific Integration

### Politics Page

When user is on the Politics page and clicks search:

**Important Limitation:** The backend cannot combine text search (`q`) with category filtering (`tag_slug`) in a single request. When `tag_slug` is provided, the backend uses `/events/pagination` which ignores the `q` parameter.

**Option 1: Text Search Only (Recommended)**
1. Use only `q={searchText}` for text search
2. Filter results client-side by checking if events have "politics" tag
3. Combine with other filters as needed

**Example Request:**
```
GET /api/polymarket/search?q=trump&page=1&limit_per_type=20&events_status=active&sort=volume_24hr&ascending=false
```

**Option 2: Category Only**
1. Use only `tag_slug=politics` to get all politics markets
2. Filter results client-side by searching event titles/descriptions for the search term
3. Combine with other filters as needed

**Example Request:**
```
GET /api/polymarket/search?tag_slug=politics&page=1&limit_per_type=20&events_status=active&sort=volume_24hr&ascending=false
```

### Crypto Page

When user is on the Crypto page and clicks search:

**Important Limitation:** The backend cannot combine text search (`q`) with category filtering (`tag_slug`) in a single request. When `tag_slug` is provided, the backend uses `/events/pagination` which ignores the `q` parameter.

**Option 1: Text Search Only (Recommended)**
1. Use only `q={searchText}` for text search
2. Filter results client-side by checking if events have crypto-related tags
3. Combine with other filters as needed

**Example Request:**
```
GET /api/polymarket/search?q=bitcoin&page=1&limit_per_type=20&events_status=active&sort=volume_24hr&ascending=false
```

**Option 2: Category Only**
1. Use only `tag_slug=15M` to get all crypto markets
2. Filter results client-side by searching event titles/descriptions for the search term
3. Combine with other filters as needed

**Example Request:**
```
GET /api/polymarket/search?tag_slug=15M&page=1&limit_per_type=20&events_status=active&sort=volume_24hr&ascending=false
```

### Finance Page

When user is on the Finance page and clicks search:

1. **Important:** Finance category does not support `tag_slug` parameter. The backend uses `tag_id=120` for finance, but the search endpoint only accepts `tag_slug`.
2. Use text search with `q` parameter to search within finance-related markets
3. Include finance-related keywords in the search query to scope results
4. Combine with other filters as needed

**Example Request:**
```
GET /api/polymarket/search?q=interest%20rate&page=1&limit_per_type=20&events_status=active&sort=volume_24hr&ascending=false
```

**Alternative Approach for Finance:**
If you need to ensure finance-only results, you may need to:
- Use specific finance-related search terms
- Filter results client-side based on event tags/categories
- Or use the regular `/api/polymarket/events?category=finance` endpoint for category browsing

### Sports Page

When user is on the Sports page and clicks search:

**Important Limitation:** The backend cannot combine text search (`q`) with category filtering (`tag_slug`) in a single request. When `tag_slug` is provided, the backend uses `/events/pagination` which ignores the `q` parameter.

**Option 1: Text Search Only (Recommended)**
1. Use only `q={searchText}` for text search
2. Filter results client-side by checking if events have "sports" tag
3. Combine with other filters as needed

**Example Request:**
```
GET /api/polymarket/search?q=nfl&page=1&limit_per_type=20&events_status=active&sort=volume_24hr&ascending=false
```

**Option 2: Category Only**
1. Use only `tag_slug=sports` to get all sports markets
2. Filter results client-side by searching event titles/descriptions for the search term
3. Combine with other filters as needed

**Example Request:**
```
GET /api/polymarket/search?tag_slug=sports&page=1&limit_per_type=20&events_status=active&sort=volume_24hr&ascending=false
```

## Filter Combinations

### Basic Search (Text Only)
```
?q={searchText}&page=1&limit_per_type=20
```

### Category Only (No Text Search)
```
?tag_slug={category}&page=1&limit_per_type=20
```

**Note:** Category (`tag_slug`) and text search (`q`) cannot be combined in a single request. The backend uses different endpoints:
- With `tag_slug`: Uses `/events/pagination` (ignores `q` parameter)
- With `q` only: Uses `/public-search` (supports text search)

To search within a category, use text search (`q`) and filter results client-side by checking event tags.

### Category + Recurrence
```
?tag_slug={category}&recurrence={daily|weekly|monthly}&page=1&limit_per_type=20
```

### Category + Status Filter
```
?tag_slug={category}&events_status={active|resolved}&page=1&limit_per_type=20
```

### Category + Sort
```
?tag_slug={category}&sort={sortOption}&ascending={true|false}&page=1&limit_per_type=20
```

### Text + Recurrence (No Category)
```
?q={searchText}&recurrence={daily|weekly|monthly}&page=1&limit_per_type=20
```

### Recurrence Only (No Category)
```
?recurrence={daily|weekly|monthly}&page=1&limit_per_type=20
```

### Full Filter Combination (Category Only)
```
?tag_slug={category}&recurrence={frequency}&events_status={status}&sort={sortOption}&ascending={true|false}&type={events|markets}&page={page}&limit_per_type={limit}
```

### Full Filter Combination (Text Search Only)
```
?q={searchText}&recurrence={frequency}&events_status={status}&sort={sortOption}&ascending={true|false}&type={events|markets}&page={page}&limit_per_type={limit}
```

**Note:** `tag_slug` and `q` cannot be combined. Use one or the other, then filter client-side.

## Pagination Implementation

### Response Structure

```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "string",
        "title": "string",
        "slug": "string",
        "markets": [...],
        ...
      }
    ],
    "pagination": {
      "hasMore": boolean,
      "totalResults": number,
      "offset": number,
      "limit": number
    }
  },
  "message": "Optional message when no results"
}
```

### Pagination Logic

1. Start with `page=1` for first request
2. Check `pagination.hasMore` to determine if next page exists
3. Calculate total pages: `Math.ceil(pagination.totalResults / limit_per_type)`
4. Increment `page` parameter for next page requests
5. Disable "Next" button when `!pagination.hasMore` or `page >= totalPages`
6. Disable "Previous" button when `page <= 1`

## Frontend Integration Steps

### Step 1: Search Button Handler

When search button is clicked on any category page:

1. Get the current page category (politics, crypto, finance, sports)
2. Get the search input value
3. Build query parameters with category-specific `tag_slug` (except finance)
4. Include any active filters from the filter panel
5. Make GET request to `/api/polymarket/search`
6. Handle response and update UI

### Step 2: Filter Panel Integration

When filters are changed:

1. Update the filter state
2. If search has been performed, trigger new search with updated filters
3. Reset `page=1` when filters change
4. Combine all active filters into query parameters
5. Maintain category scoping (tag_slug) when on category pages

### Step 3: Pagination Controls

1. Display current page and total pages
2. "Previous" button: enabled when `page > 1`
3. "Next" button: enabled when `pagination.hasMore && page < totalPages`
4. On page change, maintain all current filters and only update `page` parameter
5. Update URL query params if using URL state management

### Step 4: URL State Management (Optional)

Consider updating URL query params to allow:

- Bookmarkable search results
- Browser back/forward navigation
- Shareable search links

Example URL structure:
```
/politics?q=trump&page=2&sort=volume_24hr&events_status=active
```

## Default Values Summary

| Parameter | Default Value | Notes |
|-----------|--------------|-------|
| `page` | `1` | First page |
| `limit_per_type` | `20` | Results per page (max: 50) |
| `type` | `"events"` | Search type |
| `events_status` | `"active"` | Event status |
| `sort` | `"volume_24hr"` | Sort option |
| `ascending` | `false` | Sort direction |

## Error Handling

The endpoint returns:

- `400 Bad Request`: Invalid parameters (e.g., missing required params, invalid values)
  - Error response format: `{ "success": false, "error": { "code": "...", "message": "..." } }`
- `503 Service Unavailable`: Backend service error
  - Error response format: `{ "success": false, "error": { "code": "...", "message": "..." } }`
- `200 OK`: Success (may have empty `events` array with `message` field)
  - Success response format: `{ "success": true, "data": { "events": [], "pagination": {} }, "message": "..." }`

Always check `response.success` before processing data.

## Complete Example: Politics Page Search

**Scenario:** User on Politics page searches for "election", filters by "weekly" recurrence, sorts by "end_date" ascending, page 2.

**Request:**
```
GET /api/polymarket/search?tag_slug=politics&q=election&recurrence=weekly&events_status=active&sort=end_date&ascending=true&page=2&limit_per_type=20&type=events
```

## Frontend Code Pattern

```javascript
/**
 * Build search URL for category-specific search
 * @param {string} category - Current page category: 'politics', 'crypto', 'finance', 'sports'
 * @param {string} searchText - User's search query
 * @param {object} filters - Filter object with all active filters
 * @param {number} page - Current page number
 * @returns {string} Complete search URL
 */
function buildSearchUrl(category, searchText, filters, page) {
  const params = new URLSearchParams();
  
  // IMPORTANT: Backend cannot combine q and tag_slug in a single request
  // When tag_slug is provided, the backend uses /events/pagination which ignores q
  // Strategy: Use text search (q) and filter client-side by category tags
  
  // Search text (use this for text search)
  if (searchText && searchText.trim()) {
    params.append('q', searchText.trim());
  }
  
  // Category tag_slug (use this ONLY if you want category browsing without text search)
  // Note: If both q and tag_slug are provided, tag_slug will be used and q will be ignored
  const categoryMap = {
    'politics': 'politics',
    'crypto': '15M',
    'sports': 'sports',
    'finance': null // Finance doesn't support tag_slug
  };
  
  // Only add tag_slug if there's no search text (category browsing mode)
  // If you want to search within a category, use q only and filter client-side
  if (!searchText && categoryMap[category]) {
    params.append('tag_slug', categoryMap[category]);
  }
  
  // Validate: at least one of q, tag_slug, or recurrence must be present
  if (!params.has('q') && !params.has('tag_slug') && !filters.recurrence) {
    // For finance, require search text
    if (category === 'finance') {
      throw new Error('Search text is required for finance category');
    }
    // For other categories, either q or tag_slug should be present
    if (!params.has('tag_slug')) {
      throw new Error('Either search text or category filter is required');
    }
  }
  
  // Filters
  if (filters.recurrence) {
    params.append('recurrence', filters.recurrence);
  }
  if (filters.events_status) {
    params.append('events_status', filters.events_status);
  }
  if (filters.sort) {
    params.append('sort', filters.sort);
  }
  if (filters.ascending !== undefined) {
    params.append('ascending', filters.ascending.toString());
  }
  if (filters.type) {
    params.append('type', filters.type);
  }
  
  // Pagination
  params.append('page', page.toString());
  params.append('limit_per_type', (filters.limit_per_type || 20).toString());
  
  return `/api/polymarket/search?${params.toString()}`;
}

/**
 * Perform search request
 * @param {string} category - Current page category
 * @param {string} searchText - User's search query
 * @param {object} filters - Filter object
 * @param {number} page - Page number
 * @returns {Promise<object>} Search results
 */
async function performSearch(category, searchText, filters, page) {
  try {
    const url = buildSearchUrl(category, searchText, filters, page);
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error?.message || 'Search failed');
    }
    
    return data;
  } catch (error) {
    console.error('Search error:', error);
    throw error;
  }
}

/**
 * Example: Search handler for Politics page
 * Uses text search and filters results client-side by politics tag
 */
async function handlePoliticsSearch(searchText, filters, page = 1) {
  const result = await performSearch('politics', searchText, filters, page);
  
  // Filter results client-side to ensure they're politics-related
  if (result.data && result.data.events) {
    result.data.events = result.data.events.filter(event => {
      // Check if event has politics tag
      return event.tags && event.tags.some(tag => tag.slug === 'politics');
    });
  }
  
  return result;
}

/**
 * Example: Search handler for Crypto page
 */
async function handleCryptoSearch(searchText, filters, page = 1) {
  return performSearch('crypto', searchText, filters, page);
}

/**
 * Example: Search handler for Finance page
 * Finance requires search text since it doesn't support tag_slug
 */
async function handleFinanceSearch(searchText, filters, page = 1) {
  // Finance requires search text since it doesn't support tag_slug
  if (!searchText || !searchText.trim()) {
    throw new Error('Search text is required for finance category');
  }
  return performSearch('finance', searchText, filters, page);
}

/**
 * Example: Search handler for Sports page
 */
async function handleSportsSearch(searchText, filters, page = 1) {
  return performSearch('sports', searchText, filters, page);
}
```

## Category-Specific Integration Examples

### Politics Page Integration

```javascript
// On Politics page search button click
async function onPoliticsSearchClick() {
  const searchText = document.getElementById('search-input').value;
  const filters = {
    events_status: document.getElementById('status-filter').value || 'active',
    sort: document.getElementById('sort-filter').value || 'volume_24hr',
    ascending: document.getElementById('ascending-filter').checked || false,
    recurrence: document.getElementById('recurrence-filter').value || null,
    limit_per_type: 20,
    type: 'events'
  };
  
  try {
    const result = await handlePoliticsSearch(searchText, filters, 1);
    displayResults(result.data.events, result.data.pagination);
  } catch (error) {
    displayError(error.message);
  }
}
```

### Crypto Page Integration

```javascript
// On Crypto page search button click
async function onCryptoSearchClick() {
  const searchText = document.getElementById('search-input').value;
  const filters = {
    events_status: 'active',
    sort: 'volume_24hr',
    ascending: false,
    limit_per_type: 20,
    type: 'events'
  };
  
  try {
    const result = await handleCryptoSearch(searchText, filters, 1);
    displayResults(result.data.events, result.data.pagination);
  } catch (error) {
    displayError(error.message);
  }
}
```

### Finance Page Integration

```javascript
// On Finance page search button click
async function onFinanceSearchClick() {
  const searchText = document.getElementById('search-input').value;
  
  // Finance requires search text
  if (!searchText || !searchText.trim()) {
    displayError('Please enter a search term');
    return;
  }
  
  const filters = {
    events_status: 'active',
    sort: 'volume_24hr',
    ascending: false,
    limit_per_type: 20,
    type: 'events'
  };
  
  try {
    const result = await handleFinanceSearch(searchText, filters, 1);
    displayResults(result.data.events, result.data.pagination);
  } catch (error) {
    displayError(error.message);
  }
}
```

### Sports Page Integration

```javascript
// On Sports page search button click
async function onSportsSearchClick() {
  const searchText = document.getElementById('search-input').value;
  const filters = {
    events_status: 'active',
    sort: 'volume_24hr',
    ascending: false,
    limit_per_type: 20,
    type: 'events'
  };
  
  try {
    const result = await handleSportsSearch(searchText, filters, 1);
    displayResults(result.data.events, result.data.pagination);
  } catch (error) {
    displayError(error.message);
  }
}
```

## Filter Mixing Guidelines

### Valid Combinations

1. **Text Search Only**: Use for searching across all categories
   - `q=trump` - Search for "trump" across all categories
   - `q=bitcoin` - Search for "bitcoin" across all categories
   - `q=nfl` - Search for "nfl" across all categories
   - **Client-side filtering:** Filter results by checking event tags for category

2. **Category Only (No Text Search)**: Use for browsing all markets in a category
   - `tag_slug=politics` - All politics markets
   - `tag_slug=15M` - All crypto markets
   - `tag_slug=sports` - All sports markets

3. **Category + Recurrence**: Browse recurring markets in category
   - `tag_slug=politics&recurrence=weekly`
   - `tag_slug=sports&recurrence=daily`

4. **Text + Recurrence**: Search across all categories with frequency filter
   - `q=market&recurrence=monthly`

5. **Recurrence Only**: All recurring markets
   - `recurrence=daily`

### Invalid Combinations

- **Category + Text Search**: `tag_slug=politics&q=trump` - The `q` parameter will be ignored when `tag_slug` is present. Use text search only (`q=trump`) and filter client-side.
- Finance category with `tag_slug` (finance doesn't support tag_slug)
- Empty search with no `q`, `tag_slug`, or `recurrence`

### Recommended Approach for Category Pages

When on a category page (Politics, Crypto, Sports) and user enters search text:

1. **Use text search only**: `q={searchText}`
2. **Filter client-side**: Check if events have the appropriate category tag
3. **Example code:**
   ```javascript
   const results = await performSearch(category, searchText, filters, page);
   const filteredResults = results.data.events.filter(event => 
     event.tags?.some(tag => tag.slug === categoryTagSlug)
   );
   ```

## Pagination Reset Rules

Always reset to `page=1` when:
- Search text changes
- Any filter changes (status, sort, recurrence, etc.)
- Category changes (if applicable)

Maintain current page when:
- Only pagination controls are used (next/previous)
- URL is updated but filters remain the same

## Notes

1. **Text Search vs Category Filtering:** The backend cannot combine `q` (text search) with `tag_slug` (category filter) in a single request. When `tag_slug` is provided, the backend uses `/events/pagination` which ignores the `q` parameter. To search within a category, use text search (`q`) and filter results client-side by checking event tags.

2. **Category Scoping:** For category-only browsing (no text search), use `tag_slug` to scope results to that category (politics, crypto, sports).

3. **Finance Limitation:** Finance category does not support `tag_slug` - always use text search (`q`) parameter.

4. **Filter Mixing:** Most filters are additive and can be combined, except `q` and `tag_slug` cannot be used together.

5. **Pagination Reset:** Always reset to `page=1` when filters or search query changes.

6. **Empty Results:** Check for `message` field in response when `events` array is empty.

7. **Required Parameters:** At least one of `q`, `tag_slug`, or `recurrence` must be provided.

8. **Sort Behavior:** For resolved events (`events_status=resolved`), the default sort changes to `closed_time` if `volume_24hr` is specified.

9. **Type Parameter:** Use `type=events` for event-level results (default) or `type=markets` for market-level results.

10. **Client-Side Filtering:** When using text search on category pages, filter results client-side by checking if events have the appropriate category tag (e.g., `tags` array contains a tag with `slug: "politics"`).

