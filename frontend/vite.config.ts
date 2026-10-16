import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    host: process.env.VITE_HOST ?? 'localhost',
    proxy: {
      '/api': { target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:4000' },
      '/health': { target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:4000' },
    },
  },
});
