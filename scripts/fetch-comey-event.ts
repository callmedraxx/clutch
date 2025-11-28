/**
 * Script to fetch James Comey event from Polymarket API
 * Shows how resolved markets are returned
 */

import { polymarketClient } from '../src/services/polymarket/polymarket.client';

async function fetchComeyEvent() {
  try {
    console.log('Searching for James Comey indictment event...\n');
    
    // Search for resolved events with "comey" or "indictment"
    const searchParams = {
      q: 'James Comey indictment dismissed',
      type: 'events',
      events_status: 'resolved',
      limit_per_type: 20,
      page: 1,
    };
    
    const response = await polymarketClient.get<any>(
      '/search',
      searchParams
    );
    
    const events = response.events || [];
    console.log(`Found ${events.length} resolved events\n`);
    
    // Find Comey event
    const comeyEvent = events.find((e: any) => 
      e.title && (
        e.title.toLowerCase().includes('comey') && 
        (e.title.toLowerCase().includes('indictment') || e.title.toLowerCase().includes('dismissed'))
      )
    );
    
    if (comeyEvent) {
      console.log('='.repeat(80));
      console.log('FOUND JAMES COMEY EVENT');
      console.log('='.repeat(80));
      console.log('\nEvent Data:');
      console.log(JSON.stringify(comeyEvent, null, 2));
      
      // Extract key resolution fields
      console.log('\n' + '='.repeat(80));
      console.log('KEY RESOLUTION FIELDS:');
      console.log('='.repeat(80));
      console.log(`Title: ${comeyEvent.title}`);
      console.log(`Event ID: ${comeyEvent.id}`);
      console.log(`Event Closed: ${comeyEvent.closed}`);
      console.log(`Event Active: ${comeyEvent.active}`);
      
      if (comeyEvent.markets && comeyEvent.markets.length > 0) {
        const market = comeyEvent.markets[0];
        console.log(`\nMarket ID: ${market.id}`);
        console.log(`Market Closed: ${market.closed}`);
        console.log(`Market Active: ${market.active}`);
        console.log(`Closed Time: ${market.closedTime || 'N/A'}`);
        console.log(`Resolved By: ${market.resolvedBy || 'N/A'}`);
        console.log(`UMA Resolution Status: ${market.umaResolutionStatus || 'N/A'}`);
        console.log(`Automatically Resolved: ${market.automaticallyResolved || 'N/A'}`);
        console.log(`Outcomes: ${market.outcomes || 'N/A'}`);
        console.log(`Outcome Prices: ${market.outcomePrices || 'N/A'}`);
      }
    } else {
      console.log('James Comey event not found. Showing first 5 resolved events:');
      events.slice(0, 5).forEach((e: any, i: number) => {
        console.log(`\n${i + 1}. ${e.title}`);
        console.log(`   ID: ${e.id}`);
        console.log(`   Closed: ${e.closed}`);
        if (e.markets && e.markets.length > 0) {
          const m = e.markets[0];
          console.log(`   Market Closed: ${m.closed}`);
          console.log(`   Outcome Prices: ${m.outcomePrices}`);
        }
      });
    }
  } catch (error: any) {
    console.error('Error fetching event:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

fetchComeyEvent();

