import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.VITE_API_PROXY || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: { output: { manualChunks: { maplibre: ['maplibre-gl', 'pmtiles', '@maplibre/maplibre-gl-leaflet'], charts: ['recharts'] } } },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': API,
      '/socket.io': { target: API, ws: true },
    },
  },
});
