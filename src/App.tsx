import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ERAS, eraById, paintFor } from './gen/eras';
import { defaults, fitPiece, randomize, switchEra, sqSize, type Params } from './gen/params';
import { generate, clipSet, type Piece } from './gen/generate';
import { Viewport, type Look } from './ui/viewport';
import { controlsFor, type Control } from './ui/controls';
import { makeRoom, ROOMS, type RoomKind } from './ui/room';
import { buildLibrary, eraLabel, type Entry } from './ui/library';
import { printGeometry, estimate, fmtTime, exportZip, download, arrange, BED, type Item } from './export/export';
import { Rng, INCH } from './gen/core';
import { SETTINGS, saveSettings, DEFAULTS, PRINTERS, FILAMENTS, BACKGROUNDS, isHQ, APP_VERSION, type Settings } from './ui/settings';

type BoardItem = { id: string; p: Params; x: number; z: number; y: number; rot: number };
type Board = { w: number; d: number; items: BoardItem[] };
type Saved = { name: string; board: Board; saved: string };

const LS = { state: 'forge-board-v2', sets: 'forge-boards-v2', simple: 'forge-simple' };
const load = <T,>(k: string, d: T): T => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
};
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode / full */ } };
const key = (p: Params) => JSON.stringify(p);
const uid = () => Math.random().toString(36).slice(2, 9);
const LIB = buildLibrary();

// keep built pieces so moving things around never rebuilds them
const cache = new Map<string, Piece>();
function build(p: Params) {
  const k = key(p);
  let pc = cache.get(k);
  if (!pc) {
    pc = generate({ ...defaults(p.era, p.piece), ...p });
    cache.set(k, pc);
    if (cache.size > 120) cache.delete(cache.keys().next().value!);
  }
  return pc;
}

/** Footprint in squares, turned with the piece. */
function foot(it: BoardItem) {
  const fx = Math.max(1, it.p.sx), fz = Math.max(1, it.p.piece === 'pillar' || it.p.piece === 'scatter' ? it.p.sy : it.p.sy);
  return it.rot % 2 ? [fz, fx] : [fx, fz];
}

function snapTo(it: BoardItem, x: number, z: number, b: Board) {
  const sq = sqSize(it.p);
  const [fx, fz] = foot(it);
  const W = b.w * INCH, D = b.d * INCH;
  const mode = SETTINGS.snap;
  if (mode === 'off') return [x, z] as [number, number];
  const base = mode === 'quarter' ? 0.25 : mode === 'half' ? 0.5 : 1;
  const fine = it.p.piece === 'scatter' || it.p.piece === 'forest' ? Math.min(0.5, base) : base; // props snap to half squares
  const sx = (Math.round(((x + W / 2) / sq - fx / 2) / fine) * fine + fx / 2) * sq - W / 2;
  const sz = (Math.round(((z + D / 2) / sq - fz / 2) / fine) * fine + fz / 2) * sq - D / 2;
  return [Math.max(-W / 2 + (fx * sq) / 2 - sq, Math.min(W / 2 - (fx * sq) / 2 + sq, sx)), Math.max(-D / 2 + (fz * sq) / 2 - sq, Math.min(D / 2 - (fz * sq) / 2 + sq, sz))] as [number, number];
}

function starter(): Board {
  // a little dungeon corner so the board isn't empty the first time
  const items: BoardItem[] = [];
  const add = (era: string, piece: Params['piece'], extra: Partial<Params>, x: number, z: number, rot = 0) =>
    items.push({ id: uid(), p: fitPiece({ ...defaults(era, piece), ...extra }), x, z, y: 0, rot });
  const s = INCH;
  for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) add('medieval', 'floor', { floorStyle: 'flagstone', sx: 2, sy: 2, seed: 100 + i * 2 + j, finish: 'moss', finishAmt: 0.25 }, -s + i * 2 * s, -s + j * 2 * s);
  add('medieval', 'wall', { wallStyle: 'brick', sx: 2, floorStrip: false, opening: 'none', finish: 'moss', finishAmt: 0.4 }, -s, -3 * s + s / 2);
  add('medieval', 'dungeon', { dungeonItem: 'celldoor', sx: 2, sy: 1 }, s, -3 * s + s / 2);
  add('medieval', 'scatter', { scatterItem: 'barrel', count: 3 }, -2 * s + s / 2, s + s / 2);
  add('medieval', 'dungeon', { dungeonItem: 'cage', sx: 2, sy: 1 }, 4 * s, 0, 1);
  add('medieval', 'forest', { forestItem: 'dead', sx: 2, sy: 2, pillarH: 3.5 }, -4 * s, 2 * s);
  return { w: 12, d: 12, items };
}

