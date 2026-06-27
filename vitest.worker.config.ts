import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './worker/wrangler.toml' },
    }),
  ],
  test: {
    include: ['tests/worker/**/*.test.ts'],
    passWithNoTests: true,
  },
})
