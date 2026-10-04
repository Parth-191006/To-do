import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration.
 *
 * The suites under `tests/` exercise the *shipping* modules — the parser, the
 * focus clock, the habit maths, the geofence gate, the SQLite schema and the
 * per-field sync merge — so a regression fails here before it reaches a phone.
 * This replaces the hand-rolled `scripts/verify-*.ts` runners, which were the
 * same assertions with a home-made harness and no watch mode.
 *
 * `@/…` resolves to `src/`, mirroring `tsconfig.json`, so tests import modules
 * exactly the way the app does.
 *
 * The `.mts` extension keeps Vite's native config loader happy — this package is
 * CommonJS, and a plain `.ts` config is loaded as CJS.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
