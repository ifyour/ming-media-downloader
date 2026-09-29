import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['frontend/tests/**/*.test.ts', 'frontend/tests/**/*.test.tsx'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./frontend/tests/setup.ts'],
    passWithNoTests: true,
  },
})
