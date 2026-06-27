import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'tests/worker/vitest.config.ts',
      'tests/frontend/vitest.config.ts',
    ],
  },
})
