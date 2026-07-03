const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');
const swPath = path.join(distDir, 'sw.js');

if (!fs.existsSync(swPath)) {
  console.warn('⚠️  sw.js not found in dist/. Skipping post-build step.');
  process.exit(0);
}

let swContent = fs.readFileSync(swPath, 'utf-8');

// Replace __BUILD_TIMESTAMP__ with the actual build timestamp
const buildTimestamp = new Date().toISOString();
swContent = swContent.replace(/__BUILD_TIMESTAMP__/g, buildTimestamp);

// Inject Firebase config into service worker from environment variables
const envVars = {
  __FIREBASE_API_KEY__: process.env.VITE_FIREBASE_API_KEY || '',
  __FIREBASE_AUTH_DOMAIN__: process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  __FIREBASE_PROJECT_ID__: process.env.VITE_FIREBASE_PROJECT_ID || '',
  __FIREBASE_STORAGE_BUCKET__: process.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  __FIREBASE_MESSAGING_SENDER_ID__: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  __FIREBASE_APP_ID__: process.env.VITE_FIREBASE_APP_ID || '',
  __FIREBASE_MEASUREMENT_ID__: process.env.VITE_FIREBASE_MEASUREMENT_ID || '',
};

Object.entries(envVars).forEach(([placeholder, value]) => {
  swContent = swContent.replace(new RegExp(placeholder, 'g'), value);
});

fs.writeFileSync(swPath, swContent, 'utf-8');
console.log(`✅  Injected build timestamp into sw.js (${buildTimestamp})`);
console.log('✅  Injected Firebase config into sw.js');
