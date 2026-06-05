import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { quasar, transformAssetUrls } from '@quasar/vite-plugin'

// cbqManager SPA build. In dev, /api is proxied to the running ColdBox server so the
// frontend and backend can run side by side. In prod, the built assets are served behind
// the same host (or any static host pointed at the JWT REST API).
export default defineConfig({
  plugins: [
    vue({ template: { transformAssetUrls } }),
    // Precompiled Quasar CSS is imported in main.js, so no SASS variables wiring needed.
    quasar()
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  // Relative base so the bundle works when served from /spa/ on the ColdBox host.
  base: './',
  build: {
    outDir: '../public/spa',
    emptyOutDir: true
  },
  server: {
    port: 9000,
    // Dev mode: proxy API calls to the running ColdBox server.
    proxy: {
      '/api': { target: 'http://127.0.0.1:60472', changeOrigin: true }
    }
  }
})
