# Build Guide — Interactive CPU Scheduling & Process Lifecycle Simulator

**Audience:** You — the CCS635 student who needs to reproduce this project, defend it, and extend it.
**Scope:** Every phase from an empty directory to a deployed GitHub Pages URL, with the exact
terminal commands, file tree at each step, and the real code snippets that make the project work.

The architecture decision that shapes everything: **precompute the entire run as a pure function,
then animate a cursor over it.**

```js
// src/engine/simulate.js
export function simulate(processes, config) {
  // Returns { snapshots, events, cpuSegments, deviceSegments, metrics, summary }
}
```

`simulate` has **zero React imports**. The UI stores only `{ timeline, cursor }`. Start/Pause/Step/
Next Event/Reset/Run-to-end are cursor arithmetic on one code path. Compare All is a `map` over six
calls on a frozen workload copy (spec §4). Copy-on-write keeps unchanged `ProcessRuntime` objects
identical across ticks so `React.memo` skips chips that didn't move — this is what keeps the
shared-layout animation smooth.

---

## P0 — Scaffold: Vite + React + Tailwind v4 + ESLint + git

```bash
npm create vite@latest . -- --template react
npm i react@19.3.1 react-dom@19.3.1
npm i -D vite@8.3.6 @vitejs/plugin-react@6.2.1
npm i tailwindcss@4.3.5 @tailwindcss/vite@4.3.5
npm i framer-motion@14.10.1
npm i -D eslint@10.14.0 @eslint/js@10.0.1 \
      eslint-plugin-react-hooks@7.1.1 eslint-plugin-react-refresh@0.5.7 globals@17.14.0
npm i -D gh-pages@6.3.0
```

### `vite.config.js`

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',                              // works on any GitHub Pages subpath
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', sourcemap: false },
  server: { open: true },
});
```

### `src/index.css` — Tailwind v4 is CSS-first (no `tailwind.config.js`, no PostCSS)

```css
@import 'tailwindcss';

@theme {
  /* Surfaces and ink */
  --color-surface: #ffffff;
  --color-surface-muted: #f8fafc;
  --color-surface-sunken: #f1f5f9;
  --color-ink: #0f172a;
  --color-ink-muted: #64748b;
  --color-ink-subtle: #94a3b8;
  --color-line: #e2e8f0;
  --color-line-strong: #cbd5e1;
  --color-accent: #16a34a;
  --color-accent-hover: #15803d;

  /* Process lifecycle states (spec §5) */
  --color-state-new: #94a3b8;
  --color-state-ready: #2a78d6;
  --color-state-running: #008300;
  --color-state-waiting: #eda100;
  --color-state-io: #6250d6;
  --color-state-terminated: #e87ba4;
  --color-state-idle: #898781;

  /* Per-process palette, indexed by ProcessSpec.colorIndex (1..8) */
  --color-proc-1: #2563eb;  --color-proc-2: #0d9488;
  --color-proc-3: #d97706;  --color-proc-4: #dc2626;
  --color-proc-5: #7c3aed;  --color-proc-6: #0891b2;
  --color-proc-7: #ca8a04;  --color-proc-8: #db2777;

  --radius-card: 0.75rem;
  --shadow-card: 0 1px 2px rgb(15 23 42 / 0.06), 0 1px 3px rgb(15 23 42 / 0.04);
  --font-sans: 'Inter var', 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-mono: ui-monospace, 'SFMono-Regular', 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
}

@layer base {
  body { margin: 0; background: var(--color-surface-muted); color: var(--color-ink);
    font-family: var(--font-sans); font-size: 0.875rem; line-height: 1.5; }
  .tnum { font-variant-numeric: tabular-nums; }
  :focus-visible { outline: 2px solid var(--color-state-ready); outline-offset: 2px; }
}
```

> **Critical:** The Tailwind scanner only sees literal class strings. `bg-proc-${n}` produces
> **nothing**. Use a static lookup map or inline `style={{ background: 'var(--color-proc-' + n) }}`.

### `.editorconfig` (matches your CCS670 house style)

```ini
root = true
[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

### ESLint flat config (excerpt) — hooks & refresh are errors, not warnings

```js
// eslint.config.js
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  js.configs.recommended,
  { plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
];
```

### `package.json` scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "test": "node --test \"src/**/__tests__/**/*.test.js\"",
    "predeploy": "npm run build",
    "deploy": "gh-pages -d dist --dotfiles -m \"deploy\""
  }
}
```

### `public/.nojekyll` (0 bytes) — stops Pages from hiding `_`-prefixed asset dirs

```bash
git init -b main
git add -A
git commit -m "chore: scaffold Vite + React + Tailwind v4 + ESLint

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

