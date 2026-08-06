import { defineConfig, loadEnv } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer';
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'

// Read version from package.json for SW_VERSION injection
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Fail the build immediately if any required env var is missing
  const REQUIRED = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
  ];
  if (mode === 'production') {
    const missing = REQUIRED.filter((k) => !env[k]);
    if (missing.length > 0) {
      throw new Error(`[env-guard] Missing required env vars:\n  ${missing.join('\n  ')}`);
    }
  }

  return {
    plugins: [
      react(),
      visualizer({
        filename: './stats.html',
        open: true,
        gzipSize: true,
        brotliSize: true,
      }),
    ],
    define: {
      // Inject package version so sw.js can be stamped at build time
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    optimizeDeps: {
      include: ['lucide-react'],
      exclude: ['bcryptjs'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      strictPort: true,
      watch: {
        usePolling: true,
        interval: 1000,
      },
      hmr: {
        port: 3000,
        clientPort: 3000,
      },
    },
    preview: {
      port: 4173,
      host: '0.0.0.0',
      strictPort: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: 'hidden', // Use 'hidden' for production to keep source maps private
      chunkSizeWarningLimit: 800,
      minify: 'esbuild',
      target: 'es2020',
      reportCompressedSize: true,
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              return id.toString().split('node_modules/')[1].split('/')[0].toString();
            }
          },
        },
      },
    },
  };
});