// function transformPolymarketToMarket(event: PolymarketEvent): MarketWithOutcomes | null {
//   try {
//     if (!event || !event.markets || event.markets.length === 0) {
//       return null;
//     }

//     console.log("Transforming event:", event.slug, "markets count:", event.markets.length);

//     const hasGroupItems = event.markets.some((m) => m.groupItemTitle);

//     if (hasGroupItems) {
//       const groupMarkets = event.markets
//         .filter((m) => m.groupItemTitle && m.active && !m.closed && !m.archived)
//         .sort((a, b) => {
//           const aThreshold = parseFloat(a.groupItemThreshold || "0");
//           const bThreshold = parseFloat(b.groupItemThreshold || "0");
//           return aThreshold - bThreshold;
//         });

//       if (groupMarkets.length === 0) {
//         return null;
//       }

//       const marketOutcomes: MarketOutcome[] = groupMarkets.map((market) => {
//         const prices = parseOutcomePrices(market.outcomePrices);
//         const yesPrice = prices[0] || 0;
//         const probability = Math.max(0, Math.min(100, Math.round(yesPrice)));

//         let tokenIds: string[] = [];
//         if (market.clobTokenIds) {
//           if (typeof market.clobTokenIds === "string") {
//             try {
//               const sanitized = market.clobTokenIds.trim().replace(/'/g, '"');
//               const parsed = JSON.parse(sanitized);
//               tokenIds = Array.isArray(parsed) ? parsed : [];
//             } catch (error) {
//               console.warn(`Failed to parse clobTokenIds for ${market.groupItemTitle}:`, error);
//               const match = market.clobTokenIds.match(/\d{70,}/g);
//               tokenIds = match || [];
//             }
//           } else if (Array.isArray(market.clobTokenIds)) {
//             tokenIds = market.clobTokenIds;
//           }
//         }

//         return {
//           label: market.groupItemTitle || "Unknown",
//           shortLabel: (market.groupItemTitle || "UNK").slice(0, 3).toUpperCase(),
//           price: (yesPrice / 100).toFixed(4),
//           probability: probability,
//           icon: market.icon,
//           clobTokenId: tokenIds[0],
//           startDate: market.startDate,
//           groupItemThreshold: market.groupItemThreshold,
//         };
//       });

//       const homeOutcome = marketOutcomes[0];
//       const awayOutcome =
//         marketOutcomes.length > 1
//           ? marketOutcomes[1]
//           : {
//               label: "Other",
//               shortLabel: "OTH",
//               price: "0.0000",
//               probability: 0,
//               icon: undefined,
//               clobTokenId: undefined,
//             };

//       if (marketOutcomes.length < 2) {
//         console.warn(`Market ${event.slug} has only ${marketOutcomes.length} outcome(s), showing with placeholder`);
//       }

//       const category = categorizeEvent(event);
//       const sportType = getSpecificSportType(event);
//       const logoUrl = event.icon || event.image || null;

//       const result = {
//         id: event.slug,
//         sport: category,
//         sportType: sportType,
//         title: event.title || "Unknown Event",
//         homeTeamName: homeOutcome.label,
//         homeTeamLogo: homeOutcome.label.slice(0, 2),
//         homeTeamShortName: homeOutcome.shortLabel,
//         homeTeamScore: 0,
//         homeTeamPercent: homeOutcome.probability,
//         homeTeamLogoUrl: logoUrl,
//         awayTeamName: awayOutcome.label,
//         awayTeamLogo: awayOutcome.label.slice(0, 2),
//         awayTeamShortName: awayOutcome.shortLabel,
//         awayTeamScore: 0,
//         awayTeamPercent: awayOutcome.probability,
//         awayTeamLogoUrl: logoUrl,
//         volume: event.volume?.toString() || "0",
//         isLive: false,
//         liveStatus: null,
//         gameSituation: null,
//         news: event.description?.slice(0, 150) || null,
//         outcomes: marketOutcomes,
//         conditionId: groupMarkets[0]?.conditionId,
//         description: event.description,
//         startDate: groupMarkets[0]?.startDate || event.createdAt || event.creationDate,
//         endDate: event.endDateIso || event.endDate,
//         resolutionSource: event.resolutionSource,
//         rawMarkets: event.markets, // Preserve all original market data
//       };

