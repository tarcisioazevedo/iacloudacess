import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return;
          }

          if (id.includes('lucide-react')) {
            return 'icons';
          }

          if (id.includes('jspdf') || id.includes('jspdf-autotable')) {
            return 'pdf-reporting';
          }

          if (id.includes('socket.io-client') || id.includes('engine.io-client') || id.includes('socket.io-parser')) {
            return 'realtime';
          }

          if (id.includes('html2canvas')) {
            return 'capture';
          }

          if (id.includes('react') || id.includes('scheduler')) {
            return 'react-core';
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
      },
    },
  },
});
