import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/services/**', 'src/utils/**', 'src/validators/**'],
      exclude: ['src/lib/**', 'src/index.ts'],
      thresholds: { lines: 80, functions: 80, branches: 75 },
    },
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
