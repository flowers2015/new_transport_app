import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 5173,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks: (id) => {
              // Vendor chunks - separate large libraries
              if (id.includes('node_modules')) {
                // React and React DOM MUST stay together to avoid initialization errors
                // Keep them in the main vendor chunk, not separate
                // Recharts for charts
                if (id.includes('recharts')) {
                  return 'charts-vendor';
                }
                // XLSX for Excel operations
                if (id.includes('xlsx')) {
                  return 'xlsx-vendor';
                }
                // PDF generation libraries
                if (id.includes('jspdf') || id.includes('html2canvas')) {
                  return 'pdf-vendor';
                }
                // All other node_modules (including React and React-DOM)
                return 'vendor';
              }
              
              // Component chunks by feature/route
              if (id.includes('components/Transport')) {
                return 'transport';
              }
              if (id.includes('components/Freight')) {
                return 'freight';
              }
              if (id.includes('components/Finance')) {
                return 'finance';
              }
              if (id.includes('components/Dashboard')) {
                return 'dashboard';
              }
              if (id.includes('components/Admin')) {
                return 'admin';
              }
              if (id.includes('components/Vehicle')) {
                return 'vehicle';
              }
              if (id.includes('components/Repair')) {
                return 'repair';
              }
              
              // Utils chunk
              if (id.includes('utils/')) {
                return 'utils';
              }
              
              // Types chunk
              if (id.includes('types.ts')) {
                return 'types';
              }
            },
          },
        },
        // Optimize build output
        target: 'esnext',
        minify: 'terser',
        terserOptions: {
          compress: {
            drop_console: mode === 'production', // Remove console.log in production
            drop_debugger: true,
          },
        },
        // Chunk size warning limit (moved to build level in Vite 6)
        chunkSizeWarningLimit: 1000, // 1MB warning threshold
        // Enable source maps for debugging (optional, can disable in production)
        sourcemap: mode !== 'production',
      },
    };
});
