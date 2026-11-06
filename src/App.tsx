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
  const fine = it.p.piece === 'scatter' || it.p.piece === 'forest' ? 0.5 : 1; // props snap to half squares
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
  const [simple, setSimple] = useState<boolean>(() => load(LS.simple, false));
  const [look, setLook] = useState<Look>('painted');
  const [gridOn, setGridOn] = useState(true);
  const [miniOn, setMiniOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<null | 'room' | 'sets' | 'export' | 'help'>(null);
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
    const hq = !matchMedia('(pointer: coarse)').matches && window.innerWidth > 900;
    const v = new Viewport(host.current!, hq);
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
    setTimeout(() => v.frame(), 50);
    return () => v.dispose();
  }, []);
  useEffect(() => save(LS.state, board), [board]);
  useEffect(() => save(LS.simple, simple), [simple]);
  useEffect(() => vp.current?.setGrid(gridOn), [gridOn]);
  useEffect(() => vp.current?.setMini(miniOn), [miniOn]);
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
  }, [board, look, selId]);

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
    const it: BoardItem = { id: uid(), p: { ...p, seed: new Rng(Date.now()).int(1, 999999) }, x: 0, z: 0, y: 0, rot: 0 };
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

  const removeSel = () => { if (!selId) return; setBoard((b) => ({ ...b, items: b.items.filter((i) => i.id !== selId) })); setSelId(null); };
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
      if (clipBases) items.push({ name: `Connector clips x${clipBases * 4}`, geo: printGeometry(clipSet(Math.min(48, clipBases * 4)).parts) });
    } catch { /* a piece failed; shown elsewhere */ }
    const plates = items.length ? arrange(items).length : 0;
    return { grams, minutes, pieces: board.items.length, plates, items };
  }, [board]);

  const doExport = async (only?: BoardItem) => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    const items = only ? [{ name: build(only.p).name, geo: printGeometry(build(only.p).parts) }] : totals.items;
    if (!items.length) { setToast('Put some pieces on the board first.'); setBusy(false); return; }
    const name = only ? build(only.p).name : setName;
    const { zip, plates } = exportZip(items, name);
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
        <div className="sub">Printable D&amp;D terrain · 28 mm minis · Kobra S1 bed 250 × 250 mm</div>
        <div className="hbtns">
          <button onClick={() => setModal('room')}>✨ <span className="hide-s">Generate a</span> room</button>
          <button onClick={() => setModal('sets')}>📂 <span className="hide-s">My boards</span></button>
          <button onClick={() => setModal('help')} aria-label="Help">?</button>
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
        <div className="small muted">{totals.pieces} piece{totals.pieces === 1 ? '' : 's'} · {totals.plates} print plate{totals.plates === 1 ? '' : 's'} · about {fmtTime(totals.minutes)} · {Math.round(totals.grams)} g of filament</div>
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
