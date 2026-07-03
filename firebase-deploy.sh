#!/bin/bash
# GaGa Chat - Firebase Hosting Deployment Script
# Run this script to deploy to Firebase Hosting

set -e

echo "========================================="
echo "  GaGa Chat - Firebase Deploy Script"
echo "========================================="

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "Firebase CLI not found. Installing..."
    npm install -g firebase-tools
fi

# Ensure we're in the project directory
cd "$(dirname "$0")"

# Build the project
echo "Building GaGa Chat..."
npm run build

# Deploy to Firebase Hosting
echo "Deploying to Firebase Hosting..."
firebase deploy --only hosting

echo "========================================="
echo "  Deployment Complete!"
echo "========================================="
echo ""
echo "Visit your app at:"
echo "  - https://oumagachat.web.app"
echo "  - https://oumagachat.firebaseapp.com"
