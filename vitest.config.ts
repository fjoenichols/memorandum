import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/convergence/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
  },
})
