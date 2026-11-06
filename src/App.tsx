import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ERAS, PIECES, eraById, paintFor, type PieceKind } from './gen/eras';
import { defaults, fitPiece, randomize, switchEra, sqSize, type Params } from './gen/params';
import { generate, clipSet, type Piece } from './gen/generate';
import { Viewport, type Look } from './ui/viewport';
import { controlsFor, type Control } from './ui/controls';
import { makeRoom, ROOMS, type Placement, type RoomKind } from './ui/room';
import { printGeometry, estimate, fmtTime, exportZip, download, arrange, BED, type Item } from './export/export';
import { Rng } from './gen/core';

type SetItem = { id: string; p: Params | null; clips?: number; qty: number; thumb?: string; name: string };
type Saved = { name: string; items: SetItem[]; saved: string };

const LS = { state: 'forge-state-v1', sets: 'forge-sets-v1', simple: 'forge-simple' };
const load = <T,>(k: string, d: T): T => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
};
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const key = (p: Params) => JSON.stringify(p);
const uid = () => Math.random().toString(36).slice(2, 9);

// keep recently built pieces so the room preview and export don't rebuild them
const cache = new Map<string, Piece>();
function build(p: Params) {
  const k = key(p);
  let pc = cache.get(k);
  if (!pc) {
    pc = generate(p);
    cache.set(k, pc);
    if (cache.size > 60) cache.delete(cache.keys().next().value!);
  }
  return pc;
}

