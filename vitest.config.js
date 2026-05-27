import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.js'],
    coverage: {
      include: ['src/domain/**/*.js'],
      reporter: ['text', 'html'],
    },
  },
});
