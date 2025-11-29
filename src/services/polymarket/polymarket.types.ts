/**
 * TypeScript interfaces for Polymarket Gamma API responses and transformed data
 */

/**
 * Raw API response types from Polymarket Gamma API
 */
export interface PolymarketMarket {
  id: string;
  question: string;
  conditionId?: string;
  slug?: string;
  resolutionSource?: string;
  endDate?: string;
  startDate?: string;
  image?: string;
  icon?: string;
  description?: string;
  outcomes?: string[];
  outcomePrices?: string[];
  volume?: string | number;
  volumeNum?: number;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  marketMakerAddress?: string;
  createdAt?: string;
  updatedAt?: string;
  closedTime?: string;
  new?: boolean;
  featured?: boolean;
  submitted_by?: string;
  resolvedBy?: string;
  restricted?: boolean;
  groupItemTitle?: string;
  groupItemThreshold?: string;
  questionID?: string;
  umaEndDate?: string;
  enableOrderBook?: boolean;
  orderPriceMinTickSize?: number;
  orderMinSize?: number;
  umaResolutionStatus?: string;
  endDateIso?: string;
  startDateIso?: string;
  hasReviewedDates?: boolean;
  volume1wk?: number;
  volume1mo?: number;
  volume1yr?: number;
  volume24hr?: number;
  clobTokenIds?: string[];
  umaBond?: string;
  umaReward?: string;
  volume1wkClob?: number;
  volume1moClob?: number;
  volume1yrClob?: number;
  volumeClob?: number;
  acceptingOrders?: boolean;
  negRisk?: boolean;
  negRiskRequestID?: string;
  ready?: boolean;
  funded?: boolean;
  acceptingOrdersTimestamp?: string;
  cyom?: boolean;
  pagerDutyNotificationEnabled?: boolean;
  approved?: boolean;
  clobRewards?: any[];
  rewardsMinSize?: number;
  rewardsMaxSpread?: number;
  spread?: number;
  automaticallyResolved?: boolean;
  oneDayPriceChange?: number;
  oneWeekPriceChange?: number;
  oneMonthPriceChange?: number;
  lastTradePrice?: number;
  bestBid?: number;
  bestAsk?: number;
  automaticallyActive?: boolean;
  clearBookOnStart?: boolean;
  seriesColor?: string;
  showGmpSeries?: boolean;
  showGmpOutcome?: boolean;
  manualActivation?: boolean;
  negRiskOther?: boolean;
  umaResolutionStatuses?: string[];
  pendingDeployment?: boolean;
  deploying?: boolean;
  deployingTimestamp?: string;
  rfqEnabled?: boolean;
  holdingRewardsEnabled?: boolean;
  feesEnabled?: boolean;
  competitive?: number;
  liquidity?: string | number;
  liquidityNum?: number;
  openInterest?: number;
  volume24hrAmm?: number;
  volume1wkAmm?: number;
  volume1moAmm?: number;
  volume1yrAmm?: number;
  volumeAmm?: number;
  liquidityAmm?: number;
  liquidityClob?: number;
  customLiveness?: number;
  negRiskMarketID?: string;
}

export interface PolymarketTag {
  id: string;
  label: string;
  slug: string;
  forceShow?: boolean;
  createdAt?: string;
  publishedAt?: string;
  createdBy?: number;
  updatedBy?: number;
  updatedAt?: string;
  isCarousel?: boolean;
}

export interface PolymarketEvent {
  id: string;
  ticker?: string;
  slug: string;
  title: string;
  description?: string;
  resolutionSource?: string;
  startDate?: string;
  creationDate?: string;
  endDate?: string;
  image?: string;
  icon?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  new?: boolean;
  featured?: boolean;
  restricted?: boolean;
  liquidity?: string | number;
  volume?: string | number;
  openInterest?: number;
  createdAt?: string;
  updatedAt?: string;
  competitive?: number;
  volume24hr?: number;
  volume1wk?: number;
  volume1mo?: number;
  volume1yr?: number;
  enableOrderBook?: boolean;
  liquidityClob?: number;
  negRisk?: boolean;
  commentCount?: number;
  markets?: PolymarketMarket[];
  tags?: PolymarketTag[];
  cyom?: boolean;
  showAllOutcomes?: boolean;
  showMarketImages?: boolean;
  enableNegRisk?: boolean;
  automaticallyActive?: boolean;
  startTime?: string;
  gmpChartMode?: string;
  negRiskAugmented?: boolean;
  countryName?: string;
  electionType?: string;
  pendingDeployment?: boolean;
  deploying?: boolean;
  deployingTimestamp?: string;
}

export interface PolymarketPagination {
  hasMore: boolean;
  totalResults: number;
}

export interface PolymarketApiResponse {
  data: PolymarketEvent[];
  pagination?: PolymarketPagination;
}

/**
 * Transformed data types for frontend
 */
export interface TransformedOutcome {
  label: string;
  shortLabel: string;
  price: string; // Price in cents, e.g., "18.5"
  probability: number; // 0-100
  volume: number; // Individual outcome volume
  icon?: string; // Outcome image
  clobTokenId?: string; // For trading
  conditionId?: string;
  isWinner?: boolean; // True if this outcome won (for resolved markets)
}

