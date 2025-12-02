/**
 * Test script to fetch and display live games data
 */

const axios = require('axios');

const POLYMARKET_LIVE_ENDPOINT = 'https://polymarket.com/_next/data/ydeAKiopMLZxqGsdeVui4/sports/live.json?slug=live';

async function testLiveGames() {
  try {
    console.log('Fetching live games from Polymarket...\n');
    
    const response = await axios.get(POLYMARKET_LIVE_ENDPOINT, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      timeout: 30000,
    });

    // Extract events from the response
    const queries = response.data?.pageProps?.dehydratedState?.queries || [];
    let events = {};
    
    for (const query of queries) {
      const data = query.state?.data;
      if (data && typeof data === 'object' && 'events' in data) {
        events = { ...events, ...(data.events || {}) };
      }
    }

    const eventArray = Object.values(events);
    
    console.log(`✅ Successfully fetched ${eventArray.length} total games\n`);
    
    // Show first 5 games as examples
    console.log('📊 Sample Games (first 5):\n');
    console.log('='.repeat(80));
    
    eventArray.slice(0, 5).forEach((game, index) => {
      console.log(`\n${index + 1}. ${game.title || game.slug}`);
      console.log(`   ID: ${game.id}`);
      console.log(`   Slug: ${game.slug}`);
      console.log(`   Ticker: ${game.ticker}`);
      console.log(`   Start Date: ${game.startDate}`);
      console.log(`   End Date: ${game.endDate}`);
      console.log(`   Active: ${game.active}`);
      console.log(`   Closed: ${game.closed}`);
      console.log(`   Volume 24hr: ${game.volume24hr || 'N/A'}`);
      console.log(`   Liquidity: ${game.liquidity || 'N/A'}`);
      if (game.markets && game.markets.length > 0) {
        console.log(`   Markets: ${game.markets.length}`);
      }
    });
    
    console.log('\n' + '='.repeat(80));
    console.log(`\n📈 Summary:`);
    console.log(`   Total games fetched: ${eventArray.length}`);
    console.log(`   Active games: ${eventArray.filter(g => g.active && !g.closed).length}`);
    console.log(`   Closed games: ${eventArray.filter(g => g.closed).length}`);
    
    // Check for sports-related games
    const sportsKeywords = ['nfl', 'nba', 'mlb', 'nhl', 'ufc', 'epl', 'premier', 'liga', 'soccer', 'football', 'basketball', 'baseball', 'hockey'];
    const sportsGames = eventArray.filter(game => {
      const slug = (game.slug || '').toLowerCase();
      const title = (game.title || '').toLowerCase();
      return sportsKeywords.some(keyword => slug.includes(keyword) || title.includes(keyword));
    });
    
    console.log(`   Sports-related games: ${sportsGames.length}`);
    
    if (sportsGames.length > 0) {
      console.log(`\n🏀 Sports Games Found:\n`);
      sportsGames.slice(0, 10).forEach((game, index) => {
        console.log(`   ${index + 1}. ${game.title} (${game.slug})`);
      });
    }
    
    // Show full structure of first game
    console.log(`\n📋 Full Structure of First Game:\n`);
    console.log(JSON.stringify(eventArray[0], null, 2));
    
  } catch (error) {
    console.error('❌ Error fetching live games:');
    console.error(error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2).substring(0, 500));
    }
    process.exit(1);
  }
}

testLiveGames();

