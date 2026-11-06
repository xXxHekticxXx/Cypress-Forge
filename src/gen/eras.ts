// The eras: what each piece looks like in each period, and the paint colours for the preview.
import type { Mat } from './core';

export type Opt = { id: string; label: string };

export type Era = {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  floor: Opt[];
  wall: Opt[];
  door: Opt[];
  pillar: Opt[];
  stairs: Opt[];
  bridge: Opt[];
  scatter: Opt[];
  ground: Opt[]; // hill/cliff surface
  top: Opt[];    // wall tops
  paint: Partial<Record<Mat, string>>;
};

const o = (id: string, label: string): Opt => ({ id, label });

const basePaint: Record<Mat, string> = {
  base: '#3B3A37', stone: '#9C9488', stone2: '#7E776C', mortar: '#57524B', wood: '#8A5A33', wood2: '#6B4426',
  metal: '#7D848C', metal2: '#565C63', brass: '#B58A3C', accent: '#9A2F2A', glow: '#58E1FF', ground: '#7A6A52',
  grass: '#5E7A3A', cloth: '#C9B98F', crystal: '#9B7CFF', organic: '#7B4E6E', water: '#2F6F8F',
};

export const ERAS: Era[] = [
  {
    id: 'ancient', name: 'Ancient', icon: '🏛', blurb: 'Greek, Roman, Egyptian, ruins',
    floor: [o('ashlar', 'Marble blocks'), o('mosaic', 'Mosaic'), o('flagstone', 'Flagstone'), o('dirt', 'Sand & dirt'), o('rough', 'Cave rock')],
    wall: [o('ashlar', 'Marble blocks'), o('fieldstone', 'Rubble stone'), o('brick', 'Roman brick')],
    door: [o('bronze', 'Bronze doors'), o('wood', 'Wooden door'), o('none', 'Open doorway')],
    pillar: [o('doric', 'Doric column'), o('ionic', 'Ionic column'), o('egypt', 'Egyptian papyrus'), o('obelisk', 'Obelisk')],
    stairs: [o('stone', 'Marble steps'), o('rough', 'Carved rock')],
    bridge: [o('stonearch', 'Stone arch'), o('plank', 'Wooden planks')],
    scatter: [o('amphora', 'Amphorae'), o('urn', 'Urns'), o('brazier', 'Tripod brazier'), o('drum', 'Fallen column drums'), o('altar', 'Altar'), o('statue', 'Statue plinth'), o('rubble', 'Rubble')],
    ground: [o('sand', 'Desert sand'), o('grass', 'Grassy hill'), o('rock', 'Bare rock')],
    top: [o('flat', 'Flat'), o('cornice', 'Cornice'), o('broken', 'Ruined')],
    paint: { stone: '#C9BFA8', stone2: '#B0A48A', mortar: '#7F7666', accent: '#B0563A', brass: '#B98A3F', ground: '#C2A777' },
  },
  {
    id: 'medieval', name: 'Medieval', icon: '🏰', blurb: 'Castles, dungeons, villages',
    floor: [o('flagstone', 'Flagstone'), o('cobble', 'Cobblestone'), o('brick', 'Brick'), o('planks', 'Wood planks'), o('dirt', 'Dirt & straw'), o('rough', 'Cave rock')],
    wall: [o('brick', 'Brick'), o('ashlar', 'Cut stone'), o('fieldstone', 'Fieldstone'), o('timber', 'Timber frame'), o('planks', 'Wood planks')],
    door: [o('wood', 'Iron-bound door'), o('portcullis', 'Portcullis'), o('none', 'Open doorway')],
    pillar: [o('pier', 'Stone pier'), o('round', 'Round column'), o('post', 'Wooden post'), o('statue', 'Knight statue')],
    stairs: [o('stone', 'Stone steps'), o('wood', 'Wooden steps'), o('rough', 'Worn rock')],
    bridge: [o('stonearch', 'Stone arch'), o('plank', 'Plank bridge'), o('rope', 'Rope bridge')],
    scatter: [o('barrel', 'Barrels'), o('crate', 'Crates'), o('chest', 'Treasure chest'), o('table', 'Table'), o('bench', 'Benches'), o('brazier', 'Brazier'), o('sacks', 'Sacks'), o('bookcase', 'Bookcase'), o('rubble', 'Rubble')],
    ground: [o('grass', 'Grassy hill'), o('rock', 'Rocky cliff'), o('sand', 'Dirt')],
    top: [o('flat', 'Flat'), o('crenel', 'Battlements'), o('broken', 'Ruined')],
    paint: {},
  },
  {
    id: 'sail', name: 'Age of Sail', icon: '⚓', blurb: 'Taverns, docks, ships',
    floor: [o('deck', 'Ship deck'), o('planks', 'Tavern floor'), o('cobble', 'Harbor cobbles'), o('flagstone', 'Flagstone')],
    wall: [o('planks', 'Ship planks'), o('timber', 'Timber frame'), o('brick', 'Brick'), o('fieldstone', 'Harbor stone')],
    door: [o('wood', 'Plank door'), o('hatch', 'Ship hatch'), o('none', 'Open doorway')],
    pillar: [o('mast', 'Ship mast'), o('post', 'Wooden post'), o('bollard', 'Dock piling')],
    stairs: [o('wood', 'Wooden steps'), o('ladder', 'Ship ladder'), o('stone', 'Stone steps')],
    bridge: [o('plank', 'Gangplank'), o('rope', 'Rope bridge'), o('stonearch', 'Stone arch')],
    scatter: [o('barrel', 'Barrels'), o('cannon', 'Cannon'), o('anchor', 'Anchor'), o('ropecoil', 'Rope coils'), o('crate', 'Cargo crates'), o('chest', 'Sea chest'), o('table', 'Tavern table')],
    ground: [o('sand', 'Beach dune'), o('grass', 'Grassy bluff'), o('rock', 'Sea cliff')],
    top: [o('flat', 'Flat'), o('rail', 'Ship rail'), o('broken', 'Wrecked')],
    paint: { wood: '#7A5130', wood2: '#5A3A22', metal: '#3E3E3E', accent: '#1F3F66' },
  },
  {
    id: 'steampunk', name: 'Steampunk', icon: '⚙', blurb: 'Foundries, brass, airships',
    floor: [o('ironplate', 'Riveted iron'), o('grate', 'Iron grating'), o('brick', 'Factory brick'), o('planks', 'Workshop planks')],
    wall: [o('iron', 'Riveted iron'), o('pipes', 'Brick & pipes'), o('brick', 'Factory brick')],
    door: [o('vault', 'Vault door'), o('wood', 'Iron-bound door'), o('none', 'Open doorway')],
    pillar: [o('pipe', 'Pipe column'), o('girder', 'Iron girder'), o('round', 'Cast-iron column')],
    stairs: [o('metal', 'Iron steps'), o('spiral', 'Spiral steps'), o('wood', 'Wooden steps')],
    bridge: [o('catwalk', 'Iron catwalk'), o('truss', 'Truss bridge'), o('plank', 'Plank bridge')],
    scatter: [o('gears', 'Gear stacks'), o('boiler', 'Boiler'), o('valve', 'Pipes & valve'), o('crate', 'Crates'), o('tesla', 'Tesla coil'), o('workbench', 'Workbench'), o('barrel', 'Barrels')],
    ground: [o('rock', 'Slag heap'), o('grass', 'Grassy hill'), o('sand', 'Coal dirt')],
    top: [o('flat', 'Flat'), o('rail', 'Railing'), o('broken', 'Wrecked')],
    paint: { metal: '#5A5048', metal2: '#3D3530', brass: '#C49A3A', stone: '#9B5A43', stone2: '#7E4634', accent: '#7A2E1E', glow: '#FFB547' },
  },
  {
    id: 'modern', name: 'Modern', icon: '🏙', blurb: 'Cities, bunkers, warzones',
    floor: [o('concrete', 'Concrete'), o('tile', 'Floor tile'), o('asphalt', 'Street asphalt'), o('planks', 'Hardwood'), o('grate', 'Steel grating')],
    wall: [o('cinder', 'Cinder block'), o('concretewall', 'Concrete'), o('brick', 'Brick'), o('iron', 'Sheet steel')],
    door: [o('metal', 'Steel door'), o('wood', 'Wooden door'), o('none', 'Open doorway')],
    pillar: [o('concrete', 'Concrete column'), o('ibeam', 'Steel I-beam'), o('lamp', 'Street lamp')],
    stairs: [o('concrete', 'Concrete steps'), o('metal', 'Steel steps')],
    bridge: [o('catwalk', 'Steel catwalk'), o('truss', 'Truss bridge')],
    scatter: [o('drum', 'Oil drums'), o('barrier', 'Jersey barrier'), o('sandbags', 'Sandbags'), o('pallet', 'Pallets & boxes'), o('cone', 'Traffic cones'), o('generator', 'Generator'), o('rubble', 'Rubble')],
    ground: [o('grass', 'Grassy hill'), o('rock', 'Rocky hill'), o('sand', 'Dirt')],
    top: [o('flat', 'Flat'), o('rail', 'Railing'), o('broken', 'Bombed out')],
    paint: { stone: '#A8A8A3', stone2: '#8C8C87', mortar: '#6C6C68', metal: '#6F767D', accent: '#C8A024', glow: '#FFE38A' },
  },
  {
    id: 'cyber', name: 'Cyberpunk', icon: '🌆', blurb: 'Neon alleys, megacity',
    floor: [o('cyberpanel', 'Street panels'), o('concrete', 'Cracked concrete'), o('grate', 'Grating'), o('hexdeck', 'Hex tiles')],
    wall: [o('cyberwall', 'Neon panels'), o('concretewall', 'Concrete'), o('cinder', 'Cinder block')],
    door: [o('shutter', 'Roll-up shutter'), o('sliding', 'Sliding door'), o('none', 'Open doorway')],
    pillar: [o('neon', 'Neon column'), o('ibeam', 'Steel beam'), o('lamp', 'Street lamp')],
    stairs: [o('metal', 'Steel steps'), o('concrete', 'Concrete steps')],
    bridge: [o('catwalk', 'Catwalk'), o('scifi', 'Skybridge')],
    scatter: [o('vending', 'Vending machine'), o('terminal', 'Terminal'), o('hazard', 'Hazard barrels'), o('scicrate', 'Crates'), o('spool', 'Cable spools'), o('sign', 'Neon sign')],
    ground: [o('rock', 'Rubble mound'), o('sand', 'Toxic dirt')],
    top: [o('flat', 'Flat'), o('rail', 'Railing'), o('broken', 'Smashed')],
    paint: { metal: '#3A3F4A', metal2: '#262A33', stone: '#6D6F75', stone2: '#575960', accent: '#FF2E88', glow: '#00F0FF', base: '#1B1D22' },
  },
  {
    id: 'scifi', name: 'Far future', icon: '🚀', blurb: 'Starship decks, stations',
    floor: [o('hexdeck', 'Hex deck plates'), o('scifiplate', 'Deck panels'), o('grate', 'Deck grating')],
    wall: [o('bulkhead', 'Bulkhead'), o('scifipanel', 'Hull panels')],
    door: [o('sliding', 'Sliding blast door'), o('iris', 'Iris door'), o('none', 'Open hatchway')],
    pillar: [o('strut', 'Support strut'), o('reactor', 'Power conduit'), o('holo', 'Holo pylon')],
    stairs: [o('metal', 'Deck steps'), o('ramp', 'Ramp')],
    bridge: [o('scifi', 'Gantry bridge'), o('catwalk', 'Catwalk')],
    scatter: [o('cargopod', 'Cargo pods'), o('console', 'Console'), o('powercell', 'Power cells'), o('scicrate', 'Crates'), o('barricade', 'Barricade'), o('holotable', 'Holo table')],
    ground: [o('rock', 'Alien rock'), o('crater', 'Crater field'), o('sand', 'Dust plain')],
    top: [o('flat', 'Flat'), o('rail', 'Railing'), o('broken', 'Hull breach')],
    paint: { metal: '#C9CDD3', metal2: '#8E949C', stone: '#B8BCC2', stone2: '#9AA0A8', accent: '#E0A33D', glow: '#4FD8FF', base: '#2A2E35' },
  },
  {
    id: 'alien', name: 'Alien', icon: '👽', blurb: 'Organic hives, crystal caves',
    floor: [o('alien', 'Organic floor'), o('crystal', 'Crystal ground'), o('rough', 'Alien rock')],
    wall: [o('organic', 'Hive wall'), o('crystalwall', 'Crystal wall'), o('fieldstone', 'Ancient alien stone')],
    door: [o('iris', 'Membrane iris'), o('none', 'Open passage')],
    pillar: [o('spire', 'Twisted spire'), o('crystals', 'Crystal column'), o('pod', 'Pod stalk')],
    stairs: [o('organic', 'Grown steps'), o('rough', 'Rock steps')],
    bridge: [o('organic', 'Living bridge'), o('stonearch', 'Stone arch')],
    scatter: [o('crystalcluster', 'Crystal clusters'), o('eggs', 'Egg pods'), o('stalks', 'Spore stalks'), o('bones', 'Giant bones'), o('rubble', 'Rubble')],
    ground: [o('crystalhill', 'Crystal hill'), o('rock', 'Alien rock'), o('crater', 'Crater')],
    top: [o('flat', 'Smooth'), o('spikes', 'Spikes'), o('broken', 'Torn')],
    paint: { stone: '#6E5B78', stone2: '#574763', organic: '#8C4F73', crystal: '#61F2C2', glow: '#9CFF5E', ground: '#4B3D52', grass: '#3D6B5A' },
  },
];

