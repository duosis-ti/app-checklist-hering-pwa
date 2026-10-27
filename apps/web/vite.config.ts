import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icon.svg', 'apple-touch-icon.png'],
    manifest: { name: 'Checklist de Lojas', short_name: 'Checklist', description: 'Rotinas da loja, mesmo sem internet.', lang: 'pt-BR', theme_color: '#12362f', background_color: '#f6f7f3', display: 'standalone', start_url: '/', scope: '/', icons: [ {src:'/icon-192.png',sizes:'192x192',type:'image/png'}, {src:'/icon-512.png',sizes:'512x512',type:'image/png'}, {src:'/icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'} ] },
    workbox: { globPatterns: ['**/*.{js,css,html,png,svg,woff2}'], navigateFallbackDenylist: [/^\/api/, /^\/storage/], cleanupOutdatedCaches: true },
  })],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3001', '/storage': { target: 'http://localhost:8333', rewrite: path => path.replace(/^\/storage/, ''), changeOrigin: true } } },
  preview: { port: 4173, proxy: { '/api': 'http://localhost:3001', '/storage': { target: 'http://localhost:8333', rewrite: path => path.replace(/^\/storage/, ''), changeOrigin: true } } }
});
