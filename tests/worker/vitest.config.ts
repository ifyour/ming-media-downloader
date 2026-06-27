import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'worker',
    include: ['tests/worker/**/*.test.ts'],
    exclude: ['tests/worker/**/*.fallback.test.ts'],
    pool: '@cloudflare/vitest-pool-workers',
    poolOptions: {
      workers: {
        wrangler: { configPath: './worker/wrangler.toml' },
      },
    },
  },
})