export interface TransformedMarket {
  id: string;
  question: string;
  slug?: string;
  conditionId?: string;
  volume: number;
  volume24Hr?: number;
  volume1Wk?: number;
  volume1Mo?: number;
  volume1Yr?: number;
  active: boolean;
  closed: boolean;
  archived: boolean;
  image?: string;
  icon?: string;
  description?: string;
  outcomes?: string[]; // Deprecated: use structuredOutcomes instead
  outcomePrices?: string[]; // Deprecated: use structuredOutcomes instead
  structuredOutcomes?: TransformedOutcome[]; // Structured outcomes array
  isGroupItem?: boolean; // Indicates if this is part of a group
  groupItemTitle?: string;
  groupItemThreshold?: string;
  clobTokenIds?: string[]; // Token IDs for trading
  endDate?: string;
  startDate?: string;
  lastTradePrice?: number;
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  competitive?: number;
  liquidity?: number;
  createdAt?: string;
  updatedAt?: string;
  // Resolution fields (for resolved markets)
  closedTime?: string;
  resolvedBy?: string;
  resolutionSource?: string;
  umaResolutionStatus?: string;
  automaticallyResolved?: boolean;
}

export interface TransformedEvent {
  id: string;
  title: string;
  slug: string;
  description?: string;
  image?: string;
  icon?: string;
  totalVolume: number;
  volume24Hr: number;
  volume1Wk?: number;
  volume1Mo?: number;
  volume1Yr?: number;
  liquidity?: number;
  openInterest?: number;
  competitive?: number;
  active: boolean;
  closed: boolean;
  archived: boolean;
  restricted?: boolean;
  featured?: boolean;
  commentCount?: number;
  markets: TransformedMarket[];
  tags?: TransformedTag[];
  startDate?: string;
  endDate?: string;
  createdAt?: string;
  updatedAt?: string;
  hasGroupItems?: boolean; // Indicates if event has group items
  groupedOutcomes?: TransformedOutcome[]; // Aggregated outcomes from group items or best market
  // Resolution fields (for resolved events)
  closedTime?: string;
  isResolved?: boolean; // Computed: true if event or all markets are resolved
}

export interface TransformedTag {
  id: string;
  label: string;
  slug: string;
}

export interface TransformedPagination {
  hasMore: boolean;
  totalResults: number;
  offset: number;
  limit: number;
}

export interface TransformedEventsResponse {
  events: TransformedEvent[];
  pagination: TransformedPagination;
}

/**
 * API request parameters
 */
export type Category = 'trending' | 'politics' | 'crypto' | 'finance' | 'sports';

export type OrderBy = 'volume24hr' | 'volume' | 'featuredOrder';

export interface EventsQueryParams {
  category?: Category;
  limit?: number;
  offset?: number;
  order?: OrderBy;
  tag_slug?: string;
  tag_id?: string;
  active?: boolean;
  archived?: boolean;
  closed?: boolean;
  ascending?: boolean;
  end_date_min?: string;
  // Additional filters from search endpoint
  events_status?: EventsStatus; // "active" or "resolved"
  sort?: SearchSort; // All sort options from search
  recurrence?: Recurrence; // "daily", "weekly", or "monthly"
}

/**
 * Endpoint configuration
 */
export interface EndpointConfig {
  path: string;
  params: Record<string, string | number | boolean | undefined>;
  pollingPath?: string;
  pollingParams?: Record<string, string | number | boolean | undefined>;
  pollingInterval?: number;
}

/**
 * Search query parameters
 */
export type SearchSort = 'volume_24hr' | 'end_date' | 'start_date' | 'volume' | 'liquidity' | 'closed_time' | 'competitive';
export type SearchType = 'events' | 'markets';
export type EventsStatus = 'active' | 'resolved';
export type Recurrence = 'daily' | 'weekly' | 'monthly';

export interface SearchQueryParams {
  q?: string; // Search query string (optional if tag_slug or recurrence is provided)
  page?: number; // Pagination page number (default: 1)
  limit_per_type?: number; // Results per type (default: 20)
  type?: SearchType; // Search type - "events" (default) or "markets"
  events_status?: EventsStatus; // "active" (default) or "resolved"
  sort?: SearchSort; // Sort option (default: "volume_24hr")
  ascending?: boolean; // Sort direction (default: false)
  presets?: string[]; // Preset filters (EventsTitle, Events)
  recurrence?: Recurrence; // Recurrence filter: "daily", "weekly", or "monthly"
  tag_slug?: string; // Category filter (e.g., "politics", "crypto", "sports")
}

/**
 * Search API response from Polymarket
 */
export interface SearchApiResponse {
  events: PolymarketEvent[];
  pagination: {
    hasMore: boolean;
    totalResults: number;
  };
}

/**
 * Market Clarification types
 */
export interface MarketClarification {
  id?: string;
  marketId?: string;
  text?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any; // Allow for additional fields from API
}

/**
 * Raw API response for market clarifications (array of clarifications)
 */
export type MarketClarificationsResponse = MarketClarification[];

/**
 * Result for a single market's clarifications request
 */
export interface MarketClarificationResult {
  marketId: string;
  clarifications: MarketClarification[];
  status: 'success' | 'error';
  error?: string;
}

/**
 * Response format for multiple market clarifications
 */
export interface MarketClarificationsResults {
  results: MarketClarificationResult[];
}

/**
 * Price History types for CLOB API
 */
export type PriceHistoryInterval = '1h' | '6h' | '1d' | '1w' | '1m';

export interface PriceHistoryQueryParams {
  clobTokenId: string;
  startDate?: string; // ISO date string
  interval?: PriceHistoryInterval;
  fidelity?: number;
}

export interface PriceHistoryPoint {
  t: number; // Unix timestamp in seconds
  p: number; // Price/probability (0.0-1.0)
}

export interface PriceHistoryResponse {
  history: PriceHistoryPoint[];
}

