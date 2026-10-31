// Captura de telas dos assentamentos (plano novo, fase 0): uma foto de perto e uma de longe para cada
// degrau (acampamento, aldeia, vila, cidade, metrópole) que existir no mundo depois de N anos.
//
// Uso: npm run dev (em outro terminal) e depois
//   node tools/capture-settlements.mjs [url] [anos] [pasta]
// Padrão: http://localhost:5173  150 anos  docs/capturas
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

// O Playwright não é dependência do projeto: usa o que estiver instalado na máquina (global ou local).
const { chromium } = createRequire(import.meta.url)('playwright');

const url = process.argv[2] ?? 'http://localhost:5173';
const years = Number(process.argv[3] ?? 150);
const out = process.argv[4] ?? 'docs/capturas';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.error('erro na página:', e.message));
await page.goto(`${url}/?debug`);
await page.waitForFunction(() => 'debugEarth' in window && !document.getElementById('loading'), null, { timeout: 120000 });
await page.evaluate(() => window.debugEarth());
await page.waitForFunction(() => window.surface?.eco, null, { timeout: 120000 });

// Semeia seis povos (como o runWorld da calibragem) e avança o mundo com a tela pausada.
const found = await page.evaluate(async (years) => {
  const s = window.surface;
  const eco = s.eco;
  s.speed = 0;
  const map = eco.map;
  const sap = eco.species.findIndex((sp) => sp.kind === 'sapient');
  let a = 12345;
  const rnd = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
  let placed = eco.villages.length;
  for (let t = 0; t < 4000 && placed < 6; t++) {
    const x = Math.floor(rnd() * map.width);
    const y = Math.floor(map.height * (0.3 + 0.4 * rnd()));
    const i = y * map.width + x;
    if (map.elevation[i] >= 0 && map.vegetation[i] > 0.3 && eco.canFound(x, y) && eco.introduceOne(sap, x + 0.5, y + 0.5) >= 0) {
      eco.foundVillage(sap, x, y, 8);
      placed++;
    }
  }
  const span = eco.yearSpan;
  eco.yearSpan = 6;
  const dt = 0.25;
  for (let y = 0; y < years; y++) {
    for (let t = 0; t < eco.yearSpan; t += dt) eco.step(dt);
    if (y % 10 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  eco.yearSpan = span;
  s.textureChanged = true;
  // O maior lugar de cada degrau.
  const best = new Map();
  for (const v of eco.villages) {
    if (v.abandoned || v.population <= 0) continue;
    const name = eco.tierName(v);
    if (!best.has(name) || best.get(name).population < v.population) best.set(name, { id: v.id, x: v.x, y: v.y, population: v.population, name });
  }
  return [...best.values()];
}, years);

console.log(`${found.length} degraus encontrados depois de ${years} anos:`, found.map((f) => `${f.name} (${f.population})`).join(', '));
for (const f of found) {
  for (const [label, zoom] of [['perto', 24], ['longe', 6]]) {
    await page.evaluate(({ f, zoom }) => {
      const s = window.surface;
      s.eco.watch([f.id]);
      s.goTo(f.x + 0.5, f.y + 0.5);
      s.zoom = zoom;
    }, { f, zoom });
    // Alguns quadros para as pessoas andarem e a textura repintar.
    await page.waitForTimeout(1500);
    const file = `${out}/${f.name.replace(/\s+/g, '-')}-${label}.png`;
    await page.screenshot({ path: file });
    console.log('salvo', file);
  }
}
await browser.close();
