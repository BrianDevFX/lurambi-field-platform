import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa.svg'],
      manifest: {
        name: 'Lurambi Field Platform',
        short_name: 'Lurambi Field',
        description: 'Campaign field capture and coordination',
        theme_color: '#047857',
        background_color: '#f8fafc',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [{ src: '/pwa.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{css,html,js,svg,webmanifest}'],
        globIgnores: ['**/xlsx-*.js', '**/jspdf*.js', '**/html2canvas*.js'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
