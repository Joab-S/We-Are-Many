import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
  // Os testes de simulação rodam mundos de dezenas de anos: perto dos 5 s do padrão numa máquina livre,
  // e acima disso com a máquina carregada. O limite maior evita falha por tempo sem esconder travamento.
  test: { include: ['src/**/*.test.ts'], testTimeout: 30000 },
});
