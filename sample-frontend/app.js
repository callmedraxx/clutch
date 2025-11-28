// API Configuration
const API_BASE_URL = 'http://localhost:3000/api/polymarket';

// State
let currentCategory = 'trending';
let currentMode = 'browse'; // 'browse' or 'search'
let searchState = {
    query: '',
    type: 'events',
    events_status: 'active',
    sort: 'volume_24hr',
    ascending: false,
    recurrence: '',
    tag_slug: '',
    page: 1,
    limit_per_type: 20
};
let searchTimeout = null;

// DOM Elements
const categorySelect = document.getElementById('categorySelect');
const refreshBtn = document.getElementById('refreshBtn');
const loading = document.getElementById('loading');
const cardsGrid = document.getElementById('cardsGrid');
const errorDiv = document.getElementById('error');
const statsDiv = document.getElementById('stats');
const eventCountEl = document.getElementById('eventCount');
const groupItemCountEl = document.getElementById('groupItemCount');
const regularCountEl = document.getElementById('regularCount');

// Mode toggle elements
const browseModeBtn = document.getElementById('browseModeBtn');
const searchModeBtn = document.getElementById('searchModeBtn');
const browseControls = document.getElementById('browseControls');
const searchControls = document.getElementById('searchControls');
const filtersSection = document.getElementById('filtersSection');

// Search elements
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const searchType = document.getElementById('searchType');
const eventsStatus = document.getElementById('eventsStatus');
const sortBy = document.getElementById('sortBy');
const sortDirection = document.getElementById('sortDirection');
const recurrenceFilter = document.getElementById('recurrenceFilter');
const tagFilter = document.getElementById('tagFilter');

// Pagination elements
const pagination = document.getElementById('pagination');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const currentPageEl = document.getElementById('currentPage');
const totalPagesEl = document.getElementById('totalPages');
const totalResultsEl = document.getElementById('totalResults');

// Event Listeners
categorySelect.addEventListener('change', (e) => {
    currentCategory = e.target.value;
    loadEvents();
});

refreshBtn.addEventListener('click', () => {
    loadEvents();
});

// Mode toggle listeners
browseModeBtn.addEventListener('click', () => {
    toggleMode('browse');
});

searchModeBtn.addEventListener('click', () => {
    toggleMode('search');
});

// Search listeners
searchInput.addEventListener('input', (e) => {
    searchState.query = e.target.value.trim();
    debounceSearch();
});

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        performSearch();
    }
});

searchBtn.addEventListener('click', () => {
    performSearch();
});

// Filter listeners - work in both browse and search modes
searchType.addEventListener('change', (e) => {
    searchState.type = e.target.value;
    if (currentMode === 'search') {
        performSearch();
    }
});

eventsStatus.addEventListener('change', (e) => {
    searchState.events_status = e.target.value;
    if (currentMode === 'browse') {
        loadEvents();
    } else {
        performSearch();
    }
});

sortBy.addEventListener('change', (e) => {
    searchState.sort = e.target.value;
    if (currentMode === 'browse') {
        loadEvents();
    } else {
        performSearch();
    }
});

sortDirection.addEventListener('change', (e) => {
    searchState.ascending = e.target.value === 'true';
    if (currentMode === 'browse') {
        loadEvents();
    } else {
        performSearch();
    }
});

recurrenceFilter.addEventListener('change', (e) => {
    searchState.recurrence = e.target.value;
    if (currentMode === 'browse') {
        loadEvents();
    } else {
        performSearch();
    }
});

tagFilter.addEventListener('change', (e) => {
    searchState.tag_slug = e.target.value;
    if (currentMode === 'browse') {
        loadEvents();
    } else {
        performSearch();
    }
});

// Pagination listeners
prevPageBtn.addEventListener('click', () => {
    if (searchState.page > 1) {
        searchState.page--;
        performSearch();
    }
});

nextPageBtn.addEventListener('click', () => {
    searchState.page++;
    performSearch();
});

// Format number with commas
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

