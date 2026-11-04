import { defineConfig } from '@playwright/test';

const PORT = 4179;

/**
 * `npm run test:jogo`: o jogo de verdade num Chromium sem placa de vídeo. Compila e serve o `dist`, o mesmo que vai
 * para o ar. Porta própria e sem reaproveitar servidor: um `npm run preview` aberto serviria uma versão velha.
 */
export default defineConfig({
  testDir: 'tests/jogo',
  outputDir: 'test-results',
  // O WebGL por software já usa todos os núcleos: duas janelas ao mesmo tempo só deixam os tempos de espera sem sentido.
  workers: 1,
  timeout: 180_000,
  // A espera vale para quadros lentos do swiftshader; uma condição que nunca acontece só demora mais para falhar.
  expect: { timeout: 60_000 },
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