**Exit criterion:** `npm run dev` renders a Tailwind-styled shell; `npm run build` green.

---

## P1 — Domain model: types, seeded RNG, workload generator + validator, §4 sample preset

### `src/engine/types.js` — JSDoc typedefs (single source of shape truth)

```js
/** @typedef {'CPU' | 'A' | 'B'} BurstKind */
/** @typedef {Object} Burst @property {BurstKind} kind @property {number} duration */

/** @typedef {Object} ProcessSpec
 *  @property {string} id @property {number} arrival @property {number} priority
 *  @property {Burst[]} bursts @property {number} [colorIndex]
 */
```

> Spec §4: 1/3/5 alternating bursts; **begins AND ends with CPU**; each burst 50–200.

### `src/engine/rng.js` — mulberry32 + FNV-1a seed hashing (reproducible generator)

```js
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return Math.trunc(seed) >>> 0;
  const text = String(seed ?? '').trim();
  if (/^[+-]?\d+$/.test(text)) return Number(text) >>> 0;
  return hashSeed(text === '' ? '0' : text);
}
```

### `src/engine/workload.js` — validator + generator + `cloneWorkload` (deep copy, used everywhere)

```js
export function validateWorkload(processes, { enforceDurationBounds = false } = {}) {
  // Returns { ok, errors[], warnings[] }
}

export function cloneWorkload(processes) {
  return JSON.parse(JSON.stringify(processes)); // simple, correct, fast enough
}
```

### `src/data/sampleWorkload.js` — the only reading satisfying all §4 rules

```js
export const SAMPLE_WORKLOAD = [
  { id: 'P1', arrival: 0,   priority: 3,
    bursts: [{kind:'CPU',duration:180},{kind:'A',duration:100},{kind:'CPU',duration:120},{kind:'B',duration:80},{kind:'CPU',duration:70}] },
  { id: 'P2', arrival: 30,  priority: 1,
    bursts: [{kind:'CPU',duration:70},{kind:'B',duration:150},{kind:'CPU',duration:90}] },
  { id: 'P3', arrival: 50,  priority: 4,
    bursts: [{kind:'CPU',duration:120},{kind:'A',duration:70},{kind:'CPU',duration:160}] },
  { id: 'P4', arrival: 80,  priority: 2,
    bursts: [{kind:'CPU',duration:60},{kind:'B',duration:100},{kind:'CPU',duration:80},{kind:'A',duration:60},{kind:'CPU',duration:100}] },
  { id: 'P5', arrival: 110, priority: 5,
    bursts: [{kind:'CPU',duration:150}] },
];
```

**Exit criterion:** `sampleWorkload.test.js` green — every §4 constraint asserted (burst counts, alternation, bounds, first/last CPU).

---

## P2 — Six schedulers behind one interface

### Interface (`src/engine/algorithms.js`)

```js
/** @typedef {Object} Scheduler
 *  @property {string} id
 *  @property {boolean} isPreemptive
 *  @property {boolean} needsQuantum
 *  @property {(ctx: SchedulerContext) => string|null} select
 *  @property {(ctx: SchedulerContext) => boolean} shouldPreempt
 */
```

### Tie-break (spec §3): earlier Ready entry, then **lexical** ID — `P10` < `P2`

```js
export function compareIds(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

export function byTie(a, b, ctx) {
  const ea = ctx.proc[a].readyEntryTick ?? 0;
  const eb = ctx.proc[b].readyEntryTick ?? 0;
  return ea - eb || compareIds(a, b);
}
```

