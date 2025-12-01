/**
 * Game Events Service
 * Fetches game events from Polymarket Gamma API, transforms them, and enriches with team details
 */

import { logger } from '../../config/logger';
import { polymarketClient } from './polymarket.client';
import { getSeriesIdForSport, isValidSport, getAvailableSports, getAllSportsGamesConfig } from './sports-games.config';
import { getLeagueForSport } from './teams.config';
import { teamsService, Team } from './teams.service';
import { seriesSummaryService } from './series-summary.service';
import { transformEvents } from './polymarket.transformer';
import { PolymarketEvent, TransformedEvent } from './polymarket.types';
import { ValidationError, PolymarketError, ErrorCode } from '../../utils/errors';

/**
 * Extended TransformedEvent with team details
 */
export interface GameEvent extends TransformedEvent {
  homeTeam?: Team;
  awayTeam?: Team;
  teamIdentifiers?: {
    home?: string;
    away?: string;
  };
}

/**
 * Game Events Response
 */
export interface GameEventsResponse {
  events: GameEvent[];
  sport: string;
  eventWeek: number;
  seriesId: string;
}

/**
 * All Sports Game Events Response
 */
export interface AllSportsGameEventsResponse {
  events: GameEvent[]; // All events flattened
  sports: {
    [sport: string]: {
      sport: string;
      seriesId: string;
      eventWeek: number;
      eventCount: number;
      events: GameEvent[];
    };
  };
  totalEvents: number;
  sportsProcessed: number;
  sportsSkipped: number;
}

/**
 * Game Events Service
 */