export default function App() {
  const [board, setBoardState] = useState<Board>(() => load<Board | null>(LS.state, null) ?? starter());
  const [undo, setUndo] = useState<Board[]>([]);
  const [redo, setRedo] = useState<Board[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [settings, setSettingsState] = useState<Settings>(SETTINGS);
  const setSettings = (n: Partial<Settings>) => setSettingsState((cur) => { const s = { ...cur, ...n }; saveSettings(s); return s; });
  const simple = settings.editorMode === 'simple';
  const setSimple = (v: boolean) => setSettings({ editorMode: v ? 'simple' : 'all' });
  const look = settings.look as Look;
  const setLook = (v: Look) => setSettings({ look: v as Settings['look'] });
  const gridOn = settings.grid, miniOn = settings.mini;
  const setGridOn = (v: boolean) => setSettings({ grid: v });
  const setMiniOn = (v: boolean) => setSettings({ mini: v });
  const [vpGen, setVpGen] = useState(0);
  const [canInstall, setCanInstall] = useState(() => !!(window as any).__installPrompt);
  const [installed, setInstalled] = useState(() => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<null | 'room' | 'sets' | 'export' | 'help' | 'settings' | 'install'>(null);
  const [tab, setTab] = useState<'lib' | 'edit' | 'print'>('lib');
  const [toast, setToast] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({ walls: true });
  const [setName, setSetName] = useState('My terrain');
  const host = useRef<HTMLDivElement>(null);
  const vp = useRef<Viewport | null>(null);
  const boardRef = useRef(board);
  boardRef.current = board;
  const sel = board.items.find((i) => i.id === selId) ?? null;

  const setBoard = useCallback((next: Board | ((b: Board) => Board), record = true) => {
    setBoardState((cur) => {
      const n = typeof next === 'function' ? next(cur) : next;
      if (record && n !== cur) { setUndo((u) => [...u.slice(-50), cur]); setRedo([]); }
      return n;
    });
  }, []);

  useEffect(() => {
    const v = new Viewport(host.current!, isHQ());
    vp.current = v;
    v.onSelect = (id) => { setSelId(id); if (id) setTab('edit'); };
    v.snap = (id, x, z) => { const it = boardRef.current.items.find((i) => i.id === id); return it ? snapTo(it, x, z, boardRef.current) : [x, z]; };
    v.onMove = (id, x, z) => setBoard((b) => ({ ...b, items: b.items.map((i) => (i.id === id ? { ...i, x, z } : i)) }));
    v.setLook('painted', paintFor(eraById('medieval')));
    // used by the automated screenshot checks
    (window as any).__forge = {
      set: (p: Params) => setBoard({ w: 6, d: 6, items: [{ id: 'one', p, x: 0, z: 0, y: 0, rot: 0 }] }, false),
      board: (b: Board) => setBoard(b, false),
      frame: () => vp.current?.frame(),
    };
    setVpGen((g) => g + 1);
    setTimeout(() => v.frame(), 50);
    return () => v.dispose();
  }, [settings.quality]);
  useEffect(() => save(LS.state, board), [board]);
  useEffect(() => vp.current?.setGrid(gridOn), [gridOn, vpGen]);
  useEffect(() => vp.current?.setMini(miniOn), [miniOn, vpGen]);
  useEffect(() => { const b = BACKGROUNDS[settings.background]; vp.current?.setBackground(b.bg, b.plate); }, [settings.background, vpGen]);
  useEffect(() => vp.current?.setShadows(settings.shadows), [settings.shadows, vpGen]);
  useEffect(() => vp.current?.setAO(settings.ao), [settings.ao, vpGen]);
  useEffect(() => vp.current?.setRotateSpeed(settings.rotateSpeed), [settings.rotateSpeed, vpGen]);
  useEffect(() => {
    const a = () => setCanInstall(true), b = () => { setInstalled(true); setCanInstall(false); setToast('Cypress Forge is installed. Open it from your home screen or Start menu.'); };
    window.addEventListener('forge-can-install', a);
    window.addEventListener('forge-installed', b);
    return () => { window.removeEventListener('forge-can-install', a); window.removeEventListener('forge-installed', b); };
  }, []);
  useEffect(() => vp.current?.select(selId), [selId]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3200); return () => clearTimeout(t); } }, [toast]);

  // rebuild whatever changed, a moment after the last change
  useEffect(() => {
    setBusy(true);
    const t = setTimeout(() => {
      const v = vp.current;
      if (!v) return;
      if (v.boardSize.w !== board.w || v.boardSize.d !== board.d) v.setBoard(board.w, board.d, INCH);
      // painted colours follow the selected piece's era (each era has its own palette)
      v.setLook(look, paintFor(eraById(sel?.p.era ?? 'medieval')));
      try {
        v.setItems(board.items.map((it) => ({ id: it.id, key: key(it.p), parts: () => build(it.p).parts, x: it.x, y: it.y, z: it.z, ry: (it.rot * Math.PI) / 2 })));
      } catch (e) { console.error(e); setToast('A piece did not build. Try another setting.'); }
      setBusy(false);
    }, 120);
    return () => clearTimeout(t);
  }, [board, look, selId, vpGen]);

  const change = useCallback((next: Partial<Params> | ((q: Params) => Params)) => {
    if (!selId) return;
    setBoard((b) => ({
      ...b,
      items: b.items.map((it) => {
        if (it.id !== selId) return it;
        const p = typeof next === 'function' ? next(it.p) : { ...it.p, ...next };
        const n = { ...it, p };
        // keep it on the grid if its size changed
        const [x, z] = snapTo(n, it.x, it.z, b);
        return { ...n, x, z };
      }),
    }));
  }, [selId, setBoard]);

  const addPiece = (p: Params, at?: { x: number; z: number }) => {
    const S = SETTINGS;
    const it: BoardItem = { id: uid(), p: { ...p, grid: S.defGrid, base: S.defBase, magnet: S.defMagnet, detail: S.defDetail, texture: S.defTexture, wear: S.defWear, seed: new Rng(Date.now()).int(1, 999999) }, x: 0, z: 0, y: 0, rot: 0 };
    let x = at?.x ?? 0, z = at?.z ?? 0;
    if (!at) {
      // first free spot, scanning from the middle out
      const taken = (xx: number, zz: number) => boardRef.current.items.some((o) => Math.abs(o.x - xx) < INCH * 1.2 && Math.abs(o.z - zz) < INCH * 1.2);
      outer: for (let r = 0; r < Math.max(board.w, board.d); r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        if (!taken(i * INCH, j * INCH)) { x = i * INCH; z = j * INCH; break outer; }
      }
    }
    [it.x, it.z] = snapTo(it, x, z, boardRef.current);
    setBoard((b) => ({ ...b, items: [...b.items, it] }));
    setSelId(it.id);
    setTab('edit');
  };

  const removeSel = () => { if (!selId) return; if (SETTINGS.confirmDelete && !confirm('Delete this piece?')) return; setBoard((b) => ({ ...b, items: b.items.filter((i) => i.id !== selId) })); setSelId(null); };
  const rotateSel = (d = 1) => selId && setBoard((b) => ({ ...b, items: b.items.map((i) => { if (i.id !== selId) return i; const n = { ...i, rot: (i.rot + d + 4) % 4 }; const [x, z] = snapTo(n, i.x, i.z, b); return { ...n, x, z }; }) }));
  const raiseSel = (d: number) => selId && setBoard((b) => ({ ...b, items: b.items.map((i) => (i.id === selId ? { ...i, y: Math.max(0, i.y + d * (INCH / 4)) } : i)) }));
  const dupSel = () => {
    if (!sel) return;
    const [fx] = foot(sel);
    const it = { ...sel, id: uid(), x: sel.x + fx * INCH };
    [it.x, it.z] = snapTo(it, it.x, it.z, board);
    setBoard((b) => ({ ...b, items: [...b.items, it] }));
    setSelId(it.id);
  };
  const doUndo = () => { const prev = undo[undo.length - 1]; if (!prev) return; setUndo(undo.slice(0, -1)); setRedo([board, ...redo]); setBoardState(prev); };
  const doRedo = () => { const nx = redo[0]; if (!nx) return; setRedo(redo.slice(1)); setUndo([...undo, board]); setBoardState(nx); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement)?.tagName;
      if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); doRedo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); dupSel(); return; }
      if (k === 'r') rotateSel(e.shiftKey ? -1 : 1);
      if (k === 'delete' || k === 'backspace') removeSel();
      if (k === 'escape') setSelId(null);
      if (k === 'pageup') raiseSel(1);
      if (k === 'pagedown') raiseSel(-1);
      if (sel && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) {
        e.preventDefault();
        const dx = k === 'arrowleft' ? -1 : k === 'arrowright' ? 1 : 0, dz = k === 'arrowup' ? -1 : k === 'arrowdown' ? 1 : 0;
        setBoard((b) => ({ ...b, items: b.items.map((i) => (i.id === selId ? { ...i, x: i.x + dx * INCH, z: i.z + dz * INCH } : i)) }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const install = async () => {
    const ev = (window as any).__installPrompt;
    if (ev) {
      ev.prompt();
      const r = await ev.userChoice.catch(() => null);
      (window as any).__installPrompt = null;
      setCanInstall(false);
      if (r?.outcome === 'accepted') setToast('Installing… it will show up with your apps.');
      return;
    }
    setModal('install');
  };

  // ---------- print totals ----------
  const totals = useMemo(() => {
    let grams = 0, minutes = 0;
    const items: Item[] = [];
    const seen = new Map<string, string>();
    const nameCount = new Map<string, number>();
    const clipBases = board.items.filter((i) => i.p.base === 'clip').length;
    try {
      for (const it of board.items) {
        const k = key(it.p);
        const pc = build(it.p);
        let name = seen.get(k);
        if (!name) {
          const n = (nameCount.get(pc.name) ?? 0) + 1;
          nameCount.set(pc.name, n);
          name = n > 1 ? `${pc.name} v${n}` : pc.name;
          seen.set(k, name);
        }
        const g = printGeometry(pc.parts);
        const est = estimate(g);
        grams += est.grams; minutes += est.minutes;
        items.push({ name, geo: g });
      }
      if (clipBases && settings.clips) items.push({ name: `Connector clips x${clipBases * 4}`, geo: printGeometry(clipSet(Math.min(48, clipBases * 4)).parts) });
    } catch { /* a piece failed; shown elsewhere */ }
    const plates = items.length ? arrange(items).length : 0;
    return { grams, minutes, pieces: board.items.length, plates, items, cost: (grams / 1000) * settings.costKg };
  }, [board, settings]);

  const doExport = async (only?: BoardItem) => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    const items = only ? [{ name: build(only.p).name, geo: printGeometry(build(only.p).parts) }] : totals.items;
    if (!items.length) { setToast('Put some pieces on the board first.'); setBusy(false); return; }
    const name = only ? build(only.p).name : setName;
    const { zip, plates } = exportZip(items, name, { files: settings.files, readme: settings.readme, layer: settings.layer });
    download(zip, `${name.replace(/[^\w\- ]+/g, '').trim() || 'terrain'}.zip`, 'application/zip');
    setBusy(false);
    setToast(`Downloaded ${items.length} piece${items.length === 1 ? '' : 's'} on ${plates} plate${plates === 1 ? '' : 's'}`);
  };

  const fits = (p: Params) => { const s = build(p).size; return Math.max(s.x, s.z) <= BED.w - 10 && s.y <= BED.h; };
  const controls = sel ? controlsFor(sel.p).filter((c) => !simple || c.simple) : [];
  const filtered = (entries: Entry[]) => (q ? entries.filter((e) => `${e.label} ${e.group}`.toLowerCase().includes(q.toLowerCase())) : entries);

  return (
    <div className={`app tab-${tab}`}>
      <header>
        <div className="logo">Cypress <span>Forge</span></div>
        <div className="sub">Printable D&amp;D terrain · 28 mm minis · {PRINTERS.find((x) => x.id === settings.printer)?.label.replace(/ \(.*\)/, '') ?? 'Custom'} bed {settings.bedW} × {settings.bedD} mm</div>
        <div className="hbtns">
          <button onClick={() => setModal('room')}>✨<span className="hide-s"> Generate a room</span></button>
          <button onClick={() => setModal('sets')}>📂 <span className="hide-s">My boards</span></button>
          {!installed && <button className="get" onClick={() => void install()}>📲 <span className="hide-s">Get the app</span></button>}
          <button onClick={() => setModal('settings')} aria-label="Settings">⚙<span className="hide-s"> Settings</span></button>
          <button className="helpbtn" onClick={() => setModal('help')} aria-label="Help">?</button>
          <button className="primary" onClick={() => setModal('export')}>⬇ Export</button>
        </div>
      </header>

      <aside className="left">
        <div className="h">PIECES · drag onto the board or tap to add</div>
        <input className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search pieces" placeholder="🔍 Search: arch, cage, pine, trap…" />
        <div className="cats">
          {LIB.map((cat) => {
            const list = filtered(cat.entries);
            if (q && !list.length) return null;
            const isOpen = !!q || !!open[cat.id];
            let lastGroup = '';
            return (
              <div key={cat.id} className={`cat ${isOpen ? 'open' : ''}`}>
                <button className="cathead" onClick={() => setOpen({ ...open, [cat.id]: !open[cat.id] })}>
                  <span>{cat.icon} {cat.label}</span><small>{list.length}</small><b>{isOpen ? '▾' : '▸'}</b>
                </button>
                {isOpen && (
                  <div className="entries">
                    {list.map((e, i) => {
                      const head = e.group && e.group !== lastGroup ? e.group : '';
                      lastGroup = e.group;
                      return (
                        <div key={i}>
                          {head && <div className="egroup">{head}</div>}
                          <button className="entry" draggable
                            onDragStart={(ev) => { ev.dataTransfer.setData('text/plain', JSON.stringify(e.p)); ev.dataTransfer.effectAllowed = 'copy'; }}
                            onClick={() => addPiece(e.p)} title="Drag onto the board, or tap to add">
                            {e.label}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <main
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDrop={(e) => {
          e.preventDefault();
          try {
            const p = JSON.parse(e.dataTransfer.getData('text/plain')) as Params;
            const g = vp.current?.groundAt(e.clientX, e.clientY);
            addPiece(p, g ? { x: g.x, z: g.z } : undefined);
          } catch { /* not a piece */ }
        }}>
        <div ref={host} className="view" />
        <div className="tb">
          <button className={gridOn ? 'on' : ''} onClick={() => setGridOn(!gridOn)}>📏 Grid</button>
          <button className={miniOn ? 'on' : ''} onClick={() => setMiniOn(!miniOn)}>🧍 Mini</button>
          <button onClick={() => setLook(look === 'painted' ? 'plastic' : 'painted')}>{look === 'painted' ? '🎨 Painted' : '⬜ Plain print'}</button>
          <button onClick={() => vp.current?.frame(selId)}>🔍 {selId ? 'Zoom to piece' : 'Whole board'}</button>
        </div>
        {sel && (
          <div className={`info ${fits(sel.p) ? '' : 'bad'}`}>
            <b>{fits(sel.p) ? 'Fits your printer ✓' : 'Too big for the bed: make it smaller'}</b>
            <div>{build(sel.p).name} · {eraLabel(sel.p.era)}</div>
            <div>{build(sel.p).size.x.toFixed(0)} × {build(sel.p).size.z.toFixed(0)} mm · {build(sel.p).size.y.toFixed(0)} mm tall</div>
          </div>
        )}
        {busy && <div className="busy">Building…</div>}
        <span data-ready={busy ? '0' : '1'} id="ready" hidden />
        <div className="dice">
          {sel ? (
            <>
              <button onClick={() => rotateSel(1)} title="Turn (R)">⟳<span className="hide-s"> Turn</span></button>
              <button onClick={() => raiseSel(1)} title="Raise ¼ inch (Page Up)">⬆</button>
              <button onClick={() => raiseSel(-1)} title="Lower (Page Down)" disabled={!sel.y}>⬇</button>
              <button onClick={dupSel} title="Duplicate (Ctrl+D)">⧉<span className="hide-s"> Copy</span></button>
              <button onClick={() => change((p) => randomize(p))} title="New random version">🎲</button>
              <button onClick={removeSel} title="Delete">🗑</button>
            </>
          ) : (
            <>
              <button onClick={doUndo} disabled={!undo.length} title="Undo (Ctrl+Z)">↶ Undo</button>
              <button onClick={doRedo} disabled={!redo.length} title="Redo (Ctrl+Y)">↷</button>
              <span className="hint">Tap a piece to edit it · drag to move it</span>
            </>
          )}
        </div>
      </main>

      <aside className="right">
        {sel ? (
          <>
            <div className="rhead">
              <div className="h">EDIT PIECE</div>
              <div className="seg small">
                <button className={simple ? 'on' : ''} onClick={() => setSimple(true)}>Simple</button>
                <button className={!simple ? 'on' : ''} onClick={() => setSimple(false)}>All options</button>
              </div>
            </div>
            <div className="row">
              <div className="t">Era</div>
              <select value={sel.p.era} onChange={(e) => change((p) => switchEra(p, e.target.value))}>
                {ERAS.map((e) => <option key={e.id} value={e.id}>{e.icon} {e.name}</option>)}
              </select>
            </div>
            {controls.map((c, i) => <ControlRow key={i} c={c} p={sel.p} change={change} />)}
            <div className="row seedrow">
              <div className="t">Variation <b>#{sel.p.seed}</b></div>
              <div className="btnrow">
                <button onClick={() => change({ seed: new Rng(Date.now()).int(1, 999999) })}>🎲 New variation</button>
                <button onClick={() => change((p) => fitPiece({ ...defaults(p.era, p.piece), piece: p.piece, caveItem: p.caveItem, dungeonItem: p.dungeonItem, forestItem: p.forestItem, trapItem: p.trapItem }))}>↺ Reset</button>
                <button onClick={() => void doExport(sel)}>⬇ This piece</button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="h">BOARD</div>
            <div className="row">
              <div className="t">Board size <b>{board.w} × {board.d} in</b></div>
              <div className="stepper">
                <span>Wide</span>
                <button onClick={() => setBoard({ ...board, w: Math.max(4, board.w - 2) })}>−</button><b>{board.w}</b>
                <button onClick={() => setBoard({ ...board, w: Math.min(48, board.w + 2) })}>+</button>
                <span>Deep</span>
                <button onClick={() => setBoard({ ...board, d: Math.max(4, board.d - 2) })}>−</button><b>{board.d}</b>
                <button onClick={() => setBoard({ ...board, d: Math.min(48, board.d + 2) })}>+</button>
              </div>
              <div className="help">The board is just for laying out your scene; every piece prints on its own.</div>
            </div>
            <div className="tips">
              <b>How to build</b>
              <ol>
                <li>Open a category on the left and <b>drag</b> a piece onto the board (or tap it).</li>
                <li><b>Tap</b> a piece to select it, <b>drag</b> to move it. It snaps to the grid.</li>
                <li>Change anything about it on this side: era, style, size, bricks, openings, moss…</li>
                <li>⟳ turns it, ⬆⬇ stack it on a hill or platform, ⧉ copies it.</li>
                <li><b>Export</b> prints everything on the board, laid out on plates.</li>
              </ol>
              <p className="muted small">Keys: R turn · Delete remove · Ctrl+D copy · arrows move · Ctrl+Z undo</p>
            </div>
            <div className="btnrow">
              <button onClick={() => { if (confirm('Clear everything off the board?')) { setBoard({ ...board, items: [] }); setSelId(null); } }}>Clear board</button>
              <button onClick={() => { setBoard(starter()); setSelId(null); }}>Example scene</button>
            </div>
          </>
        )}
      </aside>

      <section className="tray">
        <input className="setname" value={setName} onChange={(e) => setSetName(e.target.value)} aria-label="Board name" />
        <div className="small muted">{totals.pieces} piece{totals.pieces === 1 ? '' : 's'} · {totals.plates} print plate{totals.plates === 1 ? '' : 's'} · about {fmtTime(totals.minutes)} · {Math.round(totals.grams)} g of {FILAMENTS[settings.filament].label} · ${totals.cost.toFixed(2)}</div>
        <div className="trayact">
          <button onClick={doUndo} disabled={!undo.length}>↶</button>
          <button onClick={doRedo} disabled={!redo.length}>↷</button>
          <button className="primary" onClick={() => setModal('export')}>⬇ Export everything</button>
        </div>
      </section>

      <nav className="tabs">
        <button className={tab === 'lib' ? 'on' : ''} onClick={() => setTab('lib')}>🧱 Pieces</button>
        <button className={tab === 'edit' ? 'on' : ''} onClick={() => setTab('edit')}>🎛 {sel ? 'Edit piece' : 'Board'}</button>
        <button className={tab === 'print' ? 'on' : ''} onClick={() => setTab('print')}>🖨 Print ({totals.pieces})</button>
      </nav>

      {toast && <div className="toast">{toast}</div>}

      {modal === 'room' && (
        <Modal title="Generate a whole room" onClose={() => setModal(null)}>
          <p className="muted">A matching set of tiles: walls on floor tiles around the edge, corners, floors, a doorway and props, all on the grid. Pick the era, then the room.</p>
          <RoomPicker onPick={(era, kind, clear) => {
            const placements = makeRoom(era, kind, new Rng(Date.now()).int(1, 99999), 'flat', 0.3);
            const items: BoardItem[] = placements.map((pl) => ({ id: uid(), p: pl.p, x: pl.x, z: pl.z, y: pl.y ?? 0, rot: Math.round(((pl.ry / (Math.PI / 2)) % 4 + 4) % 4) }));
            setBoard((b) => ({ ...b, items: clear ? items : [...b.items, ...items] }));
            setSelId(null);
            setModal(null);
            setTimeout(() => vp.current?.frame(), 300);
          }} />
        </Modal>
      )}

      {modal === 'export' && (
        <Modal title="Export for printing" onClose={() => setModal(null)}>
          <div className="exp">
            <div className="expcard">
              <b>Everything on the board</b>
              <span className="muted">{totals.items.length} pieces on {totals.plates} plate{totals.plates === 1 ? '' : 's'} · about {fmtTime(totals.minutes)}, {Math.round(totals.grams)} g</span>
              <button className="primary" disabled={!board.items.length} onClick={() => { void doExport(); setModal(null); }}>⬇ Download .zip</button>
            </div>
            <div className="expcard">
              <b>Just the selected piece</b>
              <span className="muted">{sel ? build(sel.p).name : 'Select a piece on the board first'}</span>
              <button disabled={!sel} onClick={() => { if (sel) void doExport(sel); setModal(null); }}>⬇ Download STL + 3MF</button>
            </div>
          </div>
          <p className="small muted">The zip holds a 3MF for each build plate (open it in Anycubic Slicer Next: the pieces are already laid out for the 250 × 250 bed) and an STL of every different piece. Print at 0.12–0.16 mm layers to keep the fine texture. Pieces with stalactites, hanging cages or overhanging rock need supports.</p>
        </Modal>
      )}

      {modal === 'sets' && <SetsModal board={board} name={setName} onLoad={(s) => { setBoard(s.board); setSetName(s.name); setSelId(null); setModal(null); setToast(`Opened "${s.name}"`); setTimeout(() => vp.current?.frame(), 300); }} onClose={() => setModal(null)} toast={setToast} />}

      {modal === 'settings' && <SettingsModal s={settings} set={setSettings} onClose={() => setModal(null)} toast={setToast} install={install} installed={installed} canInstall={canInstall} />}

      {modal === 'install' && (
        <Modal title="Get Cypress Forge as an app" onClose={() => setModal(null)}>
          <p className="muted">It installs straight from this page (no app store), gets its own icon, opens full screen and works with no internet once installed.</p>
          <div className="installgrid">
            <div className="expcard"><b>📱 Android: Chrome</b><span>Tap the <b>⋮</b> menu (top right), then <b>Add to Home screen</b> → <b>Install</b>.</span></div>
            <div className="expcard"><b>📱 Android: Samsung Internet</b><span>Tap the <b>☰</b> menu (bottom right), then <b>Add page to</b> → <b>Home screen</b>.</span></div>
            <div className="expcard"><b>💻 Windows / Mac: Chrome or Edge</b><span>Click the <b>install icon</b> (a screen with a down arrow) at the right end of the address bar, or the <b>⋮</b> / <b>…</b> menu → <b>Install Cypress Forge</b> (Edge: <b>Apps</b> → <b>Install this site as an app</b>).</span></div>
            <div className="expcard"><b>🍎 iPhone / iPad: Safari</b><span>Tap <b>Share</b> (the square with an arrow), then <b>Add to Home Screen</b>.</span></div>
          </div>
          <p className="small muted">Already installed? Open it from your home screen, app drawer or Start menu. Your boards and settings stay on this device.</p>
        </Modal>
      )}

      {modal === 'help' && (
        <Modal title="How Cypress Forge works" onClose={() => setModal(null)}>
          <ol className="helplist">
            <li><b>Pieces</b> (left): every piece from every era, in categories. Drag any of them onto the board and mix eras freely.</li>
            <li><b>Tap a piece</b> on the board to select it; drag it to move. It snaps to the 1-inch grid.</li>
            <li><b>Edit piece</b> (right): era, style, size, brick pop-out and spacing, openings, texture, moss/burnt/decay and more. <i>All options</i> shows everything.</li>
            <li>⟳ turns, ⬆⬇ raise/lower for stacking, ⧉ copies, 🎲 rolls a new version, 🗑 deletes.</li>
            <li><b>Export</b> downloads every piece on the board, laid out on 250 × 250 plates for your slicer.</li>
          </ol>
          <p className="small muted">The blue mini is a 28 mm figure on a 25 mm base. Everything is saved in this browser and works offline once loaded.</p>
        </Modal>
      )}
    </div>
  );
}

function RoomPicker({ onPick }: { onPick: (era: string, kind: RoomKind, clear: boolean) => void }) {
  const [era, setEra] = useState('medieval');
  const [clear, setClear] = useState(true);
  return (
    <>
      <div className="chips" style={{ marginBottom: 10 }}>
        {ERAS.map((e) => <button key={e.id} className={era === e.id ? 'on' : ''} onClick={() => setEra(e.id)}>{e.icon} {e.name}</button>)}
      </div>
      <div className="roomgrid">
        {ROOMS.map((r) => <button key={r.id} className="roomopt" onClick={() => onPick(era, r.id as RoomKind, clear)}><b>{r.label}</b><span>{r.help}</span></button>)}
      </div>
      <label className="toggle"><input type="checkbox" checked={clear} onChange={(e) => setClear(e.target.checked)} /><span className="sw" /> Clear the board first</label>
    </>
  );
}

function ControlRow({ c, p, change }: { c: Control; p: Params; change: (n: Partial<Params>) => void }) {
  const d = defaults(p.era, p.piece);
  if (c.kind === 'size') {
    const sq = sqSize(p);
    return (
      <div className="row">
        <div className="t">{c.label ?? 'Size'} <b>{c.lockY ? `${p.sx} square${p.sx === 1 ? '' : 's'}` : `${p.sx} × ${p.sy} squares`}</b></div>
        <div className="stepper">
          <span>{c.lockY ? 'Length' : 'Wide'}</span>
          <button onClick={() => change({ sx: Math.max(1, p.sx - 1) })} aria-label="Smaller">−</button>
          <b>{p.sx}</b>
          <button onClick={() => change({ sx: Math.min(c.maxX, p.sx + 1) })} aria-label="Bigger">+</button>
          {!c.lockY && (<>
            <span>Deep</span>
            <button onClick={() => change({ sy: Math.max(1, p.sy - 1) })} aria-label="Shallower">−</button>
            <b>{p.sy}</b>
            <button onClick={() => change({ sy: Math.min(c.maxY, p.sy + 1) })} aria-label="Deeper">+</button>
          </>)}
        </div>
        <div className="help">{(p.sx * sq).toFixed(1)} × {((c.lockY ? 1 : p.sy) * sq).toFixed(1)} mm</div>
      </div>
    );
  }
  if (c.kind === 'slider') {
    const v = (p[c.key] as number) ?? (d[c.key] as number);
    return <SliderRow c={c} v={v} change={change} reset={d[c.key] as number} />;
  }
  if (c.kind === 'choice') {
    const v = (p[c.key] as string) ?? (d[c.key] as string);
    return (
      <div className="row">
        <div className="t">{c.label}</div>
        <div className="chips">
          {c.options.map((o) => <button key={o.id} className={v === o.id ? 'on' : ''} onClick={() => change({ [c.key]: o.id } as Partial<Params>)}>{o.label}</button>)}
          {c.options.length > 2 && <button className="mini" onClick={() => change({ [c.key]: c.options[Math.floor(Math.random() * c.options.length)].id } as Partial<Params>)} title="Random">🎲</button>}
        </div>
        {c.help && <div className="help">{c.help}</div>}
      </div>
    );
  }
  const v = p[c.key] as boolean;
  return (
    <div className="row">
      <label className="toggle">
        <input type="checkbox" checked={!!v} onChange={(e) => change({ [c.key]: e.target.checked } as Partial<Params>)} />
        <span className="sw" /> {c.label}
      </label>
      {c.help && <div className="help">{c.help}</div>}
    </div>
  );
}

/** Slider that shows the value while dragging and only rebuilds when you let go (heavy pieces stay smooth). */
function SliderRow({ c, v, change, reset }: { c: Extract<Control, { kind: 'slider' }>; v: number; change: (n: Partial<Params>) => void; reset: number }) {
  const [live, setLive] = useState(v);
  useEffect(() => setLive(v), [v]);
  const commit = (x: number) => change({ [c.key]: x } as Partial<Params>);
  const roll = () => { const steps = Math.round((c.max - c.min) / c.step); commit(+(c.min + Math.round(Math.random() * steps) * c.step).toFixed(3)); };
  return (
    <div className="row">
      <div className="t">{c.label} <b>{c.fmt(live)}</b></div>
      <div className="sl">
        <input type="range" min={c.min} max={c.max} step={c.step} value={live} aria-label={c.label}
          onChange={(e) => setLive(+e.target.value)}
          onPointerUp={(e) => commit(+(e.target as HTMLInputElement).value)}
          onKeyUp={(e) => commit(+(e.target as HTMLInputElement).value)} />
        <button className="mini" onClick={roll} title="Random">🎲</button>
        <button className="mini" onClick={() => commit(reset)} title="Reset">↺</button>
      </div>
      {c.help && <div className="help">{c.help}</div>}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="mhead"><h2>{title}</h2><button onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

function SetsModal({ board, name, onLoad, onClose, toast }: { board: Board; name: string; onLoad: (s: Saved) => void; onClose: () => void; toast: (s: string) => void }) {
  const [saved, setSaved] = useState<Saved[]>(() => load(LS.sets, []));
  const file = useRef<HTMLInputElement>(null);
  const persist = (s: Saved[]) => { setSaved(s); save(LS.sets, s); };
  return (
    <Modal title="My boards" onClose={onClose}>
      <div className="btnrow">
        <button className="primary" disabled={!board.items.length} onClick={() => {
          persist([{ name, board, saved: new Date().toLocaleString() }, ...saved.filter((x) => x.name !== name)]);
          toast(`Saved "${name}"`);
        }}>💾 Save "{name}"</button>
        <button disabled={!board.items.length} onClick={() => download(JSON.stringify({ name, board }), `${name}.forge.json`, 'application/json')}>⬇ Share as a file</button>
        <button onClick={() => file.current?.click()}>📂 Open a file</button>
        <input ref={file} type="file" accept=".json" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const s = JSON.parse(await f.text());
            if (!s.board?.items) throw new Error();
            onLoad({ name: s.name ?? f.name, board: s.board, saved: '' });
          } catch { toast('That file is not a Cypress Forge board.'); }
        }} />
      </div>
      <div className="saved">
        {saved.length === 0 && <p className="muted">No saved boards yet.</p>}
        {saved.map((s) => (
          <div key={s.name} className="savedrow">
            <div><b>{s.name}</b><div className="small muted">{s.board.items.length} pieces · {s.saved}</div></div>
            <div className="btnrow">
              <button onClick={() => onLoad(s)}>Open</button>
              <button onClick={() => { if (confirm(`Delete "${s.name}"?`)) persist(saved.filter((x) => x.name !== s.name)); }}>🗑</button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ---------------- Settings ----------------
type SecId = 'display' | 'build' | 'pieces' | 'printer' | 'export' | 'app';
const SECTIONS: { id: SecId; label: string }[] = [
  { id: 'display', label: '🖥 Display' },
  { id: 'build', label: '🧱 Building' },
  { id: 'pieces', label: '✨ New pieces' },
  { id: 'printer', label: '🖨 Printer' },
  { id: 'export', label: '⬇ Export' },
  { id: 'app', label: '📲 App & data' },
];

function Opt<T extends string>({ label, help, value, options, onChange }: { label: string; help?: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="row">
      <div className="t">{label}</div>
      <div className="chips">{options.map((o) => <button key={o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>)}</div>
      {help && <div className="help">{help}</div>}
    </div>
  );
}
function Tog({ label, help, value, onChange }: { label: string; help?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="row">
      <label className="toggle"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /><span className="sw" /> {label}</label>
      {help && <div className="help">{help}</div>}
    </div>
  );
}
function Num({ label, help, value, min, max, step, fmt, onChange }: { label: string; help?: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void }) {
  const [live, setLive] = useState(value);
  useEffect(() => setLive(value), [value]);
  return (
    <div className="row">
      <div className="t">{label} <b>{fmt(live)}</b></div>
      <div className="sl"><input type="range" min={min} max={max} step={step} value={live} aria-label={label} onChange={(e) => setLive(+e.target.value)} onPointerUp={(e) => onChange(+(e.target as HTMLInputElement).value)} onKeyUp={(e) => onChange(+(e.target as HTMLInputElement).value)} /></div>
      {help && <div className="help">{help}</div>}
    </div>
  );
}
function MM({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="mm"><span>{label}</span>
      <span className="mmin"><input type="number" min={80} max={1000} value={value} onChange={(e) => { const v = Math.round(+e.target.value); if (v >= 80 && v <= 1000) onChange(v); }} /> mm</span>
    </label>
  );
}

function SettingsModal({ s, set, onClose, toast, install, installed, canInstall }: { s: Settings; set: (n: Partial<Settings>) => void; onClose: () => void; toast: (t: string) => void; install: () => void; installed: boolean; canInstall: boolean }) {
  const [sec, setSec] = useState<SecId>('display');
  const [offline, setOffline] = useState<'checking' | 'ready' | 'no'>('checking');
  const [usage, setUsage] = useState('');
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    (async () => {
      try {
        const ok = !!navigator.serviceWorker?.controller && (await caches.keys()).some((k) => k.startsWith('forge'));
        setOffline(ok ? 'ready' : 'no');
      } catch { setOffline('no'); }
      try { const e = await navigator.storage?.estimate(); if (e?.usage != null) setUsage(`${(e.usage / 1048576).toFixed(1)} MB`); } catch { /* not supported */ }
    })();
  }, []);
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const backup = () => {
    const data: Record<string, string | null> = {};
    for (const k of ['forge-board-v2', 'forge-boards-v2', 'forge-settings']) data[k] = localStorage.getItem(k);
    download(JSON.stringify({ app: 'cypress-forge', version: APP_VERSION, data }), `cypress-forge-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  };
  const checkUpdate = async () => {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
      const r = await fetch('./index.html', { cache: 'no-store' });
      const html = await r.text();
      const cur = [...document.scripts].map((x) => x.src.split('/').pop()).find((x) => x?.startsWith('index-'));
      if (cur && !html.includes(cur)) { toast('Update found. Restarting…'); setTimeout(() => location.reload(), 900); }
      else toast(`You have the latest version (${APP_VERSION}).`);
    } catch { toast('Could not check right now (are you offline?).'); }
  };
  const printer = PRINTERS.find((p) => p.id === s.printer);
  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="settings">
        <nav className="setnav">
          {SECTIONS.map((x) => <button key={x.id} className={sec === x.id ? 'on' : ''} onClick={() => setSec(x.id)}>{x.label}</button>)}
        </nav>
        <div className="setbody">
          {sec === 'display' && (<>
            <Opt label="Graphics quality" value={s.quality} onChange={(v) => set({ quality: v })} options={[{ id: 'auto', label: 'Auto' }, { id: 'high', label: 'High' }, { id: 'fast', label: 'Fast' }]} help="High adds soft corner shading and sharper edges. Fast is smoother on phones and older laptops. Auto picks for this device." />
            <Tog label="Shadows" value={s.shadows} onChange={(v) => set({ shadows: v })} />
            <Tog label="Corner shading (ambient occlusion)" value={s.ao} onChange={(v) => set({ ao: v })} help={isHQ() ? 'Darkens cracks and corners so detail reads like a painted model.' : 'Only works with High quality.'} />
            <Opt label="Background" value={s.background} onChange={(v) => set({ background: v })} options={(Object.keys(BACKGROUNDS) as Settings['background'][]).map((k) => ({ id: k, label: BACKGROUNDS[k].label }))} />
            <Opt label="How pieces look" value={s.look} onChange={(v) => set({ look: v })} options={[{ id: 'painted', label: '🎨 Painted' }, { id: 'plastic', label: '⬜ Plain print' }]} />
            <Tog label="Show the grid" value={s.grid} onChange={(v) => set({ grid: v })} />
            <Tog label="Show the 28 mm mini for scale" value={s.mini} onChange={(v) => set({ mini: v })} />
            <Num label="Camera turn and zoom speed" value={s.rotateSpeed} min={0.3} max={2} step={0.1} fmt={pct} onChange={(v) => set({ rotateSpeed: v })} />
          </>)}
          {sec === 'build' && (<>
            <Opt label="Snap pieces to" value={s.snap} onChange={(v) => set({ snap: v })} options={[{ id: 'square', label: 'Whole squares' }, { id: 'half', label: 'Half squares' }, { id: 'quarter', label: 'Quarter squares' }, { id: 'off', label: 'Free (no snap)' }]} help="Props and trees always snap at least to half squares." />
            <Opt label="Edit panel opens with" value={s.editorMode} onChange={(v) => set({ editorMode: v })} options={[{ id: 'simple', label: 'Simple options' }, { id: 'all', label: 'All options' }]} />
            <Tog label="Ask before deleting a piece" value={s.confirmDelete} onChange={(v) => set({ confirmDelete: v })} />
            <div className="tips small"><b>Shortcuts</b><br />R turn · Shift+R turn back · Delete remove · Ctrl+D copy · arrow keys move · Page Up/Down raise/lower · Ctrl+Z undo · Ctrl+Y redo · Esc deselect</div>
          </>)}
          {sec === 'pieces' && (<>
            <p className="small muted">Every piece you add to the board starts with these. You can still change each piece afterwards.</p>
            <Opt label="Grid size" value={s.defGrid} onChange={(v) => set({ defGrid: v })} options={[{ id: 'in', label: '1 inch (D&D standard)' }, { id: 'mm25', label: '25 mm' }]} />
            <Opt label="Base" value={s.defBase} onChange={(v) => set({ defBase: v })} options={[{ id: 'flat', label: 'Flat' }, { id: 'magnet', label: 'Magnets' }, { id: 'clip', label: 'Clip slots' }, { id: 'none', label: 'No base' }]} />
            {s.defBase === 'magnet' && <Opt label="Magnet size" value={s.defMagnet} onChange={(v) => set({ defMagnet: v })} options={[{ id: '5x2', label: '5×2 mm' }, { id: '6x2', label: '6×2 mm' }, { id: '6x3', label: '6×3 mm' }, { id: '8x3', label: '8×3 mm' }]} help="Holes are made 0.3 mm bigger than the magnet so they press in." />}
            <Num label="Wear and damage" value={s.defWear} min={0} max={1} step={0.05} fmt={pct} onChange={(v) => set({ defWear: v })} />
            <Num label="Surface texture" value={s.defTexture} min={0} max={1} step={0.05} fmt={pct} onChange={(v) => set({ defTexture: v })} />
            <Num label="Detail depth" value={s.defDetail} min={0.5} max={1.6} step={0.05} fmt={pct} onChange={(v) => set({ defDetail: v })} />
            <button onClick={() => set({ defGrid: DEFAULTS.defGrid, defBase: DEFAULTS.defBase, defMagnet: DEFAULTS.defMagnet, defWear: DEFAULTS.defWear, defTexture: DEFAULTS.defTexture, defDetail: DEFAULTS.defDetail })}>↺ Reset these</button>
          </>)}
          {sec === 'printer' && (<>
            <div className="row">
              <div className="t">Printer</div>
              <select value={s.printer} onChange={(e) => { const p = PRINTERS.find((x) => x.id === e.target.value)!; set(p.id === 'custom' ? { printer: p.id } : { printer: p.id, bedW: p.w, bedD: p.d, bedH: p.h }); }}>
                {PRINTERS.map((p) => <option key={p.id} value={p.id}>{p.label}{p.id !== 'custom' ? ` (${p.w} × ${p.d} × ${p.h})` : ''}</option>)}
              </select>
              <div className="help">Pieces are packed onto plates this size when you export.</div>
            </div>
            <div className="row mmrow">
              <MM label="Bed width" value={s.bedW} onChange={(v) => set({ bedW: v, printer: 'custom' })} />
              <MM label="Bed depth" value={s.bedD} onChange={(v) => set({ bedD: v, printer: 'custom' })} />
              <MM label="Max height" value={s.bedH} onChange={(v) => set({ bedH: v, printer: 'custom' })} />
            </div>
            <Opt label="Layer height" value={String(s.layer) as any} onChange={(v) => set({ layer: +v })} options={['0.08', '0.12', '0.16', '0.2', '0.28'].map((x) => ({ id: x as any, label: `${x} mm` }))} help="0.12–0.16 mm keeps the brick and wood texture crisp. Used for time estimates and the README." />
            <Num label="Infill" value={s.infill} min={5} max={50} step={5} fmt={(v) => `${v} %`} onChange={(v) => set({ infill: v })} />
            <Opt label="Filament" value={s.filament} onChange={(v) => set({ filament: v })} options={(Object.keys(FILAMENTS) as Settings['filament'][]).map((k) => ({ id: k, label: FILAMENTS[k].label }))} />
            <div className="row">
              <div className="t">Filament price <b>${s.costKg.toFixed(2)} / kg</b></div>
              <div className="stepper">
                <button onClick={() => set({ costKg: Math.max(5, s.costKg - 1) })}>−</button>
                <input className="numin" type="number" min={5} max={200} value={s.costKg} onChange={(e) => +e.target.value > 0 && set({ costKg: +e.target.value })} />
                <button onClick={() => set({ costKg: Math.min(200, s.costKg + 1) })}>+</button>
              </div>
            </div>
            <Num label="Print speed adjustment" value={s.speed} min={0.5} max={2.5} step={0.1} fmt={pct} onChange={(v) => set({ speed: v })} help="If real prints finish faster or slower than the estimate, adjust this to match." />
            <p className="small muted">Current: {printer?.label ?? 'Custom'} · {s.bedW} × {s.bedD} × {s.bedH} mm</p>
          </>)}
          {sec === 'export' && (<>
            <Opt label="Files in the download" value={s.files} onChange={(v) => set({ files: v })} options={[{ id: 'both', label: '3MF plates + STLs' }, { id: '3mf', label: 'Only 3MF plates' }, { id: 'stl', label: 'Only STLs' }]} help="3MF plates open in Anycubic Slicer Next already laid out. STLs are one file per different piece." />
            <Tog label="Include connector clips when pieces use clip slots" value={s.clips} onChange={(v) => set({ clips: v })} />
            <Tog label="Include a README with print settings" value={s.readme} onChange={(v) => set({ readme: v })} />
          </>)}
          {sec === 'app' && (<>
            <div className="row">
              <div className="t">Install</div>
              {installed ? <div className="okline">✓ You're using the installed app.</div> : (
                <>
                  <button className="primary" onClick={() => void install()}>📲 {canInstall ? 'Install Cypress Forge' : 'How to install'}</button>
                  <div className="help">Adds Cypress Forge to your home screen or Start menu so it opens like a normal app and works offline.</div>
                </>
              )}
            </div>
            <div className="row">
              <div className="t">Works offline</div>
              <div className={offline === 'ready' ? 'okline' : 'muted small'}>{offline === 'checking' ? 'Checking…' : offline === 'ready' ? '✓ Saved on this device: works with no internet' : 'Not saved yet: reload once while online and it will be.'}</div>
              {usage && <div className="help">Using {usage} of storage on this device.</div>}
            </div>
            <div className="row">
              <div className="t">Help</div>
              <button onClick={() => { onClose(); setTimeout(() => document.querySelector<HTMLButtonElement>('.helpbtn')?.click(), 50); }}>❓ How Cypress Forge works</button>
            </div>
            <div className="row">
              <div className="t">Version <b>{APP_VERSION}</b></div>
              <button onClick={() => void checkUpdate()}>🔄 Check for updates</button>
            </div>
            <div className="row">
              <div className="t">Back up</div>
              <div className="btnrow">
                <button onClick={backup}>💾 Back up everything</button>
                <button onClick={() => file.current?.click()}>📂 Restore a backup</button>
              </div>
              <div className="help">One file with your current board, all saved boards and these settings. Use it to move to another device.</div>
              <input ref={file} type="file" accept=".json" hidden onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const j = JSON.parse(await f.text());
                  if (j.app !== 'cypress-forge' || !j.data) throw new Error();
                  for (const [k, v] of Object.entries(j.data as Record<string, string | null>)) if (v != null) localStorage.setItem(k, v);
                  toast('Backup restored. Restarting…');
                  setTimeout(() => location.reload(), 900);
                } catch { toast('That file is not a Cypress Forge backup.'); }
              }} />
            </div>
            <div className="row danger">
              <div className="t">Reset</div>
              <div className="btnrow">
                <button onClick={() => { if (confirm('Put every setting back to how it started?')) { set({ ...DEFAULTS }); toast('Settings reset.'); } }}>↺ Reset settings</button>
                <button className="warn" onClick={() => {
                  if (!confirm('Erase your board, all saved boards and settings from this device? This cannot be undone.')) return;
                  for (const k of Object.keys(localStorage)) if (k.startsWith('forge')) localStorage.removeItem(k);
                  location.reload();
                }}>🗑 Erase everything</button>
              </div>
            </div>
          </>)}
        </div>
      </div>
    </Modal>
  );
}
