# Sample Frontend - Polymarket Card Test

This is a simple HTML/CSS/JavaScript frontend to test the enhanced Polymarket transformer data structure.

## Features

- Displays market events as cards
- Shows grouped outcomes with probabilities, prices, and volumes
- Supports different categories (trending, politics, crypto, finance, sports)
- Displays statistics about group items vs regular markets
- Responsive design with dark theme

## Setup

1. Make sure your backend is running on `http://localhost:3000`

2. Open `index.html` in a web browser, or serve it with a local server:

```bash
# Using Python
python3 -m http.server 8000

# Using Node.js (if you have http-server installed)
npx http-server -p 8000

# Using PHP
php -S localhost:8000
```

3. Open `http://localhost:8000` in your browser

## Testing the Transformer

The frontend will:
- Fetch events from `/api/polymarket/events`
- Display `groupedOutcomes` array for each event
- Show probabilities, prices (in cents), and volumes
- Indicate which events have group items
- Show individual outcome volumes

## What to Look For

1. **Group Items**: Events with `hasGroupItems: true` should show multiple outcomes (like "Who will Trump talk to in November?")

2. **Regular Markets**: Events without group items should show outcomes from the best market

3. **Structured Data**: Each outcome should display:
   - Label (e.g., "Nicolás Maduro")
   - Probability (e.g., 15%)
   - Price in cents (e.g., "18.5¢")
   - Individual volume

4. **Statistics**: The stats bar shows:
   - Total events
   - Number of events with group items
   - Number of regular events

## Troubleshooting

- **CORS Error**: If you see CORS errors, make sure CORS is enabled in your backend for the frontend origin
- **No Data**: Check that the backend is running and the API endpoint is accessible
- **Empty Outcomes**: Some events might not have `groupedOutcomes` - check the console for the data structure

## API Endpoint

The frontend calls:
```
GET http://localhost:3000/api/polymarket/events?category=trending&limit=20
```

Response format:
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "...",
        "title": "...",
        "hasGroupItems": true,
        "groupedOutcomes": [
          {
            "label": "...",
            "probability": 15,
            "price": "18.5",
            "volume": 221599,
            "icon": "...",
            "clobTokenId": "..."
          }
        ],
        "totalVolume": 2014574
      }
    ],
    "pagination": {...}
  }
}
```