### SJF-NP reads **next CPU burst duration**; SRTF reads **remaining** — different fields

```js
export function nextCpuBurst(pid, ctx) {
  const burst = ctx.spec[pid].bursts[ctx.proc[pid].burstIndex];
  return burst && burst.kind === 'CPU' ? burst.duration : Infinity;
}
```

### Pick best with spec tie-break

```js
function pickBest(ctx, keyOf) {
  let best = null, bestKey = Infinity;
  for (const pid of ctx.readyQueue) {
    const key = keyOf(pid, ctx);
    if (best === null || key < bestKey || (key === bestKey && byTie(pid, best, ctx) < 0)) {
      best = pid; bestKey = key;
    }
  }
  return best;
}
```

### Strict preemption: **strictly better** contender (tie never preempts)

```js
function strictPreemption(ctx, keyOf) {
  if (!ctx.running || ctx.readyQueue.length === 0) return false;
  const best = pickBest(ctx, keyOf);
  return best !== null && keyOf(best, ctx) < keyOf(ctx.running.pid, ctx);
}
```

### The six (registry in `SCHEDULERS`)

```js
export const fcfs = {
  id: 'FCFS', isPreemptive: false, needsQuantum: false,
  select: (ctx) => ctx.readyQueue[0] ?? null,
  shouldPreempt: () => false,
};

export const sjf = {
  id: 'SJF_NP', isPreemptive: false, needsQuantum: false,
  select: (ctx) => pickBest(ctx, nextCpuBurst),
  shouldPreempt: () => false,
};

export const srtf = {
  id: 'SRTF', isPreemptive: true, needsQuantum: false,
  select: (ctx) => pickBest(ctx, (pid, c) => c.proc[pid].remaining),
  shouldPreempt: (ctx) => strictPreemption(ctx, (pid, c) => c.proc[pid].remaining),
};

export const priorityNP = {
  id: 'PRIO_NP', isPreemptive: false, needsQuantum: false,
  select: (ctx) => pickBest(ctx, (pid, c) => c.proc[pid].priority),
  shouldPreempt: () => false,
};

export const priorityP = {
  id: 'PRIO_P', isPreemptive: true, needsQuantum: false,
  select: (ctx) => pickBest(ctx, (pid, c) => c.proc[pid].priority),
  shouldPreempt: (ctx) => strictPreemption(ctx, (pid, c) => c.proc[pid].priority),
};

export const roundRobin = {
  id: 'RR', isPreemptive: true, needsQuantum: true,
  select: (ctx) => ctx.readyQueue[0] ?? null,
  shouldPreempt: (ctx) => Boolean(ctx.running) && ctx.running.quantumLeft <= 0 && ctx.readyQueue.length > 0,
};
```

> **Quantum re-grant convention:** if `readyQueue.length === 0` at quantum expiry, the running
> process receives a fresh quantum — no eviction, no switch. This is exactly what the RR preset
> (24/3/3 q=4) pins: 3 switches, not 7.

**Exit criterion:** Each algorithm's `select`/`shouldPreempt` matches §3's table exactly.

---

## P3 — The five-phase tick loop + metrics + Gantt derivation

### Copy-on-write — the only way runtime state changes

```js
// src/engine/simulate.js
function patch(S, pid, delta) {
  S.proc = { ...S.proc, [pid]: { ...S.proc[pid], ...delta } };
}
```

Unchanged records keep **reference identity** across ticks — `React.memo` skips them.

### Snapshot semantics: `snapshots[i]` covers `[i, i+1)` — cursor index equals clock tick

```js
S.snapshots.push(takeSnapshot(S, t)); // Phase 5 boundary
```

### Five ordered phases per tick (spec §7)

