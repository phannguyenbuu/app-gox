import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['app.goxprint.com', 'localhost'],
    proxy: {
      '/api': {
        target: 'https://agentapi.quanlymay.com',
        changeOrigin: true,
        secure: false,
      },
      '/ui': {
        target: 'https://agentapi.quanlymay.com',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
});