// Format currency
function formatCurrency(amount) {
    const num = parseFloat(amount);
    if (num >= 1000000) {
        return '$' + (num / 1000000).toFixed(2) + 'M';
    }
    if (num >= 1000) {
        return '$' + (num / 1000).toFixed(1) + 'K';
    }
    return '$' + num.toFixed(0);
}

// Create outcome item HTML
function createOutcomeItem(outcome, isResolved = false, isBinarySingleMarket = false) {
    const isWinner = outcome.isWinner === true;
    const outcomeClass = isResolved 
        ? (isWinner ? 'outcome-item outcome-winner' : 'outcome-item outcome-loser')
        : 'outcome-item';
    
    // For resolved binary single markets, show only Yes/No (no percentages)
    // For resolved grouped markets, show Yes/No with percentages
    // For active markets, show probability
    let resultDisplay = '';
    let probabilityDisplay = '';
    
    if (isResolved) {
        // Resolved: Show Yes/No indicator
        if (isWinner) {
            resultDisplay = '<span class="result-indicator result-yes">Yes</span>';
            // Only show percentage for grouped markets, not binary single markets
            if (!isBinarySingleMarket) {
                probabilityDisplay = '<div class="outcome-probability outcome-winner-prob">100%</div>';
            }
        } else {
            resultDisplay = '<span class="result-indicator result-no">No</span>';
            // Only show percentage for grouped markets, not binary single markets
            if (!isBinarySingleMarket) {
                probabilityDisplay = '<div class="outcome-probability outcome-loser-prob">0%</div>';
            }
        }
    } else {
        // Active: Show probability
        probabilityDisplay = `<div class="outcome-probability">${outcome.probability}%</div>`;
    }
    
    return `
        <div class="${outcomeClass}">
            <div class="outcome-info">
                ${outcome.icon ? `<img src="${outcome.icon}" alt="${outcome.label}" class="outcome-icon" onerror="this.style.display='none'">` : ''}
                <div class="outcome-label">
                    <div class="outcome-name">${escapeHtml(outcome.label)}</div>
                    <div class="outcome-short">${outcome.shortLabel}</div>
                </div>
            </div>
            <div class="outcome-stats">
                ${resultDisplay}
                ${probabilityDisplay}
                ${!isResolved ? `<div class="outcome-price">${outcome.price}¢</div>` : ''}
                ${outcome.volume > 0 ? `<div class="outcome-volume">${formatCurrency(outcome.volume)} Vol</div>` : ''}
            </div>
        </div>
    `;
}