```js
for (;;) {
  // Phase 1: complete work that ended at t
  if (S.cpu.pid !== null && !S.cpu.inSwitch && S.proc[S.cpu.pid].remaining <= 0) {
    completeCpuBurst(S.cpu.pid, t);
  }
  for (const deviceId of DEVICES) {
    if (S.devices[deviceId].busyPid !== null && S.devices[deviceId].remaining <= 0) {
      completeIoBurst(deviceId, t); // device-ID order A then B
    }
  }

  // Phase 2: arrivals (lexical ID) then admissions (FCFS)
  admitArrivals(t);

  // Phase 3: preemption — hasRun prevents evicting a process that hasn't served yet
  if (S.cpu.pid !== null && !S.cpu.inSwitch && S.cpu.hasRun) {
    if (scheduler.shouldPreempt(makeContext(S, t))) {
      // ...evict, push to END of readyQueue (after arrivals/completions), emit PREEMPT/QUANTUM_EXPIRE
    } else if (scheduler.needsQuantum && S.cpu.quantumLeft <= 0) {
      S.cpu.quantumLeft = fullConfig.quantum; // re-grant in place
    }
  }

  // Phase 4: dispatch — first dispatch is DISPATCH; different PID = CONTEXT_SWITCH
  dispatchIfPossible(t);

  // Snapshot before executing [t, t+1)
  S.snapshots.push(takeSnapshot(S, t));

  // Phase 5: accrue waits, then execute
  for (const pid of S.readyQueue)  patch(S, pid, { readyWait: S.proc[pid].readyWait + 1 });
  for (const pid of S.jobQueue)    patch(S, pid, { jobWait: S.proc[pid].jobWait + 1 });
  for (const deviceId of DEVICES)
    for (const pid of S.devices[deviceId].queue)
      patch(S, pid, { deviceWait: S.proc[pid].deviceWait + 1 });

  if (S.cpu.inSwitch) { /* count switchTicks */ }
  else if (S.cpu.pid !== null) { /* decrement remaining, cpuTime++, quantumLeft--, hasRun=true */ }
  else { /* idleTicks++ */ }

  for (const deviceId of DEVICES) if (dev.busyPid) { dev.remaining--; dev.busyTicks++; }

  if (S.terminated.length === specs.length) break;
  if (++guard > MAX_TICKS) { warning = '...'; break; }
  t += 1;
}
```

> **Completion wins at quantum expiry** (Phase 1 runs before Phase 3).
> **Device completions promoted in device-ID order** (A then B).
> **Preempted RR process goes to end** after same-boundary arrivals/completions.

### Metrics (`src/engine/metrics.js`) — three separate waiting totals

```js
// readyWait: ticks in Ready Queue only
// jobWait:   ticks awaiting admission in Job Queue
// deviceWait: ticks queued before I/O service (excludes service time)
// CPU util = cpuExecutingTicks ÷ makespan × 100  (EXCLUDES switchTicks)
// makespan = lastCompletion − minArrival
// contextSwitches = changes between different running PIDs (not first dispatch; idle gaps reset)
```

**Exit criterion:** Textbook presets produce hand-computed numbers (see `docs/validation/SCENARIOS.md`).

---

## P4 — Engine test suite (`node --test`, zero new deps)

```json
// package.json
"test": "node --test \"src/**/__tests__/**/*.test.js\""
```

### `src/engine/__tests__/rr.test.js` — the known-answer RR preset (24/3/3 q=4)

```js
export const RR_SET = [
  cpuOnly('P1', 0, 1, 24), cpuOnly('P2', 0, 1, 3), cpuOnly('P3', 0, 1, 3),
];

export const RR_EXPECTED = {
  quantum: 4,
  completion: { P1: 30, P2: 7, P3: 10 },
  avgWaiting: 17 / 3,
  avgTurnaround: 47 / 3,
  contextSwitches: 3,   // P1→P2, P2→P3, P3→P1 — four later quantum expiries are NOT switches
};
```

### Test helpers (`src/engine/__tests__/helpers.js`)

```js
export function traceIs(trace, expected, label) { /* string compare */ }
export function cpuTrace(timeline) { /* RLE of CPU pid */ }
export function deviceBusy(timeline, device) { /* RLE of device */ }
export function byId(timeline) { /* metrics indexed by PID */ }
export function close(actual, expected, label) { /* tolerance for division */ }
```

**Exit criterion:** `npm test` → 298 pass, 0 fail across 43 suites.

---

## P5 — React state layer: precomputed timeline, playback reducer, rAF loop