export class GameEventsService {
  /**
   * Fetch game events for a sport and event week
   * @param sport - Sport name (e.g., 'nfl', 'nba')
   * @param eventWeek - Event week number
   * @returns Game events with team details
   */
  async getGameEvents(sport: string, eventWeek: number): Promise<GameEventsResponse> {
    // Validate sport
    if (!sport || typeof sport !== 'string' || sport.trim() === '') {
      throw new ValidationError(
        ErrorCode.BAD_REQUEST,
        'Sport parameter is required and must be a non-empty string'
      );
    }

    const normalizedSport = sport.toLowerCase().trim();

    // Check if sport is valid
    if (!isValidSport(normalizedSport)) {
      const availableSports = getAvailableSports().join(', ');
      throw new ValidationError(
        ErrorCode.BAD_REQUEST,
        `Invalid sport: ${sport}. Available sports: ${availableSports}`
      );
    }

    // Validate event week
    if (typeof eventWeek !== 'number' || eventWeek < 1 || !Number.isInteger(eventWeek)) {
      throw new ValidationError(
        ErrorCode.BAD_REQUEST,
        'Event week must be a positive integer'
      );
    }

    // Get series_id for sport
    const seriesId = getSeriesIdForSport(normalizedSport);
    if (!seriesId) {
      throw new ValidationError(
        ErrorCode.BAD_REQUEST,
        `No series ID found for sport: ${sport}. The sport may not have a series configured yet.`
      );
    }

    logger.info({
      message: 'Fetching game events',
      sport: normalizedSport,
      seriesId,
      eventWeek,
    });

    try {
      // Fetch raw events from API
      const rawEvents = await this.fetchGameEventsFromAPI(seriesId, eventWeek);

      // Transform events using existing transformer
      const transformedEvents = transformEvents(rawEvents);

      // Enrich events with team details
      const enrichedEvents = await this.enrichEventsWithTeams(transformedEvents, normalizedSport);

      logger.info({
        message: 'Game events fetched and enriched successfully',
        sport: normalizedSport,
        seriesId,
        eventWeek,
        eventCount: enrichedEvents.length,
      });

      return {
        events: enrichedEvents,
        sport: normalizedSport,
        eventWeek,
        seriesId,
      };
    } catch (error) {
      logger.error({
        message: 'Error fetching game events',
        sport: normalizedSport,
        seriesId,
        eventWeek,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Re-throw validation errors
      if (error instanceof ValidationError) {
        throw error;
      }

      // Convert other errors to PolymarketError
      if (error instanceof PolymarketError) {
        throw error;
      }

      // Wrap unknown errors
      throw new PolymarketError(
        ErrorCode.POLYMARKET_FETCH_FAILED,
        `Failed to fetch game events for sport ${normalizedSport}, week ${eventWeek}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Fetch raw game events from Polymarket API
   * @param seriesId - Series ID
   * @param eventWeek - Event week number
   * @returns Array of raw Polymarket events
   */
  private async fetchGameEventsFromAPI(
    seriesId: string,
    eventWeek: number
  ): Promise<PolymarketEvent[]> {
    logger.info({
      message: 'Fetching game events from API',
      seriesId,
      eventWeek,
    });

    try {
      const response = await polymarketClient.get<PolymarketEvent[]>(
        '/events',
        {
          series_id: seriesId,
          limit: 500,
          event_week: eventWeek,
          order: 'startTime',
          ascending: false,
          include_chat: true,
        }
      );

      // Handle both array response and wrapped response
      let events: PolymarketEvent[] = [];
      if (Array.isArray(response)) {
        events = response;
      } else if (response && 'data' in response && Array.isArray((response as any).data)) {
        events = (response as any).data;
      }

      logger.info({
        message: 'Game events fetched from API',
        seriesId,
        eventWeek,
        eventCount: events.length,
      });

      return events;
    } catch (error) {
      logger.error({
        message: 'Error fetching game events from API',
        seriesId,
        eventWeek,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (error instanceof PolymarketError) {
        throw error;
      }

      throw new PolymarketError(
        ErrorCode.POLYMARKET_FETCH_FAILED,
        `Failed to fetch game events from API: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Enrich transformed events with team details
   * @param events - Transformed events
   * @param sport - Sport name
   * @returns Events enriched with team details
   */
  private async enrichEventsWithTeams(
    events: TransformedEvent[],
    sport: string
  ): Promise<GameEvent[]> {
    // Get league for sport
    const league = getLeagueForSport(sport);
    if (!league) {
      logger.warn({
        message: 'No league found for sport, skipping team enrichment',
        sport,
      });
      return events.map((e) => ({ ...e }));
    }

    // Fetch all teams for the league
    let teams: Team[] = [];
    try {
      teams = await teamsService.getTeamsByLeague(league);
      logger.info({
        message: 'Teams fetched for enrichment',
        sport,
        league,
        teamCount: teams.length,
      });
    } catch (error) {
      logger.warn({
        message: 'Failed to fetch teams, continuing without team enrichment',
        sport,
        league,
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue without teams - events will still be returned
    }

    // Enrich each event with team details
    const enrichedEvents: GameEvent[] = events.map((event) => {
      const gameEvent: GameEvent = { ...event };

      // Extract team identifiers from event
      const teamIdentifiers = this.extractTeamsFromEvent(event);

      if (teamIdentifiers.home || teamIdentifiers.away) {
        gameEvent.teamIdentifiers = teamIdentifiers;

        // Match teams to team data
        if (teamIdentifiers.home) {
          const homeTeam = this.matchTeamToData(teamIdentifiers.home, teams, league);
          if (homeTeam) {
            gameEvent.homeTeam = homeTeam;
          }
        }

        if (teamIdentifiers.away) {
          const awayTeam = this.matchTeamToData(teamIdentifiers.away, teams, league);
          if (awayTeam) {
            gameEvent.awayTeam = awayTeam;
          }
        }
      }

      return gameEvent;
    });

    return enrichedEvents;
  }

  /**
   * Extract team identifiers from an event
   * Tries multiple strategies: title parsing, slug parsing, outcomes
   * @param event - Transformed event
   * @returns Object with home and away team identifiers
   */
  private extractTeamsFromEvent(event: TransformedEvent): {
    home?: string;
    away?: string;
  } {
    const identifiers: { home?: string; away?: string } = {};

    // Strategy 1: Parse from event title (e.g., "Texans vs. Colts")
    const titleMatch = this.extractTeamsFromTitle(event.title);
    if (titleMatch.home && titleMatch.away) {
      return titleMatch;
    }

    // Strategy 2: Parse from event slug (e.g., "nfl-hou-ind-2025-11-30")
    const slugMatch = this.extractTeamsFromSlug(event.slug);
    if (slugMatch.home && slugMatch.away) {
      return slugMatch;
    }

    // Strategy 3: Extract from market outcomes (team names in outcomes)
    const outcomesMatch = this.extractTeamsFromOutcomes(event);
    if (outcomesMatch.home && outcomesMatch.away) {
      return outcomesMatch;
    }

    // Return whatever we found (may be partial)
    return {
      home: titleMatch.home || slugMatch.home || outcomesMatch.home,
      away: titleMatch.away || slugMatch.away || outcomesMatch.away,
    };
  }

  /**
   * Extract teams from event title
   * Handles formats like "Texans vs. Colts", "Lakers @ Warriors", etc.
   */
  private extractTeamsFromTitle(title: string): { home?: string; away?: string } {
    if (!title) return {};

    // Common separators: vs, @, at, -
    const separators = [' vs. ', ' vs ', ' @ ', ' at ', ' - '];
    
    for (const separator of separators) {
      const parts = title.split(separator);
      if (parts.length === 2) {
        const team1 = parts[0].trim();
        const team2 = parts[1].trim();
        
        // Remove common suffixes like " (Home)", " (Away)", etc.
        const cleanTeam1 = team1.replace(/\s*\(.*?\)\s*$/, '').trim();
        const cleanTeam2 = team2.replace(/\s*\(.*?\)\s*$/, '').trim();
        
        // Determine home/away based on separator
        // "@" and "at" typically indicate away team first
        if (separator.includes('@') || separator.includes('at')) {
          return { away: cleanTeam1, home: cleanTeam2 };
        } else {
          // "vs" typically has home team first, but not always
          // For now, assume first is home, second is away
          return { home: cleanTeam1, away: cleanTeam2 };
        }
      }
    }

    return {};
  }

  /**
   * Extract teams from event slug
   * Handles formats like "nfl-hou-ind-2025-11-30" where team abbreviations are in the slug
   */
  private extractTeamsFromSlug(slug: string): { home?: string; away?: string } {
    if (!slug) return {};

    // Pattern: sport-team1-team2-date or sport-team1-team2
    // Extract potential team abbreviations (usually 2-5 uppercase letters)
    const parts = slug.split('-');
    
    // Look for parts that look like team abbreviations (2-5 uppercase letters)
    const teamAbbrevs: string[] = [];
    for (const part of parts) {
      // Skip date-like parts (numbers) and sport name
      if (/^\d+$/.test(part)) continue;
      if (part.length >= 2 && part.length <= 5 && /^[A-Z]+$/.test(part)) {
        teamAbbrevs.push(part);
      }
    }

    if (teamAbbrevs.length >= 2) {
      // Typically first team is away, second is home in slugs
      return {
        away: teamAbbrevs[0],
        home: teamAbbrevs[1],
      };
    }

    return {};
  }

  /**
   * Extract teams from market outcomes
   * Looks for team names in the outcomes of markets
   */
  private extractTeamsFromOutcomes(event: TransformedEvent): {
    home?: string;
    away?: string;
  } {
    if (!event.markets || event.markets.length === 0) {
      return {};
    }

    // Collect all unique outcome labels
    const outcomeLabels = new Set<string>();
    for (const market of event.markets) {
      if (market.structuredOutcomes) {
        for (const outcome of market.structuredOutcomes) {
          if (outcome.label) {
            outcomeLabels.add(outcome.label.trim());
          }
        }
      }
      // Also check deprecated outcomes field
      if (market.outcomes && Array.isArray(market.outcomes)) {
        for (const outcome of market.outcomes) {
          if (typeof outcome === 'string') {
            outcomeLabels.add(outcome.trim());
          }
        }
      }
    }

    // Filter out common non-team outcomes
    const nonTeamOutcomes = new Set([
      'yes', 'no', 'over', 'under', 'win', 'lose', 'tie', 'draw',
      'home', 'away', 'total', 'spread', 'moneyline',
    ]);

    const teamCandidates = Array.from(outcomeLabels).filter(
      (label) => !nonTeamOutcomes.has(label.toLowerCase())
    );

    // If we have exactly 2 candidates, assume they're teams
    if (teamCandidates.length === 2) {
      // Try to determine home/away from context or just assign
      return {
        home: teamCandidates[0],
        away: teamCandidates[1],
      };
    }

    // If we have more candidates, try to find the most likely team names
    // (longer names, proper case, etc.)
    if (teamCandidates.length > 2) {
      // Sort by length and case (prefer longer, proper case)
      const sorted = teamCandidates.sort((a, b) => {
        const aScore = a.length + (a[0] === a[0].toUpperCase() ? 10 : 0);
        const bScore = b.length + (b[0] === b[0].toUpperCase() ? 10 : 0);
        return bScore - aScore;
      });
      
      return {
        home: sorted[0],
        away: sorted[1],
      };
    }

    return {};
  }

  /**
   * Match a team identifier to team data
   * @param identifier - Team name or abbreviation
   * @param teams - Array of teams to search
   * @param league - League name for logging
   * @returns Matched team or null
   */
  private matchTeamToData(
    identifier: string,
    teams: Team[],
    league: string
  ): Team | null {
    if (!identifier || teams.length === 0) {
      return null;
    }

    const normalizedIdentifier = identifier.trim().toLowerCase();

    // Strategy 1: Exact match on abbreviation (case-insensitive)
    const abbrevMatch = teams.find(
      (team) =>
        team.abbreviation &&
        team.abbreviation.toLowerCase() === normalizedIdentifier
    );
    if (abbrevMatch) {
      return abbrevMatch;
    }

    // Strategy 2: Exact match on name (case-insensitive)
    const nameMatch = teams.find(
      (team) => team.name.toLowerCase() === normalizedIdentifier
    );
    if (nameMatch) {
      return nameMatch;
    }

    // Strategy 3: Partial match on name (contains)
    const partialMatch = teams.find(
      (team) =>
        team.name.toLowerCase().includes(normalizedIdentifier) ||
        normalizedIdentifier.includes(team.name.toLowerCase())
    );
    if (partialMatch) {
      return partialMatch;
    }

    // Strategy 4: Match on alias
    const aliasMatch = teams.find(
      (team) =>
        team.alias &&
        team.alias.toLowerCase() === normalizedIdentifier
    );
    if (aliasMatch) {
      return aliasMatch;
    }

    // Strategy 5: Fuzzy match - check if identifier is part of team name or vice versa
    // (e.g., "Hou" matches "Houston Texans")
    for (const team of teams) {
      const teamNameLower = team.name.toLowerCase();
      const teamAbbrevLower = team.abbreviation?.toLowerCase() || '';
      
      // Check if identifier is a substring of team name or abbreviation
      if (
        teamNameLower.includes(normalizedIdentifier) ||
        normalizedIdentifier.includes(teamNameLower) ||
        (teamAbbrevLower && (
          teamAbbrevLower.includes(normalizedIdentifier) ||
          normalizedIdentifier.includes(teamAbbrevLower)
        ))
      ) {
        return team;
      }
    }

    logger.debug({
      message: 'Could not match team identifier',
      identifier,
      league,
      availableTeams: teams.map((t) => ({
        name: t.name,
        abbreviation: t.abbreviation,
        alias: t.alias,
      })),
    });

    return null;
  }

  /**
   * Fetch game events for all configured sports
   * Gets earliest_open_week from each sport's series summary and fetches events
   * @returns All game events grouped by sport
   */
  async getAllSportsGameEvents(): Promise<AllSportsGameEventsResponse> {
    logger.info({
      message: 'Fetching game events for all sports',
    });

    const allSportsConfig = getAllSportsGamesConfig();
    const allSports = getAvailableSports();
    const sportsData: AllSportsGameEventsResponse['sports'] = {};
    const allEvents: GameEvent[] = [];
    let sportsProcessed = 0;
    let sportsSkipped = 0;

    // Process each sport
    for (const sport of allSports) {
      const config = allSportsConfig[sport];
      
      // Skip sports without series IDs
      if (!config || !config.seriesId || config.seriesId.trim() === '') {
        logger.warn({
          message: 'Skipping sport - no series ID configured',
          sport,
        });
        sportsSkipped++;
        continue;
      }

      try {
        logger.info({
          message: 'Processing sport',
          sport,
          seriesId: config.seriesId,
        });

        // Get series summary to find earliest_open_week
        let seriesSummary;
        try {
          seriesSummary = await seriesSummaryService.getSeriesSummaryBySport(sport);
        } catch (error) {
          logger.error({
            message: 'Failed to fetch series summary for sport',
            sport,
            error: error instanceof Error ? error.message : String(error),
          });
          sportsSkipped++;
          continue;
        }

        // Determine event week to use
        let eventWeek: number;
        if (seriesSummary.earliest_open_week !== undefined && seriesSummary.earliest_open_week !== null) {
          eventWeek = seriesSummary.earliest_open_week;
        } else if (seriesSummary.eventWeeks && seriesSummary.eventWeeks.length > 0) {
          // Fallback to first available week if earliest_open_week is not set
          eventWeek = seriesSummary.eventWeeks[0];
          logger.warn({
            message: 'earliest_open_week not found, using first available week',
            sport,
            eventWeek,
          });
        } else {
          logger.warn({
            message: 'No event weeks available for sport',
            sport,
            seriesId: config.seriesId,
          });
          sportsSkipped++;
          continue;
        }

        // Fetch game events for this sport and week
        let gameEventsResponse: GameEventsResponse;
        try {
          gameEventsResponse = await this.getGameEvents(sport, eventWeek);
        } catch (error) {
          logger.error({
            message: 'Failed to fetch game events for sport',
            sport,
            eventWeek,
            error: error instanceof Error ? error.message : String(error),
          });
          sportsSkipped++;
          continue;
        }

        // Store sport data
        sportsData[sport] = {
          sport,
          seriesId: gameEventsResponse.seriesId,
          eventWeek: gameEventsResponse.eventWeek,
          eventCount: gameEventsResponse.events.length,
          events: gameEventsResponse.events,
        };

        // Add events to flat array
        allEvents.push(...gameEventsResponse.events);

        sportsProcessed++;

        logger.info({
          message: 'Successfully processed sport',
          sport,
          seriesId: gameEventsResponse.seriesId,
          eventWeek: gameEventsResponse.eventWeek,
          eventCount: gameEventsResponse.events.length,
        });
      } catch (error) {
        logger.error({
          message: 'Unexpected error processing sport',
          sport,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        sportsSkipped++;
      }
    }

    logger.info({
      message: 'All sports game events fetch completed',
      totalEvents: allEvents.length,
      sportsProcessed,
      sportsSkipped,
      sportsWithEvents: Object.keys(sportsData).length,
    });

    return {
      events: allEvents,
      sports: sportsData,
      totalEvents: allEvents.length,
      sportsProcessed,
      sportsSkipped,
    };
  }
}

// Export singleton instance
export const gameEventsService = new GameEventsService();