export const eraById = (id: string) => ERAS.find((e) => e.id === id) ?? ERAS[1];

export function paintFor(era: Era): Record<Mat, string> {
  return { ...basePaint, ...era.paint } as Record<Mat, string>;
}

export type PieceKind = 'floor' | 'wall' | 'corner' | 'door' | 'hill' | 'stairs' | 'pillar' | 'scatter' | 'bridge';
export const PIECES: { id: PieceKind; label: string; icon: string; help: string }[] = [
  { id: 'floor', label: 'Floor', icon: '⬛', help: 'Floor tiles on the grid' },
  { id: 'wall', label: 'Wall', icon: '🧱', help: 'Straight wall sections' },
  { id: 'corner', label: 'Corner', icon: '📐', help: 'L-shaped corner walls' },
  { id: 'door', label: 'Door', icon: '🚪', help: 'Wall with a doorway and a door' },
  { id: 'hill', label: 'Hill/cliff', icon: '⛰', help: 'Natural ground with flat ledges for minis' },
  { id: 'stairs', label: 'Stairs', icon: '🪜', help: 'Steps up to a higher level' },
  { id: 'pillar', label: 'Pillar', icon: '🏛', help: 'Columns and supports' },
  { id: 'scatter', label: 'Scatter', icon: '🛢', help: 'Props: barrels, crates, consoles…' },
  { id: 'bridge', label: 'Bridge', icon: '🌉', help: 'Spans gaps between levels' },
];