### `src/state/useSimulation.js` — the only hook that binds engine to React

```js
export function useSimulation({ initialWorkload, initialConfig } = {}) {
  const [workload, setWorkloadState] = useState(() => initialWorkload ?? SAMPLE_WORKLOAD);
  const [config, setConfigState] = useReducer(
    (current, patch) => ({ ...current, ...patch }),
    { ...DEFAULT_CONFIG, ...initialConfig },
  );
  const [playback, dispatch] = useReducer(playbackReducer, INITIAL_PLAYBACK);

  const timeline = useMemo(
    () => simulate(cloneWorkload(workload), config),
    [workload, config]
  );

  const maxCursor = Math.max(0, timeline.snapshots.length - 1);

  // Render-time clamp — prevents out-of-range cursor on config change
  const cursor = clampCursor(playback.cursor, maxCursor);

  // Pull stored cursor back when timeline shrinks
  useEffect(() => {
    if (playback.cursor > maxCursor) dispatch({ type: 'reclamp', maxCursor });
  }, [maxCursor, playback.cursor]);

  const snapshot = timeline.snapshots[cursor] ?? null;

  const send = useCallback((action) => dispatch({ ...action, maxCursor, timeline }), [maxCursor, timeline]);
  const advance = useCallback((ticks) => send({ type: 'advance', by: ticks }), [send]);

  usePlaybackLoop({
    playing: playback.playing,
    speed: playback.speed,
    onAdvance: advance,
    shouldStop: () => cursor >= maxCursor,
  });

  const actions = useMemo(() => ({
    play: () => send({ type: 'play' }),
    pause: () => send({ type: 'pause' }),
    toggle: () => send({ type: 'toggle' }),
    reset: () => send({ type: 'reset' }),
    stepForward: () => send({ type: 'step', by: 1 }),
    stepBack: () => send({ type: 'step', by: -1 }),
    nextEvent: () => send({ type: 'nextEvent' }),
    prevEvent: () => send({ type: 'prevEvent' }),
    runToEnd: () => send({ type: 'runToEnd' }),
    seek: (tick) => send({ type: 'setCursor', cursor: tick }),
    setSpeed: (speed) => send({ type: 'setSpeed', speed }),
    setConfig: (patch) => setConfigState(patch),
    setWorkload: (next) => { setWorkloadState(cloneWorkload(next)); dispatch({ type: 'reset' }); },
  }), [send]);

  return { workload, config, timeline, maxCursor, cursor, snapshot, atEnd: cursor >= maxCursor,
    warning: timeline.warning, playing: playback.playing, speed: playback.speed,
    motion: playback.motion, delta: playback.delta, actions };
}
```

> **Cursor clamp twice:** at render (for the frame) and in reducer via `reclamp` (for the controls).

### `src/hooks/usePlaybackLoop.js` — `requestAnimationFrame` with time accumulator

```js
export function usePlaybackLoop({ playing, speed, onAdvance, shouldStop }) {
  const onAdvanceRef = useRef(onAdvance);
  const shouldStopRef = useRef(shouldStop);

  useEffect(() => {
    onAdvanceRef.current = onAdvance;
    shouldStopRef.current = shouldStop;
  });

  useEffect(() => {
    if (!playing) return undefined;

    const ticksPerSecond = TICKS_PER_SECOND[speed] ?? 8; // { 0.25:2, 0.5:4, 1:8, 2:16, 4:32, 8:64 }
    let frame = 0, last = performance.now(), accumulator = 0;

    const tick = (now) => {
      const elapsed = Math.min(now - last, 250); // clamp background tab delta
      last = now;
      accumulator += (elapsed / 1000) * ticksPerSecond;

      const whole = Math.floor(accumulator);
      if (whole > 0) {
        accumulator -= whole;
        onAdvanceRef.current(whole);
        if (shouldStopRef.current?.()) return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);
}
```

> `setInterval` drifts and is throttled to ~1 Hz in background tabs. rAF + accumulator is correct.

**Exit criterion:** Bare text readout proves cursor model; config change clamps cursor safely.

---

