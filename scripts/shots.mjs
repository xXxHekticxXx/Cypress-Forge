// Screenshots of every era × piece (default style) for a visual check. usage: node scripts/shots.mjs <outdir> [eras]
import { chromium } from 'playwright';
const out = process.argv[2];
const only = process.argv[3]?.split(',');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:4174/');
await page.waitForFunction(() => window.__forge);
const eras = ['ancient', 'medieval', 'sail', 'steampunk', 'modern', 'cyber', 'scifi', 'alien'].filter((e) => !only || only.includes(e));
const pieces = ['floor', 'wall', 'corner', 'door', 'hill', 'stairs', 'pillar', 'scatter', 'bridge'];
const extra = JSON.parse(process.argv[4] ?? '{}');
for (const era of eras) for (const piece of pieces) {
  await page.evaluate(([era, piece, extra]) => {
    const base = { era, piece, seed: 1234, sx: 2, sy: 2, grid: 'in', wear: 0.3, detail: 1, base: 'flat', magnet: '6x3', wallH: 2, wallT: 12, opening: piece === 'wall' ? 'arch' : 'none', floorStrip: true, doorLeaf: true, pillarH: 2.5, broken: false, stairsH: 1, steps: 4, rails: false, hillH: 1.5, tiers: 2, rocks: 0.5, count: 3, onBase: false };
    const E = { ancient: ['ashlar','ashlar','flat','bronze','doric','stone','stonearch','amphora','sand'], medieval: ['flagstone','brick','crenel','wood','pier','stone','stonearch','barrel','grass'], sail: ['deck','planks','flat','wood','mast','wood','plank','cannon','sand'], steampunk: ['ironplate','pipes','flat','vault','pipe','metal','catwalk','boiler','rock'], modern: ['concrete','cinder','flat','metal','concrete','concrete','truss','barrier','grass'], cyber: ['cyberpanel','cyberwall','flat','shutter','neon','metal','catwalk','vending','rock'], scifi: ['hexdeck','bulkhead','flat','sliding','strut','metal','scifi','console','crater'], alien: ['alien','organic','spikes','iris','spire','organic','organic','eggs','crystalhill'] }[era];
    let p = { ...base, floorStyle: E[0], wallStyle: E[1], top: E[2], doorType: E[3], pillarStyle: E[4], stairsStyle: E[5], bridgeStyle: E[6], scatterItem: E[7], hillStyle: E[8] };
    if (piece === 'wall' || piece === 'door') { p.sx = 2; p.sy = 1; }
    if (piece === 'corner' || piece === 'pillar' || piece === 'scatter') { p.sx = 1; p.sy = 1; }
    if (piece === 'bridge') { p.sx = 4; p.sy = 1; }
    if (piece === 'hill') { p.sx = 4; p.sy = 3; }
    window.__forge.set({ ...p, ...extra });
  }, [era, piece, extra]);
  await page.waitForTimeout(250);
  await page.waitForFunction(() => document.getElementById('ready')?.dataset.ready === '1', null, { timeout: 60000 });
  await page.waitForTimeout(400);
  await page.locator('main').screenshot({ path: `${out}/${era}-${piece}.png` });
}
await b.close();
