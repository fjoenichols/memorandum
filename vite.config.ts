import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(process.env.VITE_BUILD_ID ?? new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      // A new service worker waits for the user to accept it (see UpdatePrompt);
      // the app never reloads on its own mid-edit.
      registerType: 'prompt',
      injectRegister: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
      },
      manifest: {
        name: 'Memorandum',
        short_name: 'Memorandum',
        description: 'Offline-first notes for the family',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1f2937',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
