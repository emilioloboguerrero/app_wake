import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    exclude: ['**/node_modules/**', '**/*.native.test.{js,jsx}'],
  },
});