// Format resolution date
function formatResolutionDate(closedTime) {
    if (!closedTime) return '';
    
    try {
        const date = new Date(closedTime);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `Ended ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    } catch {
        return `Ended ${closedTime}`;
    }
}

// Create market card HTML
function createMarketCard(event) {
    const hasGroupItems = event.hasGroupItems || false;
    const outcomes = event.groupedOutcomes || [];
    const imageUrl = event.image || event.icon || null;
    const volume = formatCurrency(event.totalVolume || 0);
    const isResolved = event.isResolved === true || event.closed === true;
    const closedTime = event.closedTime;

    // Check if this is a binary single market (not grouped, 1-2 outcomes with Yes/No)
    const isBinarySingleMarket = !hasGroupItems && isResolved && 
        outcomes.length <= 2 &&
        outcomes.some(o => o.label.toLowerCase() === 'yes' || o.label.toLowerCase() === 'no');

    let outcomesHtml = '';
    if (outcomes.length > 0) {
        outcomesHtml = outcomes.map(outcome => 
            createOutcomeItem(outcome, isResolved, isBinarySingleMarket)
        ).join('');
    } else {
        outcomesHtml = '<div class="no-outcomes">No outcomes available</div>';
    }

    // Don't show RESOLVED badge - Polymarket doesn't show it prominently
    // Just use the resolved styling and Yes/No indicators
    const resolutionDate = isResolved && closedTime ? `<div class="resolution-date">${formatResolutionDate(closedTime)}</div>` : '';

    return `
        <div class="market-card ${isResolved ? 'market-card-resolved' : ''}" data-event-id="${event.id}">
            <div class="card-header">
                ${imageUrl ? `<img src="${imageUrl}" alt="${event.title}" class="card-image" onerror="this.style.display='none'">` : ''}
                <div class="card-title">
                    ${escapeHtml(event.title || 'Unknown Event')}
                    ${hasGroupItems ? '<span class="card-badge">Group</span>' : ''}
                </div>
            </div>
            <div class="card-volume">${volume} Vol</div>
            ${resolutionDate}
            <div class="outcomes-list">
                ${outcomesHtml}
            </div>
        </div>
    `;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show error message
function showError(message) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

// Toggle between browse and search modes
function toggleMode(mode) {
    currentMode = mode;
    
    if (mode === 'browse') {
        browseModeBtn.classList.add('active');
        searchModeBtn.classList.remove('active');
        browseControls.style.display = 'flex';
        searchControls.style.display = 'none';
        filtersSection.style.display = 'block'; // Show filters in browse mode
        pagination.style.display = 'none';
        cardsGrid.innerHTML = '';
        loadEvents();
    } else {
        browseModeBtn.classList.remove('active');
        searchModeBtn.classList.add('active');
        browseControls.style.display = 'none';
        searchControls.style.display = 'flex';
        filtersSection.style.display = 'block';
        searchState.page = 1; // Reset to first page when switching to search
        // Don't auto-search, wait for user input or filter selection
        if (searchState.query || searchState.tag_slug || searchState.recurrence) {
            performSearch();
        } else {
            cardsGrid.innerHTML = '<div class="no-outcomes" style="grid-column: 1/-1;">Enter a search query or select a filter</div>';
            pagination.style.display = 'none';
            statsDiv.style.display = 'none';
        }
    }
}

// Build events query parameters with filters
function buildEventsParams() {
    const params = new URLSearchParams();
    params.append('category', currentCategory);
    params.append('limit', '20');
    
    // Add filters if set
    if (searchState.events_status) {
        params.append('events_status', searchState.events_status);
    }
    if (searchState.sort) {
        params.append('sort', searchState.sort);
    }
    if (searchState.ascending !== undefined) {
        params.append('ascending', searchState.ascending);
    }
    if (searchState.recurrence) {
        params.append('recurrence', searchState.recurrence);
    }
    if (searchState.tag_slug) {
        params.append('tag_slug', searchState.tag_slug);
    }
    
    return params.toString();
}

// Build search query parameters
function buildSearchParams() {
    const params = new URLSearchParams();
    
    if (searchState.query) {
        params.append('q', searchState.query);
    }
    
    params.append('type', searchState.type);
    params.append('events_status', searchState.events_status);
    params.append('sort', searchState.sort);
    params.append('ascending', searchState.ascending);
    params.append('page', searchState.page);
    params.append('limit_per_type', searchState.limit_per_type);
    
    if (searchState.recurrence) {
        params.append('recurrence', searchState.recurrence);
    }
    
    if (searchState.tag_slug) {
        params.append('tag_slug', searchState.tag_slug);
    }
    
    // At least one of q, tag_slug, or recurrence must be provided
    if (!searchState.query && !searchState.tag_slug && !searchState.recurrence) {
        return null; // Invalid search
    }
    
    return params.toString();
}

// Debounce search input
function debounceSearch() {
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    searchTimeout = setTimeout(() => {
        performSearch();
    }, 500); // 500ms delay
}

// Perform search
async function performSearch() {
    if (currentMode !== 'search') {
        return;
    }
    
    const params = buildSearchParams();
    if (!params) {
        // No valid search parameters, clear results
        cardsGrid.innerHTML = '<div class="no-outcomes" style="grid-column: 1/-1;">Enter a search query or select a filter</div>';
        pagination.style.display = 'none';
        statsDiv.style.display = 'none';
        return;
    }
    
    loadSearchResults();
}

// Load search results from API
async function loadSearchResults() {
    try {
        loading.style.display = 'block';
        searchBtn.disabled = true;
        errorDiv.style.display = 'none';
        cardsGrid.innerHTML = '';

        const params = buildSearchParams();
        if (!params) {
            return;
        }

        const url = `${API_BASE_URL}/search?${params}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error?.message || 'Failed to search events');
        }

        const events = data.data?.events || [];
        const paginationData = data.data?.pagination || { hasMore: false, totalResults: 0 };
        
        // Update stats
        const groupItemCount = events.filter(e => e.hasGroupItems).length;
        const regularCount = events.length - groupItemCount;
        
        eventCountEl.textContent = events.length;
        groupItemCountEl.textContent = groupItemCount;
        regularCountEl.textContent = regularCount;
        statsDiv.style.display = 'flex';

        // Update pagination
        const totalPages = Math.ceil(paginationData.totalResults / searchState.limit_per_type) || 1;
        currentPageEl.textContent = searchState.page;
        totalPagesEl.textContent = totalPages;
        totalResultsEl.textContent = paginationData.totalResults || 0;
        
        prevPageBtn.disabled = searchState.page <= 1;
        nextPageBtn.disabled = !paginationData.hasMore || searchState.page >= totalPages;
        
        if (paginationData.totalResults > 0) {
            pagination.style.display = 'flex';
        } else {
            pagination.style.display = 'none';
        }

        // Render cards
        if (events.length === 0) {
            const message = data.message || 'No events found';
            cardsGrid.innerHTML = `<div class="no-outcomes" style="grid-column: 1/-1;">${escapeHtml(message)}</div>`;
        } else {
            events.forEach(event => {
                const cardHtml = createMarketCard(event);
                cardsGrid.insertAdjacentHTML('beforeend', cardHtml);
            });
        }

        console.log('Search results loaded:', events);
        console.log('Pagination:', paginationData);

    } catch (error) {
        console.error('Error loading search results:', error);
        showError(`Error: ${error.message}`);
        cardsGrid.innerHTML = '<div class="no-outcomes" style="grid-column: 1/-1;">Failed to load search results. Make sure the backend is running on http://localhost:3000</div>';
        pagination.style.display = 'none';
    } finally {
        loading.style.display = 'none';
        searchBtn.disabled = false;
    }
}

