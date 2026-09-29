import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './backend/wrangler.toml' },
    }),
  ],
  test: {
    include: ['backend/tests/**/*.test.ts'],
    passWithNoTests: true,
  },
})
