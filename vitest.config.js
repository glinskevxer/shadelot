import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov', 'json-summary'],
      include: ['src/**/*.js'],
      // The entry point is a two line script the smoke test drives. It cannot
      // be reached from vitest without spawning a process, and a spawned
      // process is not what the coverage number is for.
      exclude: ['bin/**', 'src/index.js'],
      thresholds: {
        lines: 98,
        statements: 98,
        functions: 97,
        branches: 92,
      },
    },
  },
});
