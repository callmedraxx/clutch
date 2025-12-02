/**
 * Test script to show filtered games based on sports-games.config.ts
 */

const axios = require('axios');

const POLYMARKET_LIVE_ENDPOINT = 'https://polymarket.com/_next/data/ydeAKiopMLZxqGsdeVui4/sports/live.json?slug=live';

// Sports config (from sports-games.config.ts)
const SPORTS_CONFIG = {
  nfl: { seriesId: '10187', label: 'NFL' },
  nba: { seriesId: '10345', label: 'NBA' },
  mlb: { seriesId: '3', label: 'MLB' },
  nhl: { seriesId: '10346', label: 'NHL' },
  ufc: { seriesId: '', label: 'UFC' },
  epl: { seriesId: '10188', label: 'English Premier League' },
  lal: { seriesId: '10193', label: 'La Liga' },
};

function extractSportFromGame(game) {
  const slug = (game.slug || '').toLowerCase();
  const title = (game.title || '').toLowerCase();
  
  const sportIndicators = {
    nfl: ['nfl', 'football'],
    nba: ['nba', 'basketball'],
    mlb: ['mlb', 'baseball'],
    nhl: ['nhl', 'hockey'],
    ufc: ['ufc', 'mma'],
    epl: ['epl', 'premier league', 'premier-league'],
    lal: ['lal', 'la liga', 'la-liga', 'laliga'],
  };
  
  for (const [sport, config] of Object.entries(SPORTS_CONFIG)) {
    const indicators = sportIndicators[sport] || [sport];
    for (const indicator of indicators) {
      if (slug.includes(indicator) || title.includes(indicator)) {
        return sport;
      }
    }
  }
  
  return null;
}

function isGameInConfiguredSport(game) {
  const sport = extractSportFromGame(game);
  if (!sport) return false;
  const config = SPORTS_CONFIG[sport];
  return config && config.seriesId && config.seriesId !== '';
}

async function testFilteredGames() {
  try {
    console.log('Fetching and filtering live games...\n');
    
    const response = await axios.get(POLYMARKET_LIVE_ENDPOINT, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      timeout: 30000,
    });

    const queries = response.data?.pageProps?.dehydratedState?.queries || [];
    let events = {};
    
    for (const query of queries) {
      const data = query.state?.data;
      if (data && typeof data === 'object' && 'events' in data) {
        events = { ...events, ...(data.events || {}) };
      }
    }

    const allGames = Object.values(events);
    const filteredGames = allGames.filter(isGameInConfiguredSport);
    
    console.log(`✅ Total games fetched: ${allGames.length}`);
    console.log(`🎯 Filtered games (configured sports): ${filteredGames.length}\n`);
    
    // Group by sport
    const bySport = {};
    filteredGames.forEach(game => {
      const sport = extractSportFromGame(game);
      if (sport) {
        if (!bySport[sport]) {
          bySport[sport] = [];
        }
        bySport[sport].push(game);
      }
    });
    
    console.log('📊 Games by Sport:\n');
    console.log('='.repeat(80));
    
    Object.entries(bySport).forEach(([sport, games]) => {
      const config = SPORTS_CONFIG[sport];
      console.log(`\n${config.label} (${sport}) - ${games.length} games`);
      console.log(`  Series ID: ${config.seriesId}`);
      games.slice(0, 5).forEach((game, idx) => {
        console.log(`  ${idx + 1}. ${game.title}`);
        console.log(`     Slug: ${game.slug}`);
        console.log(`     Volume 24hr: ${game.volume24hr || 'N/A'}`);
      });
      if (games.length > 5) {
        console.log(`  ... and ${games.length - 5} more`);
      }
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📋 Sample Filtered Game (Full Structure):\n');
    if (filteredGames.length > 0) {
      const sample = filteredGames[0];
      const sport = extractSportFromGame(sample);
      console.log(JSON.stringify({
        ...sample,
        detectedSport: sport,
        seriesId: SPORTS_CONFIG[sport]?.seriesId,
      }, null, 2).substring(0, 2000));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testFilteredGames();