## P6 — Dashboard shell, KPI tiles, control bar

### `src/App.jsx` — vertical order follows the reader's question

```jsx
export default function App() {
  return (
    <SimulationProvider>
      <AppShell>
        <ControlBar />
        <KpiRow />
        <OccupancyStrip />
        <ProcessFlowBoard />
        <GanttChart />
        <ProcessTable />
        <MetricsTable />
        <ComparePanel />
        <WorkloadEditor />
        <div className="grid gap-4 lg:grid-cols-3">
          <EventLog />
          <ProcessHistory />
          <SummaryPanel />
        </div>
        <Legend />
      </AppShell>
    </SimulationProvider>
  );
}
```

### `src/components/controls/ControlBar.jsx` — algorithm, quantum, playback, speed, config drawer

**Exit criterion:** All playback controls work; speed independent of simulated time.

---

## P7 — Process flow board + animated chips

### `src/components/flow/ProcessFlowBoard.jsx` — one `LayoutGroup`, five columns

```jsx
export function ProcessFlowBoard() {
  const { snapshot, config, cursor } = useSim();
  return (
    <LayoutGroup>
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-5">
        <QueueColumn title="Job Queue"   subtitle={scheduled} scroll={true}  accent="text-ink-subtle">
          {snapshot.jobQueue.map(pid => <ProcessChip key={pid} pid={pid} layoutId={`board-${pid}`} />)}
        </QueueColumn>
        <QueueColumn title="Ready Queue" subtitle={/*...*/} scroll={true} accent="text-state-ready">
          {snapshot.readyQueue.map(pid => <ProcessChip key={pid} pid={pid} layoutId={`board-${pid}`} />)}
        </QueueColumn>
        <QueueColumn title="CPU" subtitle="Running" scroll={false} accent="text-state-running">
          {snapshot.cpu.pid ? <ProcessChip pid={snapshot.cpu.pid} layoutId={`board-${snapshot.cpu.pid}`} /> : <CpuCard />}
        </QueueColumn>
        <IoDevicesPanel />          {/* Device A + B cards with their own LayoutGroup */}
        <TerminatedColumn />        {/* Completed processes */}
      </div>
    </LayoutGroup>
  );
}
```

### `src/components/flow/QueueColumn.jsx` — **`layoutScroll` on scrollable bodies**

```jsx
import { motion } from 'framer-motion';
export function QueueColumn({ title, children, scroll = true, ... }) {
  return (
    <section className={...}>
      <header>...</header>
      <motion.div
        layoutScroll={scroll}                 // <-- THE FIX
        className={cx('flex min-h-0 flex-1 flex-col gap-1.5 p-2', scroll && 'overflow-y-auto')}
      >
        {children}
      </motion.div>
    </section>
  );
}
```

> Without `layoutScroll`, chips fly to visibly wrong positions after any scroll — the single
> most common way a shared-layout board goes wrong.

### `src/components/flow/ProcessChip.jsx` — namespaced `layoutId`

```jsx
export function ProcessChip({ pid, layoutId }) {
  return (
    <motion.div
      layoutId={layoutId}               // board-P1, table-P1, gantt-P1 — never collide
      layout="position"
      className={cx('proc-chip', colorClass)}
      transition={useReducedMotion() ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 30 }}
    >{pid}</motion.div>
  );
}
```

> **Never combine `AnimatePresence` with `layoutId` on the same element** — exit clone + entering
> element = ghost chip + jump. Render table/legend/Gantt chips as plain elements.

**Exit criterion:** Chips fly between all five columns as one DOM node; scrub does not smear.

---

## P8 — Gantt: CPU + Device A + Device B, ruler, legend, playhead

### `src/components/gantt/GanttChart.jsx` — flexbox rows, segments tile `[0, makespan)`

```jsx
export function GanttChart() {
  const { timeline, cursor } = useSim();
  return (
    <div className="space-y-4">
      <GanttRow label="CPU"  segments={timeline.cpuSegments}   cursor={cursor} />
      <GanttRow label="Dev A" segments={timeline.deviceSegments.A} cursor={cursor} />
      <GanttRow label="Dev B" segments={timeline.deviceSegments.B} cursor={cursor} />
      <GanttRuler makespan={timeline.summary.makespan} cursor={cursor} />
    </div>
  );
}
```

