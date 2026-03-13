import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/firestore.rules.test.js'],
    testTimeout: 20000,
  },
});
