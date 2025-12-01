/**
 * Sports Props Configuration
 * Maps sport category names to their Polymarket tag_ids for props markets
 */

export interface SportConfig {
  tagId: string;
  label: string;
}

export interface SportsPropsConfig {
  [sport: string]: SportConfig;
}

/**
 * Sports props configuration
 * Maps sport names to their tag_ids for fetching props markets
 * 
 * Note: Tag IDs can be found by inspecting Polymarket API responses or network requests
 * To add a new sport, add an entry here with the correct tag_id
 */
const SPORTS_PROPS_CONFIG: SportsPropsConfig = {
  nfl: {
    tagId: '450',
    label: 'NFL',
  },
  nba: {
    tagId: '745', // TODO: Verify actual tag_id for NBA props
    label: 'NBA',
  },
  mlb: {
    tagId: '10038', // TODO: Verify actual tag_id for MLB props
    label: 'MLB',
  },
  nhl: {
    tagId: '899', // TODO: Verify actual tag_id for NHL props
    label: 'NHL',
  },
  ufc: {
    tagId: '279', // TODO: Verify actual tag_id for UFC props
    label: 'UFC',
  },
  epl: {
    tagId: '306', // TODO: Verify actual tag_id for EPL props
    label: 'English Premier League',
  },
  'lal': {
    tagId: '780', // TODO: Verify actual tag_id for La Liga props
    label: 'La Liga',
  },
};

/**
 * Get tag_id for a sport category
 * @param sport - Sport name (e.g., 'nfl', 'nba')
 * @returns tag_id string if sport exists, null otherwise
 */
export function getTagIdForSport(sport: string): string | null {
  const normalizedSport = sport.toLowerCase().trim();
  const config = SPORTS_PROPS_CONFIG[normalizedSport];
  return config ? config.tagId : null;
}

/**
 * Get full config for a sport category
 * @param sport - Sport name (e.g., 'nfl', 'nba')
 * @returns SportConfig if sport exists, null otherwise
 */
export function getSportConfig(sport: string): SportConfig | null {
  const normalizedSport = sport.toLowerCase().trim();
  return SPORTS_PROPS_CONFIG[normalizedSport] || null;
}

/**
 * Check if a sport is valid
 * @param sport - Sport name to validate
 * @returns true if sport exists in config
 */
export function isValidSport(sport: string): boolean {
  const normalizedSport = sport.toLowerCase().trim();
  return normalizedSport in SPORTS_PROPS_CONFIG;
}

/**
 * Get all available sports
 * @returns Array of sport names
 */
export function getAvailableSports(): string[] {
  return Object.keys(SPORTS_PROPS_CONFIG);
}

/**
 * Get all sport configurations
 * @returns SportsPropsConfig object
 */
export function getAllSportsConfig(): SportsPropsConfig {
  return SPORTS_PROPS_CONFIG;
}

