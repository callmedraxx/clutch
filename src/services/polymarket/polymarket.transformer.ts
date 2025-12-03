/**
 * Data transformation and event grouping logic
 * Groups markets by events and standardizes field names
 */

import { logger } from '../../config/logger';
import { TransformationError, ErrorCode } from '../../utils/errors';
import {
  PolymarketEvent,
  PolymarketMarket,
  TransformedEvent,
  TransformedMarket,
  TransformedOutcome,
  TransformedTag,
} from './polymarket.types';

/**
 * Parse outcome prices from string array or JSON string
 * Polymarket returns prices as decimals (0.01 = 1%, 0.84 = 84%)
 * We need to multiply by 100 to convert to percentage
 */
function parseOutcomePrices(prices: string[] | string | undefined): number[] {
  if (!prices) {
    return [];
  }

  try {
    // Handle case where prices is a single JSON string
    if (typeof prices === 'string') {
      try {
        const parsed = JSON.parse(prices);
        if (Array.isArray(parsed)) {
          return parsed.map((p) => {
            const num = typeof p === 'string' ? parseFloat(p) : p;
            if (isNaN(num)) return 0;
            // Multiply by 100 to convert from decimal (0.01) to percentage (1)
            const percentage = num * 100;
            return Math.max(0, Math.min(100, percentage));
          });
        }
      } catch {
        // Not JSON, try parsing as single number
        const num = parseFloat(prices);
        if (!isNaN(num)) {
          const percentage = num * 100;
          return [Math.max(0, Math.min(100, percentage))];
        }
      }
      return [];
    }

    // Handle array case
    if (Array.isArray(prices)) {
      // Handle JSON string arrays (single element that's a JSON string)
      if (prices.length === 1 && typeof prices[0] === 'string') {
        try {
          const parsed = JSON.parse(prices[0]);
          if (Array.isArray(parsed)) {
            return parsed.map((p) => {
              const num = typeof p === 'string' ? parseFloat(p) : p;
              if (isNaN(num)) return 0;
              // Multiply by 100 to convert from decimal (0.01) to percentage (1)
              const percentage = num * 100;
              return Math.max(0, Math.min(100, percentage));
            });
          }
        } catch {
          // Not JSON, continue with normal parsing
        }
      }

      return prices.map((p) => {
        const num = typeof p === 'string' ? parseFloat(p) : p;
        if (isNaN(num)) return 0;
        // Multiply by 100 to convert from decimal (0.01) to percentage (1)
        const percentage = num * 100;
        return Math.max(0, Math.min(100, percentage));
      });
    }

    return [];
  } catch (error) {
    logger.warn({
      message: 'Error parsing outcome prices',
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Parse outcomes from string array
 */
function parseOutcomes(outcomes: string[] | undefined): string[] {
  if (!outcomes || !Array.isArray(outcomes)) {
    return [];
  }

  try {
    // Handle JSON string arrays
    if (outcomes.length === 1 && typeof outcomes[0] === 'string') {
      try {
        const parsed = JSON.parse(outcomes[0]);
        if (Array.isArray(parsed)) {
          return parsed.map((o) => String(o));
        }
      } catch {
        // Not JSON, continue with normal parsing
      }
    }

    return outcomes.map((o) => String(o));
  } catch (error) {
    logger.warn({
      message: 'Error parsing outcomes',
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Normalize probabilities using Largest Remainder Method (Hare-Niemeyer)
 * Ensures probabilities sum to exactly 100% while preserving relative proportions
 * This matches Polymarket's frontend behavior (e.g., 50.5% and 49.5% → 51% and 49%)
 */
function normalizeProbabilities(probabilities: number[]): number[] {
  if (probabilities.length === 0) {
    return [];
  }

  // Step 1: Floor all values
  const floored = probabilities.map(p => Math.floor(p));
  const sum = floored.reduce((a, b) => a + b, 0);
  const remainder = 100 - sum;

  // If already sums to 100, return floored values
  if (remainder === 0) {
    return floored;
  }

  // Step 2: Calculate remainders for each probability
  const remainders = probabilities.map((p, i) => ({
    index: i,
    remainder: p - floored[i],
  }));

  // Step 3: Sort by remainder (descending) to prioritize values with largest fractional parts
  remainders.sort((a, b) => {
    // If remainders are equal, prefer earlier index (deterministic tie-breaking)
    if (Math.abs(a.remainder - b.remainder) < 0.0001) {
      return a.index - b.index;
    }
    return b.remainder - a.remainder;
  });

  // Step 4: Distribute the missing percentage to values with largest remainders
  const result = [...floored];
  for (let i = 0; i < remainder; i++) {
    result[remainders[i].index]++;
  }

  return result;
}

/**
 * Extract clobTokenIds from various formats
 */
function extractClobTokenIds(clobTokenIds: string[] | string | undefined): string[] {
  if (!clobTokenIds) {
    return [];
  }

  if (Array.isArray(clobTokenIds)) {
    return clobTokenIds.map((id) => String(id)).filter((id) => id.length > 0);
  }

  if (typeof clobTokenIds === 'string') {
    try {
      // Try to parse as JSON
      const sanitized = clobTokenIds.trim().replace(/'/g, '"');
      const parsed = JSON.parse(sanitized);
      if (Array.isArray(parsed)) {
        return parsed.map((id) => String(id)).filter((id) => id.length > 0);
      }
    } catch {
      // If JSON parsing fails, try regex extraction
      const match = clobTokenIds.match(/\d{70,}/g);
      if (match) {
        return match;
      }
    }
  }

  return [];
}

/**
 * Create structured outcomes from a market
 */
function createTransformedOutcomes(market: PolymarketMarket): TransformedOutcome[] {
  const outcomeLabels = parseOutcomes(market.outcomes);
  const prices = parseOutcomePrices(market.outcomePrices);
  const tokenIds = extractClobTokenIds(market.clobTokenIds);

  if (outcomeLabels.length === 0) {
    // Log warning if we have outcomePrices but no outcomes, or vice versa
    if (market.outcomePrices && (Array.isArray(market.outcomePrices) || typeof market.outcomePrices === 'string')) {
      logger.debug({
        message: 'Could not parse outcomes for structuredOutcomes',
        marketId: market.id,
        hasOutcomes: !!market.outcomes,
        outcomesType: typeof market.outcomes,
        hasOutcomePrices: !!market.outcomePrices,
        outcomePricesType: typeof market.outcomePrices,
      });
    }
    return [];
  }

  // Ensure we have prices for each outcome label
  if (prices.length === 0 && outcomeLabels.length > 0) {
    logger.debug({
      message: 'Could not parse outcomePrices for structuredOutcomes',
      marketId: market.id,
      outcomeCount: outcomeLabels.length,
      hasOutcomePrices: !!market.outcomePrices,
      outcomePricesType: typeof market.outcomePrices,
    });
    // If no prices, create outcomes with default prices (equal distribution)
    const defaultPrice = 100 / outcomeLabels.length;
    return outcomeLabels.map((label, index) => {
      const marketVolume = typeof market.volume === 'string'
        ? parseFloat(market.volume)
        : (market.volumeNum || market.volume || 0);
      
      return {
        label: label || 'Unknown',
        shortLabel: (label || 'UNK').slice(0, 3).toUpperCase(),
        price: defaultPrice.toFixed(2),
        probability: Math.round(defaultPrice),
        volume: Math.round(marketVolume / outcomeLabels.length),
        icon: market.icon,
        clobTokenId: tokenIds[index],
        conditionId: market.conditionId,
        active: market.active ?? false,
        closed: market.closed ?? false,
      };
    });
  }

  const marketVolume = typeof market.volume === 'string'
    ? parseFloat(market.volume)
    : (market.volumeNum || market.volume || 0);

  // Calculate individual outcome volumes (distribute market volume proportionally)
  const totalPrice = prices.reduce((sum, p) => sum + p, 0);
  const volumePerOutcome = totalPrice > 0
    ? outcomeLabels.map((_, index) => {
        const priceRatio = prices[index] || 0;
        return (priceRatio / totalPrice) * marketVolume;
      })
    : outcomeLabels.map(() => marketVolume / outcomeLabels.length);

  // Detect if market is resolved (closed and has a winner)
  const isResolved = market.closed === true;
  // Find winner: In a resolved binary market, the winner is the outcome with the highest price
  // Prices are already in percentage form (0-100) after parseOutcomePrices
  // For resolved markets, find the index with the maximum price (either Yes or No can win)
  let winnerIndex = -1;
  if (isResolved && prices.length > 0) {
    let maxPrice = -1;
    prices.forEach((p, index) => {
      const priceNum = typeof p === 'string' ? parseFloat(p) : p;
      if (!isNaN(priceNum) && priceNum > maxPrice) {
        maxPrice = priceNum;
        winnerIndex = index;
      }
    });
    // Only consider it a winner if price is >= 99 (very high confidence)
    if (maxPrice < 99) {
      winnerIndex = -1; // No clear winner if max price is too low
    }
  }

  // Calculate raw probabilities (clamped to 0-100)
  const rawProbabilities = prices.map((rawPrice) => 
    Math.max(0, Math.min(100, rawPrice))
  );

  // Normalize probabilities to ensure they sum to exactly 100%
  const normalizedProbabilities = normalizeProbabilities(rawProbabilities);

    return outcomeLabels.map((label, index) => {
    const rawPrice = prices[index] || 0;
    const probability = normalizedProbabilities[index] || 0;
    const priceInCents = rawPrice.toFixed(2);
    const isWinner = isResolved && index === winnerIndex;

    return {
      label: label || 'Unknown',
      shortLabel: (label || 'UNK').slice(0, 3).toUpperCase(),
      price: priceInCents,
      probability: probability,
      volume: Math.round(volumePerOutcome[index] || 0),
      icon: market.icon,
      clobTokenId: tokenIds[index],
      conditionId: market.conditionId,
      isWinner: isWinner || undefined, // Only set if true
      active: market.active ?? false,
      closed: market.closed ?? false,
    };
  });
}

/**
 * Transform a single market
 */
function transformMarket(market: PolymarketMarket): TransformedMarket {
  try {
    const volume = typeof market.volume === 'string' 
      ? parseFloat(market.volume) 
      : (market.volumeNum || market.volume || 0);

    const liquidity = typeof market.liquidity === 'string'
      ? parseFloat(market.liquidity)
      : (market.liquidityNum || market.liquidityClob || 0);

    // Parse raw outcomes and prices for backward compatibility
    let rawOutcomes: string[] | undefined;
    let rawOutcomePrices: string[] | undefined;
    try {
      rawOutcomes = market.outcomes ? JSON.parse(String(market.outcomes)) : undefined;
      rawOutcomePrices = market.outcomePrices ? JSON.parse(String(market.outcomePrices)) : undefined;
    } catch {
      // If parsing fails, use as-is
      rawOutcomes = market.outcomes;
      rawOutcomePrices = market.outcomePrices;
    }

    // Create structured outcomes from raw market
    let structuredOutcomes = createTransformedOutcomes(market);

    // If structuredOutcomes is empty but we have parsed outcomes/prices, try creating from parsed values
    if (structuredOutcomes.length === 0 && rawOutcomes && rawOutcomes.length > 0 && rawOutcomePrices && rawOutcomePrices.length > 0) {
      // Create a temporary market object with parsed outcomes/prices for structuredOutcomes creation
      const marketWithParsedData: PolymarketMarket = {
        ...market,
        outcomes: rawOutcomes,
        outcomePrices: rawOutcomePrices,
      };
      structuredOutcomes = createTransformedOutcomes(marketWithParsedData);
      
      // Log if we successfully created structuredOutcomes on second attempt
      if (structuredOutcomes.length > 0) {
        logger.debug({
          message: 'Created structuredOutcomes from parsed outcomes/prices',
          marketId: market.id,
          outcomeCount: structuredOutcomes.length,
        });
      } else {
        // Log warning if we still couldn't create structuredOutcomes despite having outcomes/prices
        logger.warn({
          message: 'Could not create structuredOutcomes even after parsing outcomes/prices',
          marketId: market.id,
          hasOutcomes: !!rawOutcomes && rawOutcomes.length > 0,
          hasOutcomePrices: !!rawOutcomePrices && rawOutcomePrices.length > 0,
          outcomeCount: rawOutcomes?.length || 0,
          priceCount: rawOutcomePrices?.length || 0,
        });
      }
    }

    // Detect if this is a group item
    const isGroupItem = !!market.groupItemTitle;

    // Extract and store clobTokenIds
    const clobTokenIds = extractClobTokenIds(market.clobTokenIds);

    return {
      id: market.id,
      question: market.question || '',
      slug: market.slug,
      conditionId: market.conditionId,
      volume: volume,
      volume24Hr: market.volume24hr,
      volume1Wk: market.volume1wk,
      volume1Mo: market.volume1mo,
      volume1Yr: market.volume1yr,
      active: market.active ?? false,
      closed: market.closed ?? false,
      archived: market.archived ?? false,
      image: market.image,
      icon: market.icon,
      description: market.description,
      outcomes: rawOutcomes, // Deprecated: kept for backward compatibility
      outcomePrices: rawOutcomePrices, // Deprecated: kept for backward compatibility
      structuredOutcomes: structuredOutcomes,
      isGroupItem: isGroupItem,
      groupItemTitle: market.groupItemTitle,
      groupItemThreshold: market.groupItemThreshold,
      clobTokenIds: clobTokenIds,
      endDate: market.endDate || market.endDateIso,
      startDate: market.startDate || market.startDateIso,
      lastTradePrice: market.lastTradePrice,
      bestBid: market.bestBid,
      bestAsk: market.bestAsk,
      spread: market.spread,
      competitive: market.competitive,
      liquidity: liquidity,
      createdAt: market.createdAt,
      updatedAt: market.updatedAt,
      // Resolution fields (for resolved markets)
      closedTime: market.closedTime,
      resolvedBy: market.resolvedBy,
      resolutionSource: market.resolutionSource,
      umaResolutionStatus: market.umaResolutionStatus,
      automaticallyResolved: market.automaticallyResolved,
    };
  } catch (error) {
    logger.error({
      message: 'Error transforming market',
      marketId: market.id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TransformationError(
      ErrorCode.DATA_PARSING_ERROR,
      `Failed to transform market ${market.id}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Transform tags
 */
function transformTags(tags?: any[]): TransformedTag[] {
  if (!tags || !Array.isArray(tags)) {
    return [];
  }

  return tags.map((tag) => ({
    id: String(tag.id || ''),
    label: tag.label || '',
    slug: tag.slug || '',
  })).filter((tag) => tag.id && tag.label && tag.slug);
}

/**
 * Transform a single event and group its markets
 */
function transformEvent(event: PolymarketEvent): TransformedEvent {
  try {
    // Transform markets
    // Include closed markets for resolved events (they may have resolution data)
    const markets: TransformedMarket[] = (event.markets || [])
      .filter((market) => {
        // Filter out invalid/archived markets
        if (market.archived) return false;
        // Keep active markets and closed markets (for resolved events)
        return market.active || market.closed;
      })
      .map((market) => transformMarket(market));

    // Calculate total volumes
    const totalVolume = markets.reduce((sum, market) => sum + (market.volume || 0), 0);
    const totalVolume24Hr = markets.reduce((sum, market) => sum + (market.volume24Hr || 0), 0);
    const totalVolume1Wk = markets.reduce((sum, market) => sum + (market.volume1Wk || 0), 0);
    const totalVolume1Mo = markets.reduce((sum, market) => sum + (market.volume1Mo || 0), 0);
    const totalVolume1Yr = markets.reduce((sum, market) => sum + (market.volume1Yr || 0), 0);

    // Calculate total liquidity
    const totalLiquidity = markets.reduce((sum, market) => sum + (market.liquidity || 0), 0);

    // Get event-level competitive score (average of markets or event-level)
    const competitive = event.competitive ?? 
      (markets.length > 0 
        ? markets.reduce((sum, m) => sum + (m.competitive || 0), 0) / markets.length 
        : 0);

    const eventVolume = typeof event.volume === 'string'
      ? parseFloat(event.volume)
      : (typeof event.volume === 'number' ? event.volume : 0);

    const eventLiquidity = typeof event.liquidity === 'string'
      ? parseFloat(event.liquidity)
      : (typeof event.liquidity === 'number' ? event.liquidity : 0);

    // Detect if event has group items
    const hasGroupItems = markets.some((m) => m.isGroupItem);

    // Create groupedOutcomes - aggregate ALL markets for live games (both group items and non-group items)
    let groupedOutcomes: TransformedOutcome[] | undefined;

    // Get all active markets (both group items and non-group items)
    // Only include markets that are active AND not closed (active: true, closed: false)
    const activeMarkets = markets.filter((m) => !m.archived && m.active === true && m.closed === false);
    const hasMultipleMarkets = activeMarkets.length > 1;

    // For live games with multiple markets, aggregate ALL markets (not just group items)
    // This ensures moneyline, spread, totals, etc. are all included in groupedOutcomes
    // Also create groupedOutcomes if event has only one active market (for consistency)
    if ((hasMultipleMarkets || activeMarkets.length === 1) && !event.closed) {
      // Aggregate outcomes from ALL markets (both group items and non-group items)
      // This ensures live games show moneyline, spread, totals, etc. all together
      const aggregatedOutcomes: TransformedOutcome[] = [];

      for (const market of activeMarkets) {
        let marketOutcomes: TransformedOutcome[] = [];

        // For group items, each market typically represents one outcome
        // For non-group items, each market has multiple outcomes
        if (market.isGroupItem) {
          // Group item: use structuredOutcomes if available, otherwise parse from outcomePrices
          if (market.structuredOutcomes && market.structuredOutcomes.length > 0) {
            // Use the first structured outcome (group items typically have one outcome)
            const structured = market.structuredOutcomes[0];
            marketOutcomes = [{
              ...structured,
              label: market.groupItemTitle || structured.label,
              shortLabel: (market.groupItemTitle || structured.label).slice(0, 3).toUpperCase(),
              volume: market.volume || structured.volume,
              icon: market.icon || structured.icon,
              groupItemThreshold: market.groupItemThreshold,
              isWinner: structured.isWinner,
              marketId: market.id,
              marketQuestion: market.question,
              active: market.active ?? false,
              closed: market.closed ?? false,
            }];
          } else {
            // Fallback: parse outcomePrices directly for group items
            const prices = parseOutcomePrices(market.outcomePrices);
            const yesPrice = prices[0] || 0;
            
            // Normalize probabilities for this market (group items typically have 2 outcomes: Yes/No)
            const rawProbabilities = prices.map((p) => Math.max(0, Math.min(100, p)));
            const normalizedProbabilities = normalizeProbabilities(rawProbabilities);
            const probability = normalizedProbabilities[0] || 0;
            
            // Detect if this group market is resolved and won
            const isResolved = market.closed === true;
            const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
            const isWinner = isResolved && yesPrice >= 99 && yesPrice === maxPrice;
            
            // Extract clobTokenId from stored clobTokenIds
            const clobTokenId = market.clobTokenIds?.[0] || undefined;

            marketOutcomes = [{
              label: market.groupItemTitle || market.question || 'Unknown',
              shortLabel: (market.groupItemTitle || market.question || 'UNK').slice(0, 3).toUpperCase(),
              price: yesPrice.toFixed(2),
              probability: probability,
              volume: market.volume || 0,
              icon: market.icon,
              clobTokenId: clobTokenId,
              conditionId: market.conditionId,
              groupItemThreshold: market.groupItemThreshold,
              isWinner: isWinner || undefined,
              marketId: market.id,
              marketQuestion: market.question,
              active: market.active ?? false,
              closed: market.closed ?? false,
            }];
          }
        } else {
          // Non-group item: use structuredOutcomes if available, otherwise parse from raw data
          if (market.structuredOutcomes && market.structuredOutcomes.length > 0) {
            marketOutcomes = market.structuredOutcomes.map((outcome) => ({
              ...outcome,
              marketId: market.id,
              marketQuestion: market.question,
              active: market.active ?? false,
              closed: market.closed ?? false,
            }));
          } else {
              // Fallback: parse outcomes from raw market data
              const outcomeLabels = parseOutcomes(market.outcomes);
              const prices = parseOutcomePrices(market.outcomePrices);

              if (outcomeLabels.length > 0 && prices.length > 0) {
                const tokenIds = market.clobTokenIds || [];
                const marketVolume = market.volume || 0;

                // Calculate individual outcome volumes
                const totalPrice = prices.reduce((sum, p) => sum + p, 0);
                const volumePerOutcome = totalPrice > 0
                  ? outcomeLabels.map((_, index) => {
                      const priceRatio = prices[index] || 0;
                      return (priceRatio / totalPrice) * marketVolume;
                    })
                  : outcomeLabels.map(() => marketVolume / outcomeLabels.length);

                // Detect if market is resolved and find winner
                const isResolved = market.closed === true;
                let winnerIndex = -1;
                if (isResolved && prices.length > 0) {
                  let maxPrice = -1;
                  prices.forEach((p, index) => {
                    const priceNum = typeof p === 'string' ? parseFloat(p) : p;
                    if (!isNaN(priceNum) && priceNum > maxPrice) {
                      maxPrice = priceNum;
                      winnerIndex = index;
                    }
                  });
                  if (maxPrice < 99) {
                    winnerIndex = -1;
                  }
                }

                // Normalize probabilities for this market to ensure they sum to 100%
                const rawProbabilities = prices.map((p) => Math.max(0, Math.min(100, p)));
                const normalizedProbabilities = normalizeProbabilities(rawProbabilities);

                marketOutcomes = outcomeLabels.map((label, index) => {
                  const rawPrice = prices[index] || 0;
                  const probability = normalizedProbabilities[index] || 0;
                  const isWinner = isResolved && index === winnerIndex;

                  return {
                    label: label || 'Unknown',
                    shortLabel: (label || 'UNK').slice(0, 3).toUpperCase(),
                    price: rawPrice.toFixed(2),
                    probability: probability,
                    volume: Math.round(volumePerOutcome[index] || 0),
                    icon: market.icon,
                    clobTokenId: tokenIds[index],
                    conditionId: market.conditionId,
                    isWinner: isWinner || undefined,
                    marketId: market.id,
                    marketQuestion: market.question,
                    active: market.active ?? false,
                    closed: market.closed ?? false,
                  };
                });
              }
            }
        }

        // Add all outcomes from this market to aggregated list
        aggregatedOutcomes.push(...marketOutcomes);
      }

      // Sort all aggregated outcomes by probability descending
      // Filter to ensure only outcomes from active, non-closed markets are included
      if (aggregatedOutcomes.length > 0) {
        const beforeFilter = aggregatedOutcomes.length;
        groupedOutcomes = aggregatedOutcomes
          .filter((outcome) => {
            const isActive = outcome.active === true;
            const isNotClosed = outcome.closed === false;
            return isActive && isNotClosed;
          })
          .sort((a, b) => b.probability - a.probability);
        
        logger.info({
          message: 'Aggregated outcomes from all markets',
          eventId: event.id,
          marketCount: activeMarkets.length,
          outcomeCountBeforeFilter: beforeFilter,
          outcomeCountAfterFilter: groupedOutcomes.length,
        });
        
        // If all outcomes were filtered out, log a warning
        if (groupedOutcomes.length === 0 && beforeFilter > 0) {
          logger.warn({
            message: 'All outcomes filtered out - all markets may be inactive or closed',
            eventId: event.id,
            marketCount: activeMarkets.length,
            marketsActive: activeMarkets.map(m => ({ id: m.id, active: m.active, closed: m.closed })),
          });
        }
      } else {
        logger.warn({
          message: 'No aggregated outcomes created',
          eventId: event.id,
          marketCount: activeMarkets.length,
        });
      }
    } else if (activeMarkets.length > 0) {
      // Single market or closed event: use the best market by liquidity (or volume)
      const sortedMarkets = [...activeMarkets].sort((a, b) => {
        const aLiquidity = a.liquidity || 0;
        const bLiquidity = b.liquidity || 0;
        if (aLiquidity !== bLiquidity) {
          return bLiquidity - aLiquidity;
        }
        return (b.volume || 0) - (a.volume || 0);
      });

      // Try markets in order until we find one with outcomes
      for (const market of sortedMarkets) {
        if (market.structuredOutcomes && market.structuredOutcomes.length > 0) {
          groupedOutcomes = market.structuredOutcomes
            .map((outcome) => ({
              ...outcome,
              marketId: market.id,
              marketQuestion: market.question,
              active: market.active ?? false,
              closed: market.closed ?? false,
            }))
            .filter((outcome) => outcome.active === true && outcome.closed === false)
            .sort((a, b) => b.probability - a.probability);
          break;
        }
      }

      // If still no outcomes found, try to create outcomes from raw data as fallback
      if (!groupedOutcomes || groupedOutcomes.length === 0) {
        for (const market of sortedMarkets) {
              // Try to parse outcomes directly from raw market data
              const outcomeLabels = parseOutcomes(market.outcomes);
              const prices = parseOutcomePrices(market.outcomePrices);
              
          if (outcomeLabels.length > 0 && prices.length > 0) {
            const tokenIds = market.clobTokenIds || [];
            const marketVolume = market.volume || 0;
            
            // Calculate individual outcome volumes (distribute market volume proportionally)
            const totalPrice = prices.reduce((sum, p) => sum + p, 0);
            const volumePerOutcome = totalPrice > 0
              ? outcomeLabels.map((_, index) => {
                  const priceRatio = prices[index] || 0;
                  return (priceRatio / totalPrice) * marketVolume;
                })
              : outcomeLabels.map(() => marketVolume / outcomeLabels.length);
            
            // Detect if market is resolved and find winner
            const isResolved = market.closed === true;
            let winnerIndex = -1;
            if (isResolved && prices.length > 0) {
              let maxPrice = -1;
              prices.forEach((p, index) => {
                const priceNum = typeof p === 'string' ? parseFloat(p) : p;
                if (!isNaN(priceNum) && priceNum > maxPrice) {
                  maxPrice = priceNum;
                  winnerIndex = index;
                }
              });
              // Only consider it a winner if price is >= 99 (very high confidence)
              if (maxPrice < 99) {
                winnerIndex = -1; // No clear winner if max price is too low
              }
            }
            
            // Normalize probabilities for this market to ensure they sum to 100%
            const rawProbabilities = prices.map((p) => Math.max(0, Math.min(100, p)));
            const normalizedProbabilities = normalizeProbabilities(rawProbabilities);
            
            groupedOutcomes = outcomeLabels
              .map((label, index) => {
                const rawPrice = prices[index] || 0;
                const probability = normalizedProbabilities[index] || 0;
                const isWinner = isResolved && index === winnerIndex;
                
                return {
                  label: label || 'Unknown',
                  shortLabel: (label || 'UNK').slice(0, 3).toUpperCase(),
                  price: rawPrice.toFixed(2),
                  probability: probability,
                  volume: Math.round(volumePerOutcome[index] || 0),
                  icon: market.icon,
                  clobTokenId: tokenIds[index],
                  conditionId: market.conditionId,
                  isWinner: isWinner || undefined, // Only set if true
                  marketId: market.id,
                  marketQuestion: market.question,
                  active: market.active ?? false,
                  closed: market.closed ?? false,
                };
              })
              .filter((outcome) => outcome.active === true && outcome.closed === false)
              .sort((a, b) => b.probability - a.probability);
            
            if (groupedOutcomes.length > 0) {
              logger.info({
                message: 'Created fallback outcomes from raw market data',
                eventId: event.id,
                marketId: market.id,
                outcomeCount: groupedOutcomes.length,
              });
              break;
            }
          }
        }
      }
    }

    // Determine if event is resolved
    const isResolved = event.closed === true || 
      (markets.length > 0 && markets.every((m) => m.closed || !m.active));

    // For single binary resolved markets, filter to show only winner
    // Grouped events should show all outcomes (winners and losers)
    if (groupedOutcomes && groupedOutcomes.length > 0 && isResolved && !hasGroupItems) {
      // Check if this is a binary market (exactly 2 outcomes with Yes/No)
      const isBinaryMarket = groupedOutcomes.length === 2 &&
        groupedOutcomes.some(o => o.label.toLowerCase() === 'yes') &&
        groupedOutcomes.some(o => o.label.toLowerCase() === 'no');
      
      // Check if we have a winner detected
      const hasWinner = groupedOutcomes.some(o => o.isWinner === true);
      
      if (isBinaryMarket && hasWinner) {
        // Only keep the winner for single binary markets (only if winner is detected)
        groupedOutcomes = groupedOutcomes.filter(o => o.isWinner === true);
      }
      // For non-binary single markets or grouped events, or if no winner detected, keep all outcomes
    }

    // Final safety filter: ensure only outcomes from active, non-closed markets are included
    if (groupedOutcomes && groupedOutcomes.length > 0) {
      const beforeFinalFilter = groupedOutcomes.length;
      groupedOutcomes = groupedOutcomes.filter(
        (outcome) => outcome.active === true && outcome.closed === false
      );
      
      if (groupedOutcomes.length === 0 && beforeFinalFilter > 0) {
        logger.warn({
          message: 'Final filter removed all outcomes',
          eventId: event.id,
          beforeFilter: beforeFinalFilter,
        });
      }
    }
    
    // Ensure groupedOutcomes is set (even if empty) for events with active markets
    // This helps with debugging and ensures the field is always present
    if (!groupedOutcomes && activeMarkets.length > 0 && !event.closed) {
      logger.warn({
        message: 'groupedOutcomes not created despite having active markets',
        eventId: event.id,
        activeMarketCount: activeMarkets.length,
        eventClosed: event.closed,
      });
    }

    // Calculate outcome type identifiers for frontend differentiation
    // Note: Calculate after filtering so we use the final outcome count
    const outcomeCount = groupedOutcomes?.length || 0;
    const isBinaryOutcome = outcomeCount === 2;
    const isMultiOutcome = outcomeCount > 2;

    return {
      id: event.id,
      title: event.title || '',
      slug: event.slug || '',
      description: event.description,
      image: event.image || event.icon,
      icon: event.icon || event.image,
      totalVolume: eventVolume || totalVolume,
      volume24Hr: event.volume24hr || totalVolume24Hr,
      volume1Wk: event.volume1wk || totalVolume1Wk,
      volume1Mo: event.volume1mo || totalVolume1Mo,
      volume1Yr: event.volume1yr || totalVolume1Yr,
      liquidity: eventLiquidity || totalLiquidity || event.liquidityClob,
      openInterest: event.openInterest,
      competitive: competitive,
      active: event.active ?? false,
      closed: event.closed ?? false,
      archived: event.archived ?? false,
      restricted: event.restricted,
      featured: event.featured,
      commentCount: event.commentCount,
      markets: markets.sort((a, b) => (b.volume || 0) - (a.volume || 0)), // Sort markets by volume descending
      tags: transformTags(event.tags),
      startDate: event.startDate || event.startTime,
      endDate: event.endDate,
      createdAt: event.createdAt || event.creationDate,
      updatedAt: event.updatedAt,
      hasGroupItems: hasGroupItems,
      groupedOutcomes: groupedOutcomes,
      // Outcome type identifiers
      isBinaryOutcome: isBinaryOutcome || undefined, // Only set if true
      isMultiOutcome: isMultiOutcome || undefined, // Only set if true
      // Resolution fields
      closedTime: markets.find((m) => m.closedTime)?.closedTime,
      isResolved: isResolved,
    };
  } catch (error) {
    logger.error({
      message: 'Error transforming event',
      eventId: event.id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TransformationError(
      ErrorCode.TRANSFORMATION_ERROR,
      `Failed to transform event ${event.id}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Group events by ID and merge markets
 * Events with the same ID are merged, with markets combined
 */
function groupEvents(events: PolymarketEvent[]): PolymarketEvent[] {
  const eventMap = new Map<string, PolymarketEvent>();

  for (const event of events) {
    const existingEvent = eventMap.get(event.id);

    if (existingEvent) {
      // Merge markets, avoiding duplicates
      const existingMarketIds = new Set(
        (existingEvent.markets || []).map((m) => m.id)
      );

      const newMarkets = (event.markets || []).filter(
        (m) => !existingMarketIds.has(m.id)
      );

      existingEvent.markets = [
        ...(existingEvent.markets || []),
        ...newMarkets,
      ];

      // Update event-level data with most recent values
      if (event.updatedAt && (!existingEvent.updatedAt || event.updatedAt > existingEvent.updatedAt)) {
        existingEvent.volume24hr = event.volume24hr ?? existingEvent.volume24hr;
        existingEvent.volume1wk = event.volume1wk ?? existingEvent.volume1wk;
        existingEvent.volume1mo = event.volume1mo ?? existingEvent.volume1mo;
        existingEvent.volume1yr = event.volume1yr ?? existingEvent.volume1yr;
        existingEvent.competitive = event.competitive ?? existingEvent.competitive;
        existingEvent.updatedAt = event.updatedAt;
      }

      // Merge tags
      const existingTagIds = new Set(
        (existingEvent.tags || []).map((t) => t.id)
      );
      const newTags = (event.tags || []).filter(
        (t) => !existingTagIds.has(t.id)
      );
      existingEvent.tags = [...(existingEvent.tags || []), ...newTags];
    } else {
      eventMap.set(event.id, { ...event });
    }
  }

  return Array.from(eventMap.values());
}

/**
 * Transform and group events from API response
 */
export function transformEvents(events: PolymarketEvent[]): TransformedEvent[] {
  try {
    if (!Array.isArray(events)) {
      logger.warn({
        message: 'Invalid events data received',
        type: typeof events,
      });
      return [];
    }

    // Group events by ID first
    const groupedEvents = groupEvents(events);

    // Transform grouped events
    const transformed: TransformedEvent[] = [];

    for (const event of groupedEvents) {
      try {
        const transformedEvent = transformEvent(event);
        transformed.push(transformedEvent);
      } catch (error) {
        // Log error but continue processing other events
        logger.error({
          message: 'Failed to transform event, skipping',
          eventId: event.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Sort by volume24Hr descending
    transformed.sort((a, b) => (b.volume24Hr || 0) - (a.volume24Hr || 0));

    logger.info({
      message: 'Events transformed successfully',
      inputCount: events.length,
      groupedCount: groupedEvents.length,
      outputCount: transformed.length,
    });

    return transformed;
  } catch (error) {
    logger.error({
      message: 'Error in transformEvents',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new TransformationError(
      ErrorCode.TRANSFORMATION_ERROR,
      `Failed to transform events: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Merge polling data with main data
 * Updates markets in events with latest data from polling endpoint
 */
export function mergePollingData(
  mainEvents: TransformedEvent[],
  pollingEvents: TransformedEvent[]
): TransformedEvent[] {
  const eventMap = new Map<string, TransformedEvent>();

  // Add all main events to map
  for (const event of mainEvents) {
    eventMap.set(event.id, { ...event });
  }

  // Merge polling events
  for (const pollingEvent of pollingEvents) {
    const existingEvent = eventMap.get(pollingEvent.id);

    if (existingEvent) {
      // Merge markets, prioritizing polling data
      const marketMap = new Map<string, TransformedMarket>();

      // Add existing markets
      for (const market of existingEvent.markets) {
        marketMap.set(market.id, { ...market });
      }

      // Update with polling markets (prioritize polling data)
      for (const pollingMarket of pollingEvent.markets) {
        marketMap.set(pollingMarket.id, { ...pollingMarket });
      }

      existingEvent.markets = Array.from(marketMap.values())
        .sort((a, b) => (b.volume || 0) - (a.volume || 0));

      // Update event-level data with polling data if more recent
      existingEvent.volume24Hr = pollingEvent.volume24Hr || existingEvent.volume24Hr;
      existingEvent.totalVolume = pollingEvent.totalVolume || existingEvent.totalVolume;
      existingEvent.competitive = pollingEvent.competitive ?? existingEvent.competitive;
      
      // Update computed fields from polling data (which has latest market data)
      existingEvent.hasGroupItems = pollingEvent.hasGroupItems ?? existingEvent.hasGroupItems;
      existingEvent.groupedOutcomes = pollingEvent.groupedOutcomes || existingEvent.groupedOutcomes;
      // Update outcome type identifiers from polling data
      existingEvent.isBinaryOutcome = pollingEvent.isBinaryOutcome ?? existingEvent.isBinaryOutcome;
      existingEvent.isMultiOutcome = pollingEvent.isMultiOutcome ?? existingEvent.isMultiOutcome;
    } else {
      // New event from polling, add it
      eventMap.set(pollingEvent.id, { ...pollingEvent });
    }
  }

  const merged = Array.from(eventMap.values());
  
  // Re-sort by volume24Hr descending
  merged.sort((a, b) => (b.volume24Hr || 0) - (a.volume24Hr || 0));

  logger.info({
    message: 'Polling data merged',
    mainCount: mainEvents.length,
    pollingCount: pollingEvents.length,
    mergedCount: merged.length,
  });

  return merged;
}

