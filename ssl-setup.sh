#!/bin/bash
# SSL setup script using Let's Encrypt
# Usage: ./ssl-setup.sh

DOMAIN="produkcja.invitta.pl"
EMAIL="${1:-admin@invitta.pl}"

echo "=== SSL Setup for $DOMAIN ==="

# Create certbot directories
mkdir -p nginx/ssl

# Get certificate
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN

if [ $? -eq 0 ]; then
    echo ""
    echo "=== SSL Certificate obtained! ==="
    echo ""
    echo "Now update nginx/nginx.conf:"
    echo "1. Uncomment the HTTPS server block"
    echo "2. In HTTP server, uncomment 'return 301' and comment out locations"
    echo "3. Restart: docker compose -f docker-compose.prod.yml restart nginx"
else
    echo "ERROR: Failed to obtain certificate"
    exit 1
fi
