// App settings: saved in this browser, applied everywhere (viewport, new pieces, print estimates, export).
import { BED, PRINT } from '../export/export';

export type Settings = {
  // display
  quality: 'auto' | 'high' | 'fast';
  shadows: boolean;
  ao: boolean;
  background: 'dark' | 'felt' | 'stone' | 'light';
  look: 'painted' | 'plastic';
  grid: boolean;
  mini: boolean;
  rotateSpeed: number;
  // building
  snap: 'square' | 'half' | 'quarter' | 'off';
  confirmDelete: boolean;
  editorMode: 'simple' | 'all';
  // new piece defaults
  defGrid: 'in' | 'mm25';
  defBase: 'flat' | 'magnet' | 'clip' | 'none';
  defMagnet: '5x2' | '6x2' | '6x3' | '8x3';
  defDetail: number;
  defTexture: number;
  defWear: number;
  // printer
  printer: string;
  bedW: number;
  bedD: number;
  bedH: number;
  layer: number;
  infill: number;
  filament: 'pla' | 'petg' | 'abs' | 'silk';
  costKg: number;
  speed: number;
  // export
  files: 'both' | '3mf' | 'stl';
  readme: boolean;
  clips: boolean;
};

export const PRINTERS: { id: string; label: string; w: number; d: number; h: number }[] = [
  { id: 'kobra-s1', label: 'Anycubic Kobra S1', w: 250, d: 250, h: 250 },
  { id: 'kobra-3', label: 'Anycubic Kobra 3', w: 250, d: 250, h: 260 },
  { id: 'kobra-2-max', label: 'Anycubic Kobra 2 Max', w: 420, d: 420, h: 500 },
  { id: 'bambu-x1', label: 'Bambu Lab X1 / P1', w: 256, d: 256, h: 256 },
  { id: 'bambu-a1', label: 'Bambu Lab A1', w: 256, d: 256, h: 256 },
  { id: 'bambu-a1-mini', label: 'Bambu Lab A1 mini', w: 180, d: 180, h: 180 },
  { id: 'ender-3', label: 'Creality Ender 3 (V2/V3)', w: 220, d: 220, h: 250 },
  { id: 'k1', label: 'Creality K1 / K1C', w: 220, d: 220, h: 250 },
  { id: 'prusa-mk4', label: 'Prusa MK4', w: 250, d: 210, h: 220 },
  { id: 'prusa-mini', label: 'Prusa MINI', w: 180, d: 180, h: 180 },
  { id: 'neptune-4', label: 'Elegoo Neptune 4 / Pro', w: 225, d: 225, h: 265 },
  { id: 'custom', label: 'Custom size', w: 250, d: 250, h: 250 },
];

export const FILAMENTS = { pla: { label: 'PLA', density: 1.24 }, petg: { label: 'PETG', density: 1.27 }, abs: { label: 'ABS / ASA', density: 1.05 }, silk: { label: 'Silk PLA', density: 1.25 } };

export const DEFAULTS: Settings = {
  quality: 'auto', shadows: true, ao: true, background: 'dark', look: 'painted', grid: true, mini: true, rotateSpeed: 1,
  snap: 'square', confirmDelete: false, editorMode: 'all',
  defGrid: 'in', defBase: 'flat', defMagnet: '6x3', defDetail: 1, defTexture: 0.6, defWear: 0.3,
  printer: 'kobra-s1', bedW: 250, bedD: 250, bedH: 250, layer: 0.16, infill: 15, filament: 'pla', costKg: 20, speed: 1,
  files: 'both', readme: true, clips: true,
};

const KEY = 'forge-settings';
export let SETTINGS: Settings = { ...DEFAULTS };
try { SETTINGS = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* private mode */ }

function applyBed() {
  BED.w = SETTINGS.bedW; BED.d = SETTINGS.bedD; BED.h = SETTINGS.bedH;
  PRINT.layer = SETTINGS.layer; PRINT.infill = SETTINGS.infill; PRINT.speed = SETTINGS.speed;
  PRINT.density = FILAMENTS[SETTINGS.filament]?.density ?? 1.24;
}

export function saveSettings(s: Settings) {
  SETTINGS = s;
  applyBed();
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* full */ }
}

export const BACKGROUNDS: Record<Settings['background'], { label: string; bg: string; plate: string }> = {
  dark: { label: 'Dark', bg: '#15181C', plate: '#2B2F36' },
  felt: { label: 'Game-table felt', bg: '#101712', plate: '#2C4A33' },
  stone: { label: 'Stone table', bg: '#1A1918', plate: '#4A4642' },
  light: { label: 'Light', bg: '#C9CDD3', plate: '#9AA0A8' },
};

export const isHQ = () => SETTINGS.quality === 'high' || (SETTINGS.quality === 'auto' && !matchMedia('(pointer: coarse)').matches && window.innerWidth > 900);

applyBed();
export const APP_VERSION = '2.1';
