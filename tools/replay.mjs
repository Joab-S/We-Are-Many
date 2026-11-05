// npm run replay -- <caso.json> [--ate <ano>]: refaz sem tela o caso copiado da aba Tempo do painel F3 (src/sim/replay.calib.ts).
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const at = args.indexOf('--ate');
const until = at >= 0 ? args.splice(at, 2)[1] : undefined;
const [file] = args;
if (!file || (at >= 0 && !Number.isFinite(Number(until)))) {
  console.error('Uso: npm run replay -- <caso.json> [--ate <ano>]');
  process.exit(2);
}
const VITEST = join(ROOT, 'node_modules/vitest/vitest.mjs');
const env = { ...process.env, CASO: resolve(file), ...(until !== undefined ? { ATE: until } : {}) };
const child = spawn(process.execPath, [VITEST, 'run', '--config', 'vitest.calib.config.ts', 'src/sim/replay.calib.ts', '--disable-console-intercept', '--reporter=dot'], { cwd: ROOT, env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
