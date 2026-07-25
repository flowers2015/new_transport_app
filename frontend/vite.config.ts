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
            /**
             * فقط vendorها را جدا کن.
             * اجبار کردن همه کامپوننت‌های Freight یا Transport به یک chunk،
             * code-splitting ناشی از React.lazy را از بین می‌برد
             * و باعث فایل‌های خیلی بزرگ و کندی ورود به پیگیری زنده می‌شود.
             */
            manualChunks: (id) => {
              if (!id.includes('node_modules')) return;

              if (id.includes('recharts')) return 'charts-vendor';
              if (id.includes('xlsx') || id.includes('exceljs')) return 'xlsx-vendor';
              if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf-vendor';

              // React + scheduler با هم بمانند تا خطای init ندهند
              if (
                id.includes('node_modules/react-dom') ||
                id.includes('node_modules\\react-dom') ||
                id.includes('node_modules/react/') ||
                id.includes('node_modules\\react\\') ||
                id.includes('node_modules/scheduler') ||
                id.includes('node_modules\\scheduler')
              ) {
                return 'react-vendor';
              }

              return 'vendor';
            },
          },
        },
        target: 'esnext',
        minify: 'terser',
        terserOptions: {
          compress: {
            drop_console: mode === 'production',
            drop_debugger: true,
          },
        },
        chunkSizeWarningLimit: 900,
        sourcemap: mode !== 'production',
      },
    };
});
