// Every piece in the app, sorted into categories. Any piece can go on any board, whatever its era.
import { ERAS, CAVE, DUNGEON, FOREST, eraById, type PieceKind } from '../gen/eras';
import { defaults, fitPiece, OPENINGS, type Params } from '../gen/params';

export type Entry = { label: string; era: string; group: string; p: Params };
export type Category = { id: string; label: string; icon: string; entries: Entry[] };

function mk(era: string, piece: PieceKind, extra: Partial<Params>): Params {
  return fitPiece({ ...defaults(era, piece), ...extra });
}

export function buildLibrary(): Category[] {
  const per = (id: string, label: string, icon: string, piece: PieceKind, list: (e: (typeof ERAS)[number]) => { id: string; label: string }[], key: keyof Params, extra: (e: (typeof ERAS)[number]) => Partial<Params> = () => ({})): Category => ({
    id, label, icon,
    entries: ERAS.flatMap((e) => list(e).map((o) => ({ label: o.label, era: e.id, group: `${e.icon} ${e.name}`, p: mk(e.id, piece, { [key]: o.id, ...extra(e) } as Partial<Params>) }))),
  });
  const neutral = (id: string, label: string, icon: string, piece: PieceKind, list: { id: string; label: string }[], key: keyof Params, era = 'medieval', extra: (o: { id: string }) => Partial<Params> = () => ({})): Category => ({
    id, label, icon, entries: list.map((o) => ({ label: o.label, era, group: '', p: mk(era, piece, { [key]: o.id, ...extra(o) } as Partial<Params>) })),
  });
  return [
    per('floors', 'Floors', '⬛', 'floor', (e) => e.floor, 'floorStyle'),
    per('walls', 'Walls', '🧱', 'wall', (e) => e.wall, 'wallStyle'),
    neutral('openings', 'Doorways, windows & holes', '🪟', 'wall', OPENINGS.filter((o) => o.id !== 'none'), 'opening', 'medieval', (o) => ({ sx: o.id === 'double' || o.id === 'twin' ? 2 : 2 })),
    per('corners', 'Corners', '📐', 'corner', (e) => e.wall, 'wallStyle'),
    per('doors', 'Doors', '🚪', 'door', (e) => e.door, 'doorType', (e) => ({ wallStyle: e.wall[0].id })),
    neutral('caves', 'Caves', '🕳', 'cave', CAVE, 'caveItem', 'medieval', (o) => ({ sx: o.id === 'arch' || o.id === 'pool' ? 3 : 2, sy: o.id === 'wall' ? 1 : 2 })),
    neutral('dungeon', 'Dungeon', '⛓', 'dungeon', DUNGEON, 'dungeonItem', 'medieval', (o) => ({ sx: 2, sy: ['drain', 'rack', 'stocks'].includes(o.id) ? 2 : 1 })),
    neutral('forest', 'Forest', '🌲', 'forest', FOREST, 'forestItem', 'medieval', (o) => ({ sx: o.id === 'fallen' ? 3 : 2, sy: 2, pillarH: 3.5 })),
    per('traps', 'Traps', '☠', 'trap', (e) => e.traps, 'trapItem'),
    per('hills', 'Hills & cliffs', '⛰', 'hill', (e) => e.ground, 'hillStyle', () => ({ sx: 4, sy: 3 })),
    per('stairs', 'Stairs', '🪜', 'stairs', (e) => e.stairs, 'stairsStyle'),
    per('pillars', 'Pillars', '🏛', 'pillar', (e) => e.pillar, 'pillarStyle'),
    per('scatter', 'Scatter & props', '🛢', 'scatter', (e) => e.scatter, 'scatterItem'),
    per('bridges', 'Bridges', '🌉', 'bridge', (e) => e.bridge, 'bridgeStyle', () => ({ sx: 4 })),
  ];
}

export const eraLabel = (id: string) => { const e = eraById(id); return `${e.icon} ${e.name}`; };
