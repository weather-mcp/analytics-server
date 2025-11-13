import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      // Ensure test environment uses .env.test if it exists
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        'dashboard/',
        'scripts/',
        '**/*.test.ts',
        '**/*.spec.ts',
        'vitest.config.ts',
        'test-db.ts',
        'test-db-simple.cjs',
        'src/types/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    testTimeout: 10000,
    setupFiles: ['./tests/setup.ts'],
  },
});
