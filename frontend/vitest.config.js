import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit tests cover the PURE frontend modules (EventNormalizer, LiveEventFilter) and the store's
// ingest logic. Scope to src/ so Vitest never picks up the Playwright specs under e2e/.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  test: {
    include: [ 'src/**/*.{test,spec}.js' ],
    exclude: [ 'node_modules/**', 'e2e/**' ],
    environment: 'node'
  }
})
