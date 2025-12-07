#!/bin/bash
# Hostido deployment script
# Run this locally to prepare deployment package

echo "=== Building deployment package for Hostido ==="

# Build frontend
echo "Building frontend..."
cd frontend
bun install
VITE_API_URL=https://api.produkcja.invitta.pl bun run build
cd ..

# Create deployment directory
rm -rf hostido-deploy
mkdir -p hostido-deploy/backend
mkdir -p hostido-deploy/public_html

# Copy backend files
echo "Copying backend..."
cp -r backend/src hostido-deploy/backend/
cp -r backend/alembic hostido-deploy/backend/
cp backend/alembic.ini hostido-deploy/backend/
cp backend/passenger_wsgi.py hostido-deploy/backend/
cp backend/requirements.txt hostido-deploy/backend/
cp backend/.env.hostido hostido-deploy/backend/.env.example

# Copy frontend build
echo "Copying frontend build..."
cp -r frontend/dist/* hostido-deploy/public_html/

echo ""
echo "=== Deployment package ready! ==="
echo ""
echo "Upload contents:"
echo "  hostido-deploy/backend/* → /home/YOUR_USER/produkcja-api/"
echo "  hostido-deploy/public_html/* → /domains/produkcja.invitta.pl/public_html/"
echo ""
echo "Then on server:"
echo "  cd ~/produkcja-api"
echo "  pip install -r requirements.txt"
echo "  cp .env.example .env"
echo "  nano .env  # Configure DATABASE_URL and ADMIN_CODE"
echo "  python -m alembic upgrade head"
