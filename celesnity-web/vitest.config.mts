import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: '@/src', replacement: `${root}/src` },
      { find: '@/di', replacement: `${root}/di` },
      { find: '@/app', replacement: `${root}/app` },
      { find: '@', replacement: root },
    ],
  },
  test: {
    coverage: { provider: 'v8', reporter: ['text', 'json-summary'] },
    environment: 'node',
    include: ['tests/unit/**/*.test.ts?(x)'],
    restoreMocks: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
