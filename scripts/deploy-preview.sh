#!/bin/bash

# Script to deploy PWA to Firebase Hosting preview channel for iOS testing

set -e

echo "🚀 Deploying PWA to Firebase Hosting preview channel..."

# Step 1: Create build directory
echo "📦 Creating build directory..."
mkdir -p build/web

# Step 2: Copy PWA files
echo "📋 Copying PWA files..."
cp -r public/* build/web/
cp web/index.html build/web/

# Step 3: Verify files
echo "✅ Verifying files..."
if [ ! -f "build/web/manifest.json" ]; then
  echo "❌ Error: manifest.json not found"
  exit 1
fi

if [ ! -f "build/web/sw.js" ]; then
  echo "❌ Error: sw.js not found"
  exit 1
fi

if [ ! -f "build/web/index.html" ]; then
  echo "❌ Error: index.html not found"
  exit 1
fi

echo "✅ All required files present"

# Step 4: Deploy to preview channel
echo "🌐 Deploying to Firebase Hosting preview channel..."
CHANNEL_NAME="pwa-test-$(date +%s)"

# Deploy to preview channel (site is specified in firebase.json)
firebase hosting:channel:deploy "$CHANNEL_NAME"

echo ""
echo "✅ Deployment complete!"
echo "📱 Preview URL will be shown above"
echo "💡 Use this URL on your iPhone to test PWA installation"
echo ""
echo "🗑️  To delete this preview channel later, run:"
echo "   firebase hosting:channel:delete $CHANNEL_NAME"