> Switch segments at zero overhead: 1px boundary marker; at overhead > 0: full-width hatched block.

**Exit criterion:** Segments tile `[0, makespan)` with no gaps; switch markers render.

---

## P9 — Process table, event log, summary panel, legend

**Exit criterion:** All panels track the cursor; burst chips show per-phase progress.

---

## P10 — Workload editor, seeded generator, JSON import/export, CSV download

### Draft/live split (render-phase adjustment — lint `react-hooks/set-state-in-effect` is an error)

```jsx
// src/components/editor/WorkloadEditor.jsx
const [draft, setDraft] = useState(() => toDraft(workload));
const [syncedFrom, setSyncedFrom] = useState(workload);

if (workload !== syncedFrom) {      // external change (preset/generator/import)
  setSyncedFrom(workload);
  setDraft(toDraft(workload));      // reset draft without effect
}
```

### `src/engine/serialize.js` — JSON round-trip (drops `colorIndex`)

```js
export const WORKLOAD_FORMAT = 'cpu-sched-workload';
export const WORKLOAD_VERSION = 1;

export function serializeWorkload(processes, { config, name, note } = {}) {
  return { format: WORKLOAD_FORMAT, version: WORKLOAD_VERSION, name, note,
    config: { quantum: config.quantum, switchOverhead: config.switchOverhead,
      admissionLimit: config.admissionLimit, unitLabel: config.unitLabel },
    processes: processes.map(p => ({ id: p.id, arrival: p.arrival, priority: p.priority, bursts: p.bursts })),
  };
}

export function parseWorkloadJSON(input) {
  // Returns { ok, processes, config, name, note, errors[], warnings[] }
}
```

### `src/lib/csv.js` — RFC 4180 encoder, formula defusing

```js
const NEEDS_QUOTES = /[",\r\n]/;
const FORMULA_START = /^[=+@\t\r]/;
const MINUS_NOT_A_NUMBER = /^-(?![\d.]+$)/;

export function csvCell(value) {
  let s = String(value ?? '');
  if (FORMULA_START.test(s) || MINUS_NOT_A_NUMBER.test(s)) s = "'" + s; // defuse
  if (NEEDS_QUOTES.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(columns, rows) { /* ... */ }
```

### `src/lib/download.js` — BOM + object URL (revoked async for Firefox/Safari)

```js
const BOM = String.fromCharCode(0xfeff); // not a literal U+FEFF in source
export function downloadCsv(filename, csv) {
  return downloadText(filename, BOM + csv, 'text/csv;charset=utf-8');
}
```

**Exit criterion:** Round-trip JSON; both CSVs open cleanly in Excel (no ragged rows).

---

## P11 — Compare All panel

### `src/engine/compare.js` — six runs on frozen workload

```js
export function compareAll(processes, config = {}) {
  const workload = cloneWorkload(processes);
  const runs = ALGORITHMS.map(algorithm => {
    const timeline = simulate(cloneWorkload(workload), { ...config, algorithm: algorithm.id });
    return { algorithm: algorithm.id, label: algorithm.label, short: algorithm.short,
      preemptive: algorithm.preemptive, needsQuantum: algorithm.needsQuantum,
      summary: timeline.summary, timeline };
  });
  return {
    runs,
    best: Object.fromEntries(COMPARE_METRICS.map(m => [
      m.key, extremeOf(runs, m.key, m.better === 'higher' ? 'max' : 'min')
    ])),
    switchOverhead: runs[0]?.timeline.config.switchOverhead ?? 0,
  };
}

export function extremeOf(runs, key, direction) {
  const values = valuesOf(runs, key).filter(v => Number.isFinite(v.value));
  if (!values.length) return { value: null, algorithms: [] };
  const value = direction === 'max'
    ? Math.max(...values.map(v => v.value))
    : Math.min(...values.map(v => v.value));
  return { value, algorithms: values
    .filter(v => Math.abs(v.value - value) < 1e-9)
    .map(v => v.algorithm) };
}
```