// Load events from API
async function loadEvents() {
    try {
        loading.style.display = 'block';
        refreshBtn.disabled = true;
        errorDiv.style.display = 'none';
        cardsGrid.innerHTML = '';
        pagination.style.display = 'none';

        const params = buildEventsParams();
        const url = `${API_BASE_URL}/events?${params}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error?.message || 'Failed to fetch events');
        }

        const events = data.data?.events || [];
        
        // Update stats
        const groupItemCount = events.filter(e => e.hasGroupItems).length;
        const regularCount = events.length - groupItemCount;
        
        eventCountEl.textContent = events.length;
        groupItemCountEl.textContent = groupItemCount;
        regularCountEl.textContent = regularCount;
        statsDiv.style.display = 'flex';

        // Render cards
        if (events.length === 0) {
            cardsGrid.innerHTML = '<div class="no-outcomes" style="grid-column: 1/-1;">No events found</div>';
        } else {
            events.forEach(event => {
                const cardHtml = createMarketCard(event);
                cardsGrid.insertAdjacentHTML('beforeend', cardHtml);
            });
        }

        console.log('Events loaded:', events);
        console.log('Sample event with groupedOutcomes:', events.find(e => e.groupedOutcomes?.length > 0));

    } catch (error) {
        console.error('Error loading events:', error);
        showError(`Error: ${error.message}`);
        cardsGrid.innerHTML = '<div class="no-outcomes" style="grid-column: 1/-1;">Failed to load events. Make sure the backend is running on http://localhost:3000</div>';
    } finally {
        loading.style.display = 'none';
        refreshBtn.disabled = false;
    }
}

// Initialize
loadEvents();

