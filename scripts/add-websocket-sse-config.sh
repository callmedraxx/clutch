#!/bin/bash

# Script to add WebSocket and SSE location blocks to nginx config after certbot setup
# This should be run after certbot has configured SSL

set -e

NGINX_CONFIG="/etc/nginx/sites-available/clutch"

if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root (use sudo)"
    exit 1
fi

if [ ! -f "$NGINX_CONFIG" ]; then
    echo "Error: Nginx config file not found at $NGINX_CONFIG"
    exit 1
fi

# Check if WebSocket location block already exists
if grep -q "location /ws" "$NGINX_CONFIG"; then
    echo "WebSocket and SSE location blocks already exist in the config."
    echo "Skipping addition."
    exit 0
fi

# Find the HTTPS server block and add location blocks before the final closing brace
# We'll add them before the last location / block or before the closing brace

echo "Adding WebSocket and SSE location blocks to nginx configuration..."

# Create a backup
cp "$NGINX_CONFIG" "$NGINX_CONFIG.backup.$(date +%Y%m%d_%H%M%S)"

# Use a temporary file for the modified config
TMP_FILE=$(mktemp)

# Read the config and insert the location blocks
# We'll insert them before the last "location /" block in the HTTPS server block
awk '
    /^[[:space:]]*location \/ \{/ && in_https && !location_added {
        # Insert WebSocket and SSE blocks before the main location / block
        print "    # WebSocket support for /ws endpoint"
        print "    location /ws {"
        print "        proxy_pass http://localhost:3000;"
        print "        proxy_http_version 1.1;"
        print "        proxy_set_header Upgrade $http_upgrade;"
        print "        proxy_set_header Connection \"upgrade\";"
        print "        proxy_set_header Host $host;"
        print "        proxy_set_header X-Real-IP $remote_addr;"
        print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
        print "        proxy_set_header X-Forwarded-Proto $scheme;"
        print "        proxy_read_timeout 3600s;"
        print "        proxy_send_timeout 3600s;"
        print "        proxy_connect_timeout 60s;"
        print "    }"
        print ""
        print "    # SSE (Server-Sent Events) support"
        print "    location ~ ^/(events|sse|stream) {"
        print "        proxy_pass http://localhost:3000;"
        print "        proxy_http_version 1.1;"
        print "        proxy_buffering off;"
        print "        proxy_cache off;"
        print "        proxy_set_header Host $host;"
        print "        proxy_set_header X-Real-IP $remote_addr;"
        print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
        print "        proxy_set_header X-Forwarded-Proto $scheme;"
        print "        proxy_read_timeout 3600s;"
        print "        proxy_send_timeout 3600s;"
        print "        proxy_set_header Connection \"\";"
        print "        chunked_transfer_encoding off;"
        print "    }"
        print ""
        location_added = 1
    }
    {
        print
    }
    /^[[:space:]]*server \{/ && /443/ {
        in_https = 1
    }
    /^[[:space:]]*\}/ && in_https {
        in_https = 0
    }
' "$NGINX_CONFIG" > "$TMP_FILE"

mv "$TMP_FILE" "$NGINX_CONFIG"

echo "✓ WebSocket and SSE location blocks added to nginx configuration"
echo ""
echo "Testing nginx configuration..."
if nginx -t; then
    echo "✓ Nginx configuration test passed"
    echo ""
    echo "Reloading nginx..."
    systemctl reload nginx || service nginx reload
    echo "✓ Nginx reloaded successfully"
else
    echo "✗ Nginx configuration test failed"
    echo "Restoring backup..."
    mv "$NGINX_CONFIG.backup."* "$NGINX_CONFIG" 2>/dev/null || true
    exit 1
fi

