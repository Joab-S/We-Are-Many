import { defineConfig } from 'vitest/config';
import { TUNE_FILES, whereIs, writeConstant } from './tools/tune/constants.mjs';

// Ajuste automático (tools/tune.mjs, docs/AJUSTE-AUTOMATICO.md): o mesmo mundo da calibração, com as constantes de
// TUNE (JSON nome → valor) trocadas no código de balance.ts e tuning.ts na hora de carregar o módulo. O motor não
// muda nem sabe do ajuste, e as cópias locais das constantes (feitas ao carregar cada parte) já pegam o valor novo.
const tune = JSON.parse(process.env.TUNE ?? '{}') as Record<string, number>;
const home = whereIs(Object.keys(tune));

export default defineConfig({
  plugins: [
    {
      name: 'ajuste-de-constantes',
      enforce: 'pre',
      // O vitest guarda em disco os módulos já transformados (fsModuleCache), com uma chave que não vê o TUNE: sem
      // isso, a avaliação seguinte leria o balance.ts com os valores da anterior. Só os dois arquivos ficam fora.
      configureVitest(ctx) {
        ctx.defineCacheKeyGenerator(({ id }) => (TUNE_FILES.some((f) => id.split('?')[0].replace(/\\/g, '/').endsWith(`/${f}`)) ? false : undefined));
      },
      transform(code, id) {
        const file = id.split('?')[0].replace(/\\/g, '/');
        const names = Object.keys(tune).filter((n) => file.endsWith(`/${home[n]}`));
        if (!names.length) return null;
        let out = code;
        for (const n of names) out = writeConstant(out, n, tune[n]);
        return { code: out, map: null };
      },
    },
  ],
  test: { include: ['src/sim/tune.calib.ts'], testTimeout: 3600000, pool: 'forks' },
});