> Ties return **every** algorithm achieving the value (Priority-NP/P tie exactly on the preset with
> no late high-priority arrival — reporting one winner would be fabricated).

### `src/components/compare/ComparePanel.jsx` — lazy + memoized

```jsx
export function ComparePanel() {
  const { workload, config, actions } = useSim();
  const [open, setOpen] = useState(false);

  const result = useMemo(
    () => open ? compareAll(workload, { quantum: config.quantum,
      switchOverhead: config.switchOverhead, admissionLimit: config.admissionLimit,
      unitLabel: config.unitLabel }) : null,
    [open, workload, config.quantum, config.switchOverhead, config.admissionLimit, config.unitLabel],
  );
  // algorithm deliberately excluded — compareAll replaces it per run
  return <Card title="Compare all six algorithms" ...>...</Card>;
}
```

**Exit criterion:** Six algorithms on frozen workload, best-per-metric marked.

---

## P12 — Report answers + validation scenarios

- `docs/report/ANSWERS.md` — six §10 answers with observed engine figures
- `docs/validation/SCENARIOS.md` — test inventory + hand-computed scenarios (presets, I/O preemption,
  switch sweep, starvation escalation) + UI walkthrough checklist

**Exit criterion:** All six questions answered with numbers; every scenario reproducible in UI.

---

## P13 — Deploy to GitHub Pages

```bash
npm run deploy   # predeploy builds, then: gh-pages -d dist --dotfiles -m "deploy"
```

> `--dotfiles` is mandatory — without it `gh-pages` silently drops `dist/.nojekyll`.
> `base: './'` means the same `dist/` works on any repo name.
> To reproduce the Pages subpath locally:
> ```bash
> npx vite preview --base=/InteractiveCPUSched/
> ```

**Exit criterion:** Live URL loads with no console 404s on desktop and phone.

---

## P14 — This build guide

`docs/BUILD_GUIDE.md` — the document you are reading.

---

## Hazards — the non-negotiable details that bite

| Hazard | Symptom | Fix |
|---|---|---|
| **Dynamic Tailwind classes** (`bg-proc-${n}`) | No colour applied | Static lookup map or inline `style={{ '--color': 'var(--color-proc-' + n) }}` |
| **`AnimatePresence` + `layoutId` on same element** | Ghost chip + jump instead of flight | Use `AnimatePresence` on a wrapper; render table/legend/Gantt chips as plain elements |
| **Cursor overflow on config change** | `TypeError: Cannot read property of undefined` | **Double clamp:** render-time `clampCursor()` + reducer `reclamp` effect |
| **`layoutScroll` omitted** | Chips fly to wrong position after scroll | `layoutScroll={scroll}` on the `motion.div` body of every scrollable `QueueColumn` |
| **`maxTicks` runaway** | Tab hangs | `MAX_TICKS = 100000` guard in `simulate()` — always there |
| **Playback speed coupling** | Speed changes simulated time | rAF + accumulator; speed maps to `TICKS_PER_SECOND`, never touches clock |
| **Workload mutability** | Compare All produces different schedules per run | `cloneWorkload()` on entry to `simulate()` and inside `compareAll` |
| **RR quantum re-grant** | 7 switches on 24/3/3 q=4 instead of 3 | Re-grant quantum in place when `readyQueue.length === 0` at expiry |
| **Context-switch predicate** | Counts first dispatch or idle-gapped re-dispatch | Only count change between *different* running PIDs across non-idle runs |
| **Quantum expiry vs completion** | Burst ending at quantum expiry preempted instead of completing | Phase 1 (complete) runs before Phase 3 (preemption) |

---

## Verification loop — run after every change

```bash
npm run lint    # 0 problems
npm test        # 298 pass, 0 fail
npm run build   # green
node tmp-ssr-check.mjs  # SSR renders with no React warnings
```

If any step fails, fix it before moving on. This is the contract that keeps the project graded-ready.

---

*This guide was written against the working codebase — every snippet above exists in the repo at the
indicated path. If a snippet and the file disagree, the file wins.*