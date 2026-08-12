import { defineConfig, loadEnv, type Plugin } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer';
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

// Read version from package.json for SW_VERSION injection
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

/**
 * Post-processes the Service Worker after Vite copies it from public/ to dist/.
 *
 * Files in public/ are copied verbatim (no esbuild/rollup transforms), so
 * the `__APP_VERSION__` global declared in `define` never reaches sw.js.
 * This plugin runs after the build completes, reads dist/sw.js from disk,
 * and replaces the sentinel with the real package.json version string.
 */
function injectSwVersion(version: string): Plugin {
  return {
    name: 'inject-sw-version',
    apply: 'build',
    async closeBundle() {
      const swPath = path.resolve(process.cwd(), 'dist', 'sw.js');
      if (!existsSync(swPath)) return;
      try {
        const src = readFileSync(swPath, 'utf8');
        const quoted = JSON.stringify(version);
        const replaced = src.replace(/__APP_VERSION__/g, quoted);
        if (replaced !== src) {
          writeFileSync(swPath, replaced, 'utf8');
           
          console.log(`  ✓ inject-sw-version (vite): stamped dist/sw.js with v${version}`);
        }
      } catch (e) {
         
        console.warn(`  ! inject-sw-version (vite): failed: ${e}`);
      }
    },
  };
}

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
        open: false, // Must be false in CI — `open: true` can hang or fail automated builds
        gzipSize: true,
        brotliSize: true,
      }),
      injectSwVersion(pkg.version),
    ],
    // Production: strip all console.* calls + debugger statements (info leak prevention)
    // Development: keep console for debugging.
    esbuild: mode === 'production'
      ? { drop: ['console', 'debugger'] }
      : {},
    define: {
      // Inject package version for bundled modules (sw.js handled via injectSwVersion)
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
            if (!id.includes('node_modules')) return undefined;
            // Group large vendors into named chunks to avoid one giant bundle
            if (id.includes('firebase')) return 'vendor-firebase';
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('framer-motion')) return 'vendor-framer';
            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
            if (id.includes('agora-rtc-sdk-ng')) return 'vendor-agora';
            if (id.includes('@radix-ui')) return 'vendor-radix';
            if (id.includes('react-router') || id.includes('react-router-dom')) return 'vendor-router';
            // NOTE: react/react-dom/scheduler intentionally fall through to
            // the shared 'vendor' chunk. Splitting react into its own chunk
            // creates a circular chunk dependency (react-day-picker etc. pull
            // date-fns from 'vendor' while sonner in 'vendor' pulls react),
            // which crashes at startup with "Cannot access before
            // initialization" (TDZ) errors.
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('zustand')) return 'vendor-zustand';
            if (id.includes('i18next') || id.includes('react-i18next')) return 'vendor-i18n';
            if (id.includes('zod')) return 'vendor-zod';
            // Everything else in a shared vendor chunk
            return 'vendor';
          },
        },
      },
    },
  };
});