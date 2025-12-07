#!/bin/bash
# Deployment script for production VPS
# Run this on your Hostido server

set -e

echo "=== Production Deployment ==="

# Check if .env exists
if [ ! -f .env ]; then
    echo "ERROR: .env file not found!"
    echo "Create .env with:"
    echo "  POSTGRES_PASSWORD=your_secure_password"
    echo "  ADMIN_CODE=your_admin_code"
    echo "  API_URL=https://yourdomain.com"
    exit 1
fi

# Create SSL directory
mkdir -p nginx/ssl

# Pull latest code (if using git)
if [ -d .git ]; then
    echo "Pulling latest code..."
    git pull
fi

# Build and start services
echo "Building containers..."
docker compose -f docker-compose.prod.yml build

echo "Starting services..."
docker compose -f docker-compose.prod.yml up -d

echo "Waiting for services to start..."
sleep 10

# Check health
echo "Checking backend health..."
curl -s http://localhost/health || echo "Backend not ready yet"

echo ""
echo "=== Deployment complete! ==="
echo "Your app should be available at http://your-server-ip"
echo ""
echo "To set up SSL with Let's Encrypt, run:"
echo "  ./ssl-setup.sh yourdomain.com"
