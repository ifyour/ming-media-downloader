import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'frontend',
    include: ['tests/frontend/**/*.test.ts', 'tests/frontend/**/*.test.tsx'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/frontend/setup.ts'],
  },
})
