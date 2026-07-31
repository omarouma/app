import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  function envGuardPlugin(): Plugin {
    return {
      name: 'env-guard',
      buildStart() {
        const required = [
          'VITE_SUPABASE_URL',
          'VITE_SUPABASE_ANON_KEY',
          'VITE_FIREBASE_API_KEY',
          'VITE_FIREBASE_PROJECT_ID',
          'VITE_FIREBASE_APP_ID',
        ];
        const missing = required.filter((k) => !env[k]);
        if (missing.length) {
          throw new Error(
            `[env-guard] Missing required env vars: ${missing.join(', ')}\nCopy .env.example to .env and fill in the values.`
          );
        }
      },
    };
  }

  return {
    plugins: [react(), envGuardPlugin()],
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
      sourcemap: false,
      chunkSizeWarningLimit: 800,
      minify: 'esbuild',
      target: 'es2020',
      reportCompressedSize: false,
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
          manualChunks: (id) => {
            if (id.includes('node_modules/firebase/firestore') || id.includes('firebase/firestore')) return 'firebase-firestore';
            if (id.includes('node_modules/firebase/auth') || id.includes('firebase/auth')) return 'firebase-auth';
            if (id.includes('node_modules/firebase/storage') || id.includes('firebase/storage')) return 'firebase-storage';
            if (id.includes('node_modules/firebase') || id.includes('firebase/')) return 'firebase-app';
            if (id.includes('@supabase/supabase-js') || id.includes('node_modules/@supabase')) return 'supabase';
            if (id.includes('framer-motion')) return 'motion';
            if (id.includes('recharts') || id.includes('d3-')) return 'charts';
            if (id.includes('lucide-react')) return 'icons';
            if (id.includes('@radix-ui')) return 'ui-radix';
            if (id.includes('node_modules/react') || id.includes('react-dom') || id.includes('react-router')) return 'react-vendor';
            if (id.includes('zustand') || id.includes('sonner') || id.includes('clsx') || id.includes('tailwind-merge')) return 'utils';
          },
        },
      },
    },
  };
});
