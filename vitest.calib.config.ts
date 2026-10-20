import { defineConfig } from 'vitest/config';

// Calibração Monte Carlo (npm run calibrar): fora dos testes normais porque demora.
export default defineConfig({
  test: { include: ['src/**/*.calib.ts'], testTimeout: 3600000, pool: 'forks' },
});