export default function App() {
  const initial = load<{ p: Params; set: SetItem[]; setName: string } | null>(LS.state, null);
  const [p, setP] = useState<Params>(() => (initial?.p ? { ...defaults(initial.p.era, initial.p.piece), ...initial.p } : defaults('medieval', 'wall')));
  const [undo, setUndo] = useState<Params[]>([]);
  const [redo, setRedo] = useState<Params[]>([]);
  const [set, setSet] = useState<SetItem[]>(initial?.set ?? []);
  const [setName, setSetName] = useState(initial?.setName ?? 'My terrain');
  const [simple, setSimple] = useState<boolean>(() => load(LS.simple, false));
  const [look, setLook] = useState<Look>('painted');
  const [gridOn, setGridOn] = useState(true);
  const [miniOn, setMiniOn] = useState(true);
  const [info, setInfo] = useState<{ size: number[]; grams: number; minutes: number; fits: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [room, setRoom] = useState<Placement[] | null>(null);
  const [modal, setModal] = useState<null | 'room' | 'sets' | 'export' | 'help'>(null);
  const [tab, setTab] = useState<'era' | 'piece' | 'edit' | 'set'>('edit');
  const [toast, setToast] = useState('');
  const host = useRef<HTMLDivElement>(null);
  const vp = useRef<Viewport | null>(null);
  const lastShape = useRef('');
  const era = eraById(p.era);

  useEffect(() => {
    vp.current = new Viewport(host.current!);
    // used by the automated screenshot checks
    (window as any).__forge = { set: (q: Params) => { setRoom(null); setP(q); }, room: (k: RoomKind, seed: number) => setRoom(makeRoom(p.era, k, seed, p.base, p.wear)) };
    return () => vp.current?.dispose();
  }, []);
  useEffect(() => save(LS.state, { p, set: set.map((s) => ({ ...s, thumb: undefined })), setName }), [p, set, setName]);
  useEffect(() => save(LS.simple, simple), [simple]);
  useEffect(() => { vp.current?.setLook(look, paintFor(era)); }, [look, era]);
  useEffect(() => vp.current?.setGrid(gridOn), [gridOn]);
  useEffect(() => vp.current?.setMini(miniOn), [miniOn]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3200); return () => clearTimeout(t); } }, [toast]);

  // rebuild the piece a moment after any change
  useEffect(() => {
    if (room) return;
    setBusy(true);
    const t = setTimeout(() => {
      try {
        const piece = build(p);
        const shape = `${p.piece}|${p.sx}|${p.sy}|${p.era}`;
        vp.current?.setLook(look, paintFor(era));
        vp.current?.show([{ parts: piece.parts }], shape !== lastShape.current);
        lastShape.current = shape;
        const g = printGeometry(piece.parts);
        const est = estimate(g);
        const s = piece.size;
        setInfo({ size: [s.x, s.z, s.y], ...est, fits: s.x <= BED.w - 10 && s.z <= BED.d - 10 && s.y <= BED.h || (s.z <= BED.w - 10 && s.x <= BED.d - 10 && s.y <= BED.h) });
      } catch (e) {
        console.error(e);
        setToast('That combination did not build. Try another setting.');
      }
      setBusy(false);
    }, 90);
    return () => clearTimeout(t);
  }, [p, room]);

  // room preview
  useEffect(() => {
    if (!room) return;
    setBusy(true);
    const t = setTimeout(() => {
      const items = room.map((pl) => ({ parts: build(pl.p).parts, x: pl.x, z: pl.z, ry: pl.ry, y: pl.y }));
      vp.current?.setLook(look, paintFor(era));
      vp.current?.show(items, true);
      lastShape.current = '';
      setBusy(false);
    }, 30);
    return () => clearTimeout(t);
  }, [room]);

  const change = useCallback((next: Partial<Params> | ((q: Params) => Params)) => {
    setRoom(null);
    setP((cur) => {
      const n = typeof next === 'function' ? next(cur) : { ...cur, ...next };
      if (key(n) === key(cur)) return cur;
      setUndo((u) => [...u.slice(-60), cur]);
      setRedo([]);
      return n;
    });
  }, []);

  const doUndo = () => { const prev = undo[undo.length - 1]; if (!prev) return; setUndo(undo.slice(0, -1)); setRedo([p, ...redo]); setP(prev); setRoom(null); };
  const doRedo = () => { const nx = redo[0]; if (!nx) return; setRedo(redo.slice(1)); setUndo([...undo, p]); setP(nx); setRoom(null); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey) change((q) => randomize(q));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const addToSet = (params: Params, qty = 1, thumb?: string) => {
    setSet((s) => {
      const k = key(params);
      const i = s.findIndex((x) => x.p && key(x.p) === k);
      if (i >= 0) return s.map((x, j) => (j === i ? { ...x, qty: x.qty + qty, thumb: x.thumb ?? thumb } : x));
      return [...s, { id: uid(), p: params, qty, thumb, name: build(params).name }];
    });
  };

  const addCurrent = () => {
    addToSet(p, 1, vp.current?.snapshot());
    setToast(`Added "${build(p).name}" to the print set`);
    if (p.base === 'clip' && !set.some((s) => s.clips)) setSet((s) => [...s, { id: uid(), p: null, clips: 12, qty: 1, name: 'Connector clips x12' }]);
  };

  const totals = useMemo(() => {
    let grams = 0, minutes = 0, pieces = 0;
    const items: Item[] = [];
    for (const it of set) {
      const pc = it.p ? build(it.p) : clipSet(it.clips ?? 12);
      const g = printGeometry(pc.parts);
      const est = estimate(g);
      grams += est.grams * it.qty;
      minutes += est.minutes * it.qty;
      pieces += it.qty;
      for (let i = 0; i < it.qty; i++) items.push({ name: it.name, geo: g });
    }
    const plates = items.length ? arrange(items).length : 0;
    return { grams, minutes, pieces, plates, items };
  }, [set]);

  const doExport = async () => {
    if (!set.length) { setToast('Add some pieces to the print set first.'); return; }
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    // unique file names when two different pieces share a name
    const seen = new Map<string, number>();
    const named: Item[] = [];
    for (const it of set) {
      const n = (seen.get(it.name) ?? 0) + 1;
      seen.set(it.name, n);
      const name = n > 1 ? `${it.name} v${n}` : it.name;
      const g = printGeometry((it.p ? build(it.p) : clipSet(it.clips ?? 12)).parts);
      for (let i = 0; i < it.qty; i++) named.push({ name, geo: g });
    }
    const { zip, plates } = exportZip(named, setName);
    download(zip, `${setName.replace(/[^\w\- ]+/g, '').trim() || 'terrain'}.zip`, 'application/zip');
    setBusy(false);
    setToast(`Downloaded ${named.length} pieces on ${plates} plate${plates === 1 ? '' : 's'}`);
  };

  const exportOne = () => {
    const pc = build(p);
    const { zip } = exportZip([{ name: pc.name, geo: printGeometry(pc.parts) }], pc.name);
    download(zip, `${pc.name.replace(/[^\w\- ]+/g, '').trim()}.zip`, 'application/zip');
  };

  const controls = controlsFor(p).filter((c) => !simple || c.simple);
  const fmtIn = (mm: number) => `${(mm / 25.4).toFixed(mm < 60 ? 2 : 1)} in`;

  return (
    <div className={`app tab-${tab}`}>
      <header>
        <div className="logo">Cypress <span>Forge</span></div>
        <div className="sub">Printable D&amp;D terrain · 28 mm minis · Kobra S1 bed 250 × 250 mm</div>
        <div className="hbtns">
          <button onClick={() => setModal('room')}>✨ <span className="hide-s">Generate a</span> room</button>
          <button onClick={() => setModal('sets')}>📂 <span className="hide-s">My sets</span></button>
          <button onClick={() => setModal('help')} aria-label="Help">?</button>
          <button className="primary" onClick={() => setModal('export')}>⬇ Export</button>
        </div>
      </header>

      <aside className="left">
        <div className="h h-era">1 · PICK AN ERA</div>
        <div className="eras">
          {ERAS.map((e) => (
            <button key={e.id} className={`era ${p.era === e.id ? 'on' : ''}`} onClick={() => change((q) => switchEra(q, e.id))}>
              <span className="e">{e.icon}</span> {e.name}<small>{e.blurb}</small>
            </button>
          ))}
        </div>
        <div className="h h-piece" style={{ marginTop: 18 }}>2 · PICK A PIECE</div>
        <div className="pieces">
          {PIECES.map((pc) => (
            <button key={pc.id} title={pc.help} className={`pc ${p.piece === pc.id ? 'on' : ''}`} onClick={() => change((q) => fitPiece({ ...q, piece: pc.id as PieceKind }))}>
              <i>{pc.icon}</i>{pc.label}
            </button>
          ))}
        </div>
      </aside>

      <main>
        <div ref={host} className="view" />
        <div className="tb">
          <button className={gridOn ? 'on' : ''} onClick={() => setGridOn(!gridOn)}>📏 Grid</button>
          <button className={miniOn ? 'on' : ''} onClick={() => setMiniOn(!miniOn)}>🧍 Mini</button>
          <button onClick={() => setLook(look === 'painted' ? 'plastic' : 'painted')}>{look === 'painted' ? '🎨 Painted' : '⬜ Plain print'}</button>
          {room && <button className="on" onClick={() => setRoom(null)}>‹ Back to the piece</button>}
        </div>
        {!room && info && (
          <div className={`info ${info.fits ? '' : 'bad'}`} onClick={(e) => e.currentTarget.classList.toggle('open')}>
            <b>{info.fits ? 'Fits your printer ✓' : 'Too big for the bed: make it smaller'}</b>
            <div>{build(p).name}</div>
            <div>{info.size[0].toFixed(1)} × {info.size[1].toFixed(1)} mm · {info.size[2].toFixed(0)} mm tall ({fmtIn(info.size[2])})</div>
            <div>About {fmtTime(info.minutes)} and {Math.round(info.grams)} g of filament</div>
          </div>
        )}
        {room && <div className="info"><b>Room preview</b><div>{room.length} tiles laid out on the grid</div><div>Click "Add all to print set" to keep it.</div></div>}
        {busy && <div className="busy">Building…</div>}
        <span data-ready={busy ? '0' : '1'} id="ready" hidden />
        <div className="dice">
          {room ? (
            <>
              <button onClick={() => setModal('room')}>🎲 Another room</button>
              <button className="primary" onClick={() => { for (const pl of room) addToSet(pl.p, 1); setToast(`Added ${room.length} tiles to the print set`); }}>＋ Add all to print set</button>
            </>
          ) : (
            <>
              <button onClick={() => change((q) => randomize(q))} title="New random version (R)">🎲<span className="hide-s"> Randomize</span></button>
              <button onClick={doUndo} disabled={!undo.length} title="Undo (Ctrl+Z)">↶</button>
              <button onClick={doRedo} disabled={!redo.length} title="Redo (Ctrl+Y)">↷</button>
              <button className="primary" onClick={addCurrent}>＋ Add<span className="hide-s"> to print set</span></button>
            </>
          )}
        </div>
      </main>

      <aside className="right">
        <div className="rhead">
          <div className="h">3 · MAKE IT YOURS</div>
          <div className="seg small">
            <button className={simple ? 'on' : ''} onClick={() => setSimple(true)}>Simple</button>
            <button className={!simple ? 'on' : ''} onClick={() => setSimple(false)}>All options</button>
          </div>
        </div>
        {controls.map((c, i) => <ControlRow key={i} c={c} p={p} change={change} />)}
        <div className="row seedrow">
          <div className="t">Variation <b>#{p.seed}</b></div>
          <div className="btnrow">
            <button onClick={() => change({ seed: new Rng(Date.now()).int(1, 999999) })}>🎲 New variation</button>
            <button onClick={() => change(defaults(p.era, p.piece))}>↺ Reset all</button>
          </div>
          <div className="help">Same settings, different stones, cracks and layout.</div>
        </div>
      </aside>

      <section className="tray">
        <div className="trayhead">
          <input className="setname" value={setName} onChange={(e) => setSetName(e.target.value)} aria-label="Print set name" />
          <div className="small muted">{totals.pieces} piece{totals.pieces === 1 ? '' : 's'} · {totals.plates} plate{totals.plates === 1 ? '' : 's'} · about {fmtTime(totals.minutes)} · {Math.round(totals.grams)} g</div>
        </div>
        <div className="cards">
          {set.length === 0 && <div className="empty">Your print set is empty. Make a piece you like and tap <b>＋ Add to print set</b>, or generate a whole room.</div>}
          {set.map((it) => (
            <div key={it.id} className="card">
              <button className="thumb" onClick={() => { if (it.p) { change(it.p); setTab('edit'); } }} title="Edit this piece">
                {it.thumb ? <img src={it.thumb} alt="" /> : <span>{it.p ? PIECES.find((x) => x.id === it.p!.piece)?.icon : '🔗'}</span>}
              </button>
              <div className="cname" title={it.name}>{it.name}</div>
              <div className="qty">
                <button onClick={() => setSet((s) => s.map((x) => (x.id === it.id ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))} aria-label="One less">−</button>
                <b>{it.qty}</b>
                <button onClick={() => setSet((s) => s.map((x) => (x.id === it.id ? { ...x, qty: x.qty + 1 } : x)))} aria-label="One more">+</button>
                <button className="x" onClick={() => setSet((s) => s.filter((x) => x.id !== it.id))} aria-label="Remove">🗑</button>
              </div>
            </div>
          ))}
        </div>
        <div className="trayact">
          <button className="primary" onClick={() => setModal('export')}>⬇ Export print set</button>
          {set.length > 0 && <button onClick={() => { if (confirm('Clear the whole print set?')) setSet([]); }}>Clear</button>}
        </div>
      </section>

      <nav className="tabs">
        {(['era', 'piece', 'edit', 'set'] as const).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t === 'era' ? `${era.icon} Era` : t === 'piece' ? '🧱 Piece' : t === 'edit' ? '🎛 Customize' : `🖨 Print set (${totals.pieces})`}
          </button>
        ))}
      </nav>

      {toast && <div className="toast">{toast}</div>}

      {modal === 'room' && (
        <Modal title="Generate a whole room" onClose={() => setModal(null)}>
          <p className="muted">A matching set of {era.name.toLowerCase()} tiles: walls on floor tiles around the edge, corners, floors, a doorway and props. Everything lines up on the 1-inch grid.</p>
          <div className="roomgrid">
            {ROOMS.map((r) => (
              <button key={r.id} className="roomopt" onClick={() => {
                setRoom(makeRoom(p.era, r.id as RoomKind, new Rng(Date.now()).int(1, 99999), p.base, p.wear));
                setModal(null);
              }}>
                <b>{r.label}</b><span>{r.help}</span>
              </button>
            ))}
          </div>
          <p className="small muted">Uses your current era, base type and wear. Change those first if you like.</p>
        </Modal>
      )}

      {modal === 'export' && (
        <Modal title="Export for printing" onClose={() => setModal(null)}>
          <div className="exp">
            <div className="expcard">
              <b>This piece</b>
              <span className="muted">{build(p).name}</span>
              <button className="primary" onClick={() => { exportOne(); setModal(null); }}>⬇ Download STL + 3MF</button>
            </div>
            <div className="expcard">
              <b>Whole print set</b>
              <span className="muted">{totals.pieces} pieces on {totals.plates} plate{totals.plates === 1 ? '' : 's'} · about {fmtTime(totals.minutes)}, {Math.round(totals.grams)} g</span>
              <button className="primary" disabled={!set.length} onClick={() => { void doExport(); setModal(null); }}>⬇ Download .zip</button>
            </div>
          </div>
          <p className="small muted">The zip holds a 3MF for each build plate (open it in Anycubic Slicer Next: the pieces are already laid out for the 250 × 250 bed) and an STL of every piece. Print at 0.12–0.16 mm layers for the most detail; no supports needed.</p>
        </Modal>
      )}

      {modal === 'sets' && <SetsModal set={set} setName={setName} onLoad={(s) => { setSet(s.items); setSetName(s.name); setModal(null); setToast(`Opened "${s.name}"`); }} onClose={() => setModal(null)} toast={setToast} />}

      {modal === 'help' && (
        <Modal title="How Cypress Forge works" onClose={() => setModal(null)}>
          <ol className="helplist">
            <li><b>Pick an era</b> on the left: every piece changes to match it.</li>
            <li><b>Pick a piece</b>: floor, wall, corner, door, hill, stairs, pillar, scatter or bridge.</li>
            <li><b>Make it yours</b> on the right. 🎲 rolls a new version; ↶ undoes. Switch to <i>All options</i> for every setting.</li>
            <li>Drag to turn the view, scroll or pinch to zoom. The blue mini is a 28 mm figure on a 25 mm base for scale.</li>
            <li><b>＋ Add to print set</b>, set how many of each, then <b>Export</b>. Open the plate files in your slicer and print.</li>
          </ol>
          <p className="small muted">Shortcuts: R = randomize, Ctrl+Z = undo, Ctrl+Y = redo. Everything is saved in this browser and works offline once loaded.</p>
        </Modal>
      )}
    </div>
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
    const v = p[c.key] as number;
    const roll = () => {
      const steps = Math.round((c.max - c.min) / c.step);
      change({ [c.key]: +(c.min + Math.round(Math.random() * steps) * c.step).toFixed(3) } as Partial<Params>);
    };
    return (
      <div className="row">
        <div className="t">{c.label} <b>{c.fmt(v)}</b></div>
        <div className="sl">
          <input type="range" min={c.min} max={c.max} step={c.step} value={v} onChange={(e) => change({ [c.key]: +e.target.value } as Partial<Params>)} aria-label={c.label} />
          <button className="mini" onClick={roll} title="Random">🎲</button>
          <button className="mini" onClick={() => change({ [c.key]: d[c.key] } as Partial<Params>)} title="Reset">↺</button>
        </div>
        {c.help && <div className="help">{c.help}</div>}
      </div>
    );
  }
  if (c.kind === 'choice') {
    const v = p[c.key] as string;
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
        <input type="checkbox" checked={v} onChange={(e) => change({ [c.key]: e.target.checked } as Partial<Params>)} />
        <span className="sw" /> {c.label}
      </label>
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

function SetsModal({ set, setName, onLoad, onClose, toast }: { set: SetItem[]; setName: string; onLoad: (s: Saved) => void; onClose: () => void; toast: (s: string) => void }) {
  const [saved, setSaved] = useState<Saved[]>(() => load(LS.sets, []));
  const file = useRef<HTMLInputElement>(null);
  const persist = (s: Saved[]) => { setSaved(s); save(LS.sets, s); };
  return (
    <Modal title="My sets" onClose={onClose}>
      <div className="btnrow">
        <button className="primary" disabled={!set.length} onClick={() => {
          const s: Saved = { name: setName, items: set.map((x) => ({ ...x, thumb: undefined })), saved: new Date().toLocaleString() };
          persist([s, ...saved.filter((x) => x.name !== setName)]);
          toast(`Saved "${setName}"`);
        }}>💾 Save "{setName}"</button>
        <button disabled={!set.length} onClick={() => download(JSON.stringify({ name: setName, items: set.map((x) => ({ ...x, thumb: undefined })) }, null, 1), `${setName}.forge.json`, 'application/json')}>⬇ Share as a file</button>
        <button onClick={() => file.current?.click()}>📂 Open a file</button>
        <input ref={file} type="file" accept=".json" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const s = JSON.parse(await f.text());
            onLoad({ name: s.name ?? f.name, items: s.items, saved: '' });
          } catch { toast('That file is not a Cypress Forge set.'); }
        }} />
      </div>
      <div className="saved">
        {saved.length === 0 && <p className="muted">No saved sets yet.</p>}
        {saved.map((s) => (
          <div key={s.name} className="savedrow">
            <div><b>{s.name}</b><div className="small muted">{s.items.reduce((a, b) => a + b.qty, 0)} pieces · {s.saved}</div></div>
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
