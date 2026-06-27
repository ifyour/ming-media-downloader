import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/frontend/**/*.test.ts', 'tests/frontend/**/*.test.tsx'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/frontend/setup.ts'],
    passWithNoTests: true,
  },
})
