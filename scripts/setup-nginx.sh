#!/bin/bash

# Nginx setup script for Clutch API
# This script sets up nginx reverse proxy configuration for dev.api.tryclutch.app

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NGINX_CONFIG_SOURCE="$PROJECT_ROOT/nginx/clutch.conf"
NGINX_SITES_AVAILABLE="/etc/nginx/sites-available/clutch"
NGINX_SITES_ENABLED="/etc/nginx/sites-enabled/clutch"

echo "Setting up nginx configuration for Clutch API..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root (use sudo)"
    exit 1
fi

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "Error: nginx is not installed. Please install nginx first:"
    echo "  sudo apt-get update && sudo apt-get install -y nginx"
    exit 1
fi

# Check if source config file exists
if [ ! -f "$NGINX_CONFIG_SOURCE" ]; then
    echo "Error: Nginx config file not found at $NGINX_CONFIG_SOURCE"
    exit 1
fi

# Copy configuration to sites-available
echo "Copying nginx configuration to $NGINX_SITES_AVAILABLE..."
cp "$NGINX_CONFIG_SOURCE" "$NGINX_SITES_AVAILABLE"

# Create symbolic link in sites-enabled
echo "Creating symbolic link: $NGINX_SITES_ENABLED -> $NGINX_SITES_AVAILABLE"
# Remove existing symlink if it exists
if [ -L "$NGINX_SITES_ENABLED" ]; then
    rm "$NGINX_SITES_ENABLED"
fi
ln -s "$NGINX_SITES_AVAILABLE" "$NGINX_SITES_ENABLED"

# Create certbot webroot directory if it doesn't exist
if [ ! -d "/var/www/certbot" ]; then
    echo "Creating /var/www/certbot directory for Let's Encrypt challenges..."
    mkdir -p /var/www/certbot
    chown -R www-data:www-data /var/www/certbot
fi

# Test nginx configuration
echo "Testing nginx configuration..."
if nginx -t; then
    echo "✓ Nginx configuration test passed"
else
    echo "✗ Nginx configuration test failed"
    exit 1
fi

# Reload nginx
echo "Reloading nginx..."
systemctl reload nginx || service nginx reload

echo ""
echo "✓ Nginx configuration has been set up successfully!"
echo ""
echo "Next steps:"
echo "1. Ensure your Clutch application is running on localhost:3000"
echo "2. Run certbot to obtain SSL certificate:"
echo "   sudo certbot --nginx -d dev.api.tryclutch.app"
echo ""
echo "Certbot will:"
echo "  - Obtain SSL certificate from Let's Encrypt"
echo "  - Automatically configure SSL in the nginx config"
echo "  - Set up HTTP to HTTPS redirect"
echo "  - Configure automatic certificate renewal"
echo ""
echo "After certbot setup, verify the configuration:"
echo "  sudo nginx -t"
echo "  sudo systemctl reload nginx"
echo "  curl -I https://dev.api.tryclutch.app"
echo ""
echo "3. Add WebSocket and SSE support (after certbot):"
echo "   sudo ./scripts/add-websocket-sse-config.sh"
echo ""
echo "   This will add WebSocket (/ws) and SSE (/events, /sse, /stream)"
echo "   location blocks to the HTTPS server block created by certbot."
echo ""
echo "Note: If you prefer to add the location blocks manually, see"
echo "nginx/clutch.conf for reference configuration (commented out)."

