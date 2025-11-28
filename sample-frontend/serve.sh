#!/bin/bash

# Simple script to serve the sample frontend
# Usage: ./serve.sh [port]

PORT=${1:-8000}

echo "Serving sample frontend on http://localhost:$PORT"
echo "Make sure your backend is running on http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Try different methods to serve
if command -v python3 &> /dev/null; then
    python3 -m http.server $PORT
elif command -v python &> /dev/null; then
    python -m http.server $PORT
elif command -v php &> /dev/null; then
    php -S localhost:$PORT
else
    echo "Error: No suitable server found. Please install Python or PHP, or use:"
    echo "  npx http-server -p $PORT"
    exit 1
fi

