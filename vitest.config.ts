import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/convergence/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    // The convergence harness waits up to 20s for devices to agree; the test
    // limit must be longer, or a slow CI runner times out before converge() does.
    testTimeout: 30_000,
  },
})
