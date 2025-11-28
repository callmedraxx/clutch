/**
 * Script to investigate resolved/closed market data structure
 * This will help us understand what data is available for resolved markets
 */

import * as fs from 'fs';
import * as path from 'path';

interface Market {
  id: string;
  question: string;
  closed?: boolean;
  closedTime?: string;
  resolvedBy?: string;
  resolutionSource?: string;
  umaResolutionStatus?: string;
  automaticallyResolved?: boolean;
  outcomes?: string[] | string;
  outcomePrices?: string[] | string;
  active?: boolean;
  archived?: boolean;
  [key: string]: any;
}

interface Event {
  id: string;
  title: string;
  closed?: boolean;
  markets?: Market[];
  [key: string]: any;
}

function investigateResolvedMarkets() {
  const samplePath = path.join(__dirname, '..', 'sample.json');
  
  if (!fs.existsSync(samplePath)) {
    console.log('sample.json not found. Fetching from API instead...');
    console.log('Please run this script after fetching sample data or provide API endpoint.');
    return;
  }

  console.log('Reading sample.json...');
  const data = JSON.parse(fs.readFileSync(samplePath, 'utf-8'));
  
  const events: Event[] = data.data || data.events || [];
  console.log(`Found ${events.length} events\n`);

  // Find closed/resolved markets
  const closedMarkets: Market[] = [];
  const closedEvents: Event[] = [];

  events.forEach(event => {
    if (event.closed) {
      closedEvents.push(event);
    }
    
    event.markets?.forEach(market => {
      if (market.closed) {
        closedMarkets.push(market);
      }
    });
  });

  console.log(`Found ${closedEvents.length} closed events`);
  console.log(`Found ${closedMarkets.length} closed markets\n`);

  if (closedMarkets.length === 0 && closedEvents.length === 0) {
    console.log('No closed markets found in sample.json');
    console.log('Trying to find markets with resolution-related fields...\n');
    
    // Look for markets with resolution fields even if not explicitly closed
    const marketsWithResolution: Market[] = [];
    events.forEach(event => {
      event.markets?.forEach(market => {
        if (market.resolvedBy || market.resolutionSource || market.umaResolutionStatus || market.closedTime) {
          marketsWithResolution.push(market);
        }
      });
    });
    
    console.log(`Found ${marketsWithResolution.length} markets with resolution fields\n`);
    
    if (marketsWithResolution.length > 0) {
      console.log('Sample market with resolution fields:');
      const sample = marketsWithResolution[0];
      console.log(JSON.stringify({
        id: sample.id,
        question: sample.question,
        closed: sample.closed,
        closedTime: sample.closedTime,
        resolvedBy: sample.resolvedBy,
        resolutionSource: sample.resolutionSource,
        umaResolutionStatus: sample.umaResolutionStatus,
        automaticallyResolved: sample.automaticallyResolved,
        active: sample.active,
        archived: sample.archived,
        outcomes: sample.outcomes,
        outcomePrices: sample.outcomePrices,
        lastTradePrice: sample.lastTradePrice,
        bestBid: sample.bestBid,
        bestAsk: sample.bestAsk,
      }, null, 2));
    }
  } else {
    // Analyze closed markets
    console.log('=== CLOSED MARKETS ANALYSIS ===\n');
    
    const sample = closedMarkets[0];
    console.log('Sample closed market:');
    console.log(JSON.stringify({
      id: sample.id,
      question: sample.question,
      closed: sample.closed,
      closedTime: sample.closedTime,
      resolvedBy: sample.resolvedBy,
      resolutionSource: sample.resolutionSource,
      umaResolutionStatus: sample.umaResolutionStatus,
      automaticallyResolved: sample.automaticallyResolved,
      active: sample.active,
      archived: sample.archived,
      outcomes: sample.outcomes,
      outcomePrices: sample.outcomePrices,
      lastTradePrice: sample.lastTradePrice,
      bestBid: sample.bestBid,
      bestAsk: sample.bestAsk,
    }, null, 2));

    // Check outcome prices for resolved markets
    console.log('\n=== OUTCOME PRICES ANALYSIS ===');
    const marketsWithPrices = closedMarkets.filter(m => m.outcomePrices);
    console.log(`${marketsWithPrices.length} closed markets have outcomePrices`);
    
    if (marketsWithPrices.length > 0) {
      const sampleWithPrices = marketsWithPrices[0];
      console.log('\nSample outcome prices:');
      console.log('Outcomes:', sampleWithPrices.outcomes);
      console.log('Outcome Prices:', sampleWithPrices.outcomePrices);
      
      // Check if prices indicate resolution (one outcome at 100% or 1.0)
      try {
        const prices = Array.isArray(sampleWithPrices.outcomePrices)
          ? sampleWithPrices.outcomePrices
          : JSON.parse(sampleWithPrices.outcomePrices as string);
        
        const pricesNum = prices.map((p: string) => parseFloat(p));
        console.log('Parsed prices:', pricesNum);
        
        const resolvedOutcomeIndex = pricesNum.findIndex((p: number) => p >= 0.99 || p === 1.0);
        if (resolvedOutcomeIndex >= 0) {
          const outcomes = Array.isArray(sampleWithPrices.outcomes)
            ? sampleWithPrices.outcomes
            : JSON.parse(sampleWithPrices.outcomes as string);
          console.log(`\nRESOLVED: ${outcomes[resolvedOutcomeIndex]} won (${(pricesNum[resolvedOutcomeIndex] * 100).toFixed(2)}%)`);
        }
      } catch (e) {
        console.log('Error parsing prices:', e);
      }
    }
  }

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Total events: ${events.length}`);
  console.log(`Closed events: ${closedEvents.length}`);
  console.log(`Closed markets: ${closedMarkets.length}`);
  console.log('\nFields to check for resolved markets:');
  console.log('- closed: boolean');
  console.log('- closedTime: timestamp');
  console.log('- resolvedBy: address');
  console.log('- resolutionSource: string');
  console.log('- umaResolutionStatus: string');
  console.log('- automaticallyResolved: boolean');
  console.log('- outcomePrices: array (one outcome should be ~1.0 or 100%)');
}

// Run if executed directly
if (require.main === module) {
  investigateResolvedMarkets();
}

export { investigateResolvedMarkets };

