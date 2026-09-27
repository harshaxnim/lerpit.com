import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@lerpit': fileURLToPath(new URL('./lerpettes', import.meta.url))
    }
  },
  test: {
    include: ['lerpettes/**/tests/**/*.test.ts', 'website/**/tests/**/*.test.ts'],
    environment: 'node'
  }
});