//       console.log(`Transformed ${event.slug}: rawMarkets count =`, result.rawMarkets?.length);
//       return result;
//     }

//     const activeMarkets = event.markets.filter((m) => m.active && !m.closed && !m.archived);
//     if (activeMarkets.length === 0) {
//       return null;
//     }

//     const bestMarket = activeMarkets.reduce((best, current) => {
//       const currentLiquidity = parseFloat(current.liquidity || "0");
//       const bestLiquidity = parseFloat(best.liquidity || "0");
//       return currentLiquidity > bestLiquidity ? current : best;
//     }, activeMarkets[0]);

//     const outcomeLabels = parseOutcomes(bestMarket.outcomes);
//     if (outcomeLabels.length < 2) {
//       return null;
//     }

//     const prices = parseOutcomePrices(bestMarket.outcomePrices);

//     const marketOutcomes: MarketOutcome[] = outcomeLabels.map((label, index) => {
//       const rawProb = prices[index] || 0;
//       const probability = Math.max(0, Math.min(100, Math.round(rawProb)));

//       return {
//         label: label,
//         shortLabel: label.slice(0, 3).toUpperCase(),
//         price: ((prices[index] || 0) / 100).toFixed(4),
//         probability: probability,
//         icon: bestMarket.icon || event.icon || event.image,
//         startDate: bestMarket.startDate,
//       };
//     });

//     const homeOutcome = marketOutcomes[0];
//     const awayOutcome = marketOutcomes[1];

//     const category = categorizeEvent(event);
//     const sportType = getSpecificSportType(event);
//     const logoUrl = event.icon || event.image || null;

//     const result = {
//       id: event.slug,
//       sport: category,
//       sportType: sportType,
//       title: event.title || "Unknown Event",
//       homeTeamName: homeOutcome.label,
//       homeTeamLogo: homeOutcome.label.slice(0, 2),
//       homeTeamShortName: homeOutcome.shortLabel,
//       homeTeamScore: 0,
//       homeTeamPercent: homeOutcome.probability,
//       homeTeamLogoUrl: logoUrl,
//       awayTeamName: awayOutcome.label,
//       awayTeamLogo: awayOutcome.label.slice(0, 2),
//       awayTeamShortName: awayOutcome.shortLabel,
//       awayTeamScore: 0,
//       awayTeamPercent: awayOutcome.probability,
//       awayTeamLogoUrl: logoUrl,
//       volume: event.volume?.toString() || "0",
//       isLive: false,
//       liveStatus: null,
//       gameSituation: null,
//       news: event.description?.slice(0, 150) || null,
//       outcomes: marketOutcomes,
//       conditionId: bestMarket?.conditionId,
//       description: event.description,
//       startDate: bestMarket?.startDate || event.createdAt || event.creationDate,
//       endDate: event.endDateIso || event.endDate,
//       resolutionSource: event.resolutionSource,
//       rawMarkets: event.markets, // Preserve all original market data
//     };

//     console.log(`Transformed ${event.slug}: rawMarkets count =`, result.rawMarkets?.length);
//     return result;
//   } catch (error) {
//     console.error("Error transforming Polymarket event:", error);
//     return null;
//   }
// }

// export interface MarketWithOutcomes {
//     id: string;
//     sport: string;
//     sportType?: string; // Specific subcategory like "NFL", "NBA", "Bitcoin", etc.
//     title: string;
//     homeTeamName: string;
//     homeTeamLogo: string;
//     homeTeamShortName: string;
//     homeTeamScore: number;
//     homeTeamPercent: number;
//     homeTeamLogoUrl: string | null;
//     awayTeamName: string;
//     awayTeamLogo: string;
//     awayTeamShortName: string;
//     awayTeamScore: number;
//     awayTeamPercent: number;
//     awayTeamLogoUrl: string | null;
//     volume: string;
//     isLive: boolean;
//     liveStatus: string | null;
//     gameSituation: string | null;
//     news: string | null;
//     outcomes: MarketOutcome[];
//     conditionId?: string;
//     image?: string;
//     icon?: string;
//     description?: string;
//     startDate?: string;
//     endDate?: string;
//     resolutionSource?: string;
//     rawMarkets?: any[]; // Preserve original market data for detail page
//   }