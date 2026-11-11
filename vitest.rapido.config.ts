import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import base from './vite.config.ts';

/**
 * `npm run test:rapido`: tudo menos os testes que rodam um mundo inteiro por anos, para conferir uma mudança enquanto
 * se trabalha. `npm test` continua sendo a suíte inteira. Um teste novo de mundo simulado que não entre nesta lista só
 * deixa este comando mais lento; nada deixa de rodar no `npm test`.
 */
const SIMULATED_WORLDS = [
  'src/sim/lifeTrial.test.ts',
  'src/client/surface/replay.test.ts',
  'src/client/surface/catchUp.test.ts',
  'src/client/space/BackgroundWorlds.test.ts',
  'src/client/surface/hud/legends.test.ts',
  'src/sim/sociedade/sociedade.test.ts',
  'src/save/save.test.ts',
  'src/sim/api/commands.test.ts',
  'src/sim/api/debug.test.ts',
  'src/sim/api/engine.test.ts',
  'src/sim/api/events.test.ts',
  'src/sim/api/frame.test.ts',
  'src/sim/api/pick.test.ts',
  'src/sim/api/runSnapshot.test.ts',
  'src/sim/caravanLeader.test.ts',
  'src/sim/determinism.test.ts',
  'src/sim/economy.test.ts',
  'src/sim/ecosystem.test.ts',
  'src/sim/engine.test.ts',
  'src/sim/events.test.ts',
  'src/sim/mundo42.test.ts',
  'src/sim/mundo7.test.ts',
  'src/sim/needs.test.ts',
  'src/sim/people.test.ts',
  'src/sim/presence.test.ts',
  'src/sim/resources.test.ts',
  'src/sim/sharedWorld.test.ts',
  'src/sim/terrain.test.ts',
  'src/sim/trade.test.ts',
  'src/sim/war.test.ts',
];

export default mergeConfig(base, defineConfig({ test: { exclude: [...configDefaults.exclude, ...SIMULATED_WORLDS] } }));
