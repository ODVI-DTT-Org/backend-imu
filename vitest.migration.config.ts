import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // No setupFiles — migration tests connect directly to the real DB
  },
})
