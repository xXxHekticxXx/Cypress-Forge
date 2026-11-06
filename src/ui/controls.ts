// What the "Make it yours" panel shows for each piece. `simple` controls stay visible in Simple mode.
import { eraById, CAVE, DUNGEON, FOREST, type Opt } from '../gen/eras';
import { OPENINGS, type Params } from '../gen/params';

export type Control =
  | { kind: 'slider'; key: keyof Params; label: string; min: number; max: number; step: number; fmt: (v: number) => string; simple?: boolean; help?: string }
  | { kind: 'choice'; key: keyof Params; label: string; options: Opt[]; simple?: boolean; help?: string }
  | { kind: 'toggle'; key: keyof Params; label: string; simple?: boolean; help?: string }
  | { kind: 'size'; simple?: boolean; maxX: number; maxY: number; lockY?: boolean; label?: string };

const sq = (v: number) => `${v} square${v === 1 ? '' : 's'}`;
const inch = (v: number) => `${v} in (${Math.round(v * 25.4)} mm)`;
const wearName = (v: number) => (v < 0.12 ? 'Brand new' : v < 0.35 ? 'Lived-in' : v < 0.6 ? 'Battle-worn' : v < 0.85 ? 'Crumbling' : 'Ruined');

export function controlsFor(p: Params): Control[] {
  const e = eraById(p.era);
  const common: Control[] = [
    { kind: 'slider', key: 'wear', label: 'Wear and damage', min: 0, max: 1, step: 0.05, fmt: wearName, simple: true, help: 'From freshly built to falling apart: chips, cracks, missing stones and rubble.' },
    { kind: 'slider', key: 'detail', label: 'Detail depth', min: 0.5, max: 1.6, step: 0.05, fmt: (v) => `${Math.round(v * 100)} %`, help: 'How deep textures and grooves are. Higher shows up better after painting; lower prints faster.' },
    { kind: 'slider', key: 'texture', label: 'Surface texture', min: 0, max: 1, step: 0.05, fmt: (v) => (v < 0.1 ? 'Smooth' : v < 0.4 ? 'Light' : v < 0.75 ? 'Strong' : 'Very rough'), simple: true, help: 'Grain, pitting and tool marks on stone and wood. Print at 0.12–0.16 mm layers to keep it.' },
    { kind: 'choice', key: 'finish', label: 'Finish', simple: true, options: [{ id: 'clean', label: 'Clean' }, { id: 'moss', label: '🌿 Moss' }, { id: 'burnt', label: '🔥 Burnt' }, { id: 'decay', label: '🕸 Decaying' }, { id: 'vines', label: 'Vines' }, { id: 'cobwebs', label: 'Cobwebs' }], help: 'Ages any piece. Moss and webs are raised shapes you paint.' },
    ...(p.finish !== 'clean' ? [{ kind: 'slider', key: 'finishAmt', label: 'How much', min: 0.1, max: 1, step: 0.05, fmt: (v: number) => (v < 0.35 ? 'A little' : v < 0.7 ? 'Some' : 'Lots') } as Control] : []),
  ];
  const masonry: Control[] = [
    { kind: 'slider', key: 'popout', label: 'Brick / stone pop-out', min: 0.2, max: 3, step: 0.1, fmt: (v) => `${v.toFixed(1)} mm`, simple: true, help: 'How far bricks and stones stand out from the mortar.' },
    { kind: 'slider', key: 'joint', label: 'Joint / gap width', min: 0.3, max: 2, step: 0.1, fmt: (v) => `${v.toFixed(1)} mm`, help: 'Gap between bricks, stones and planks.' },
    { kind: 'slider', key: 'bricksPer', label: 'Bricks along a square', min: 1, max: 8, step: 1, fmt: (v) => `${v}` },
    { kind: 'slider', key: 'courses', label: 'Rows of bricks per inch', min: 3, max: 12, step: 1, fmt: (v) => `${v}` },
    { kind: 'slider', key: 'planksPer', label: 'Planks per square', min: 2, max: 8, step: 1, fmt: (v) => `${v}` },
  ];
  const base: Control[] = [
    { kind: 'choice', key: 'base', label: 'Base', simple: true, options: [{ id: 'flat', label: 'Flat' }, { id: 'magnet', label: 'Magnets' }, { id: 'clip', label: 'Clip slots' }, { id: 'none', label: 'No base' }], help: 'Magnets hold tiles together on a steel sheet or each other. Clip slots take the little clips you can add to the print set.' },
  ];
  if (p.base === 'magnet') base.push({ kind: 'choice', key: 'magnet', label: 'Magnet size', options: [{ id: '5x2', label: '5×2 mm' }, { id: '6x2', label: '6×2 mm' }, { id: '6x3', label: '6×3 mm' }, { id: '8x3', label: '8×3 mm' }] });
  const grid: Control = { kind: 'choice', key: 'grid', label: 'Grid', options: [{ id: 'in', label: '1 inch squares' }, { id: 'mm25', label: '25 mm squares' }], help: '1 inch is the D&D standard for 28 mm minis.' };

  const wallCtl = (opening: boolean): Control[] => [
    { kind: 'choice', key: 'wallStyle', label: 'Wall style', options: e.wall, simple: true },
    { kind: 'slider', key: 'wallH', label: 'Wall height', min: 1, max: 3, step: 0.25, fmt: inch, simple: true, help: '2 inches is a classic dungeon wall; 1.5 inches lets you reach in to move minis.' },
    { kind: 'slider', key: 'wallT', label: 'Wall thickness', min: 6, max: 20, step: 1, fmt: (v) => `${v} mm` },
    { kind: 'choice', key: 'top', label: 'Top of the wall', options: e.top },
    ...(opening ? [
      { kind: 'choice', key: 'opening', label: 'Opening', simple: true, options: OPENINGS } as Control,
      ...(p.opening !== 'none' ? [{ kind: 'choice', key: 'openingPos', label: 'Where', options: [{ id: 'center', label: 'Center' }, { id: 'left', label: 'Left' }, { id: 'right', label: 'Right' }, { id: 'two', label: 'Two of them' }] } as Control] : []),
    ] : []),
    ...masonry,
    { kind: 'toggle', key: 'floorStrip', label: 'Wall stands on a floor tile', help: 'Dungeon-tile style: the wall sits on the back edge of a floor square, so walls and floors line up on the grid.' },
  ];

  switch (p.piece) {
    case 'floor':
      return [{ kind: 'size', maxX: 6, maxY: 6, simple: true }, { kind: 'choice', key: 'floorStyle', label: 'Floor style', options: e.floor, simple: true }, ...masonry, ...common, ...base, grid];
    case 'wall':
      return [{ kind: 'size', maxX: 6, maxY: 1, lockY: true, simple: true, label: 'Length' }, ...wallCtl(true), { kind: 'choice', key: 'floorStyle', label: 'Floor style (on the tile)', options: e.floor }, ...common, ...base, grid];
    case 'corner':
      return [{ kind: 'size', maxX: 3, maxY: 1, lockY: true, simple: true, label: 'Leg length' }, ...wallCtl(false), { kind: 'choice', key: 'floorStyle', label: 'Floor style (on the tile)', options: e.floor }, ...common, ...base, grid];
    case 'door':
      return [{ kind: 'size', maxX: 4, maxY: 1, lockY: true, simple: true, label: 'Length' },
        { kind: 'choice', key: 'doorType', label: 'Door', options: e.door, simple: true },
        { kind: 'toggle', key: 'doorLeaf', label: 'Print the door too (lies flat next to the wall)' },
        ...wallCtl(false), { kind: 'choice', key: 'floorStyle', label: 'Floor style (on the tile)', options: e.floor }, ...common, ...base, grid];
    case 'pillar':
      return [{ kind: 'choice', key: 'pillarStyle', label: 'Pillar style', options: e.pillar, simple: true },
        { kind: 'slider', key: 'pillarH', label: 'Height', min: 1, max: 4, step: 0.25, fmt: inch, simple: true },
        { kind: 'toggle', key: 'broken', label: 'Broken / fallen top', simple: true },
        { kind: 'choice', key: 'floorStyle', label: 'Floor under it', options: e.floor }, ...masonry, ...common, ...base, grid];
    case 'stairs':
      return [{ kind: 'size', maxX: 4, maxY: 4, simple: true }, { kind: 'choice', key: 'stairsStyle', label: 'Stairs style', options: e.stairs, simple: true },
        { kind: 'slider', key: 'stairsH', label: 'Climbs up', min: 0.5, max: 3, step: 0.25, fmt: inch, simple: true },
        { kind: 'slider', key: 'steps', label: 'Steps', min: 2, max: 12, step: 1, fmt: (v) => `${v}` },
        { kind: 'toggle', key: 'rails', label: 'Handrails' }, ...common, ...base, grid];
    case 'hill':
      return [{ kind: 'size', maxX: 8, maxY: 8, simple: true }, { kind: 'choice', key: 'hillStyle', label: 'Ground', options: e.ground, simple: true },
        { kind: 'slider', key: 'hillH', label: 'Height', min: 0.5, max: 4, step: 0.25, fmt: inch, simple: true },
        { kind: 'slider', key: 'tiers', label: 'Ledges (flat spots for minis)', min: 1, max: 5, step: 1, fmt: (v) => `${v}`, simple: true },
        { kind: 'slider', key: 'rocks', label: 'Boulders', min: 0, max: 1, step: 0.05, fmt: (v) => (v < 0.15 ? 'None' : v < 0.5 ? 'A few' : v < 0.8 ? 'Plenty' : 'Lots') },
        ...common, ...base, grid];
    case 'scatter':
      return [{ kind: 'choice', key: 'scatterItem', label: 'Prop', options: e.scatter, simple: true },
        { kind: 'slider', key: 'count', label: 'How many', min: 1, max: 6, step: 1, fmt: (v) => `${v}`, simple: true },
        { kind: 'toggle', key: 'onBase', label: 'Group them on a base', simple: true },
        { kind: 'choice', key: 'floorStyle', label: 'Base surface', options: e.floor }, ...common, ...base];
    case 'bridge':
      return [{ kind: 'size', maxX: 8, maxY: 2, simple: true, label: 'Span' }, { kind: 'choice', key: 'bridgeStyle', label: 'Bridge style', options: e.bridge, simple: true }, ...common, grid];
  }
  const H = { kind: 'slider', key: 'wallH', label: 'Height', min: 1, max: 3.5, step: 0.25, fmt: inch, simple: true } as Control;
  switch (p.piece) {
    case 'cave':
      return [{ kind: 'choice', key: 'caveItem', label: 'Cave piece', options: CAVE, simple: true }, { kind: 'size', maxX: 6, maxY: 6, simple: true }, H,
        ...(p.caveItem === 'wall' ? [{ kind: 'toggle', key: 'floorStrip', label: 'Wall stands on a floor tile' } as Control] : []), ...common, ...base, grid];
    case 'dungeon':
      return [{ kind: 'choice', key: 'dungeonItem', label: 'Dungeon piece', options: DUNGEON, simple: true }, { kind: 'size', maxX: 4, maxY: 4, simple: true }, H, ...masonry, ...common, ...base, grid];
    case 'forest':
      return [{ kind: 'choice', key: 'forestItem', label: 'Forest piece', options: FOREST, simple: true }, { kind: 'size', maxX: 6, maxY: 6, simple: true },
        { kind: 'slider', key: 'pillarH', label: 'Tree height', min: 1.5, max: 6, step: 0.25, fmt: inch, simple: true }, ...common, ...base, grid];
    case 'trap':
      return [{ kind: 'choice', key: 'trapItem', label: 'Trap', options: e.traps, simple: true }, { kind: 'size', maxX: 4, maxY: 4, simple: true }, ...common, ...base, grid];
  }
  return [];
}

export function defaultValue(key: keyof Params, p: Params, d: Params) {
  return d[key];
}
