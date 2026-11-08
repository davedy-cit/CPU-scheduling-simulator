# Interactive CPU Scheduling & Process Lifecycle Simulator

A client-side single-page application that simulates CPU scheduling and process lifecycles for the
CCS635 assignment brief: six scheduling algorithms, one logical CPU, two concurrent I/O devices,
a deterministic logical clock, and a fully animated dashboard — no backend, no database.

**Stack:** React 19 · Vite 8 · Tailwind CSS v4 · Framer Motion · deployed to GitHub Pages.
**Tests:** Node's built-in `node --test` — 298 assertions, zero added dependencies.

## Quick start

```bash
npm ci        # or npm install
npm run dev   # Vite dev server
npm test      # engine + lib + state suites
npm run build # production build to dist/
```

### Deploying to GitHub Pages

The build uses `base: './'` (relative asset URLs), so the same `dist/` works under any project
subpath — the repo name does not need to be known in advance.

```bash
npm run deploy   # predeploy builds, then gh-pages -d dist --dotfiles
```

`--dotfiles` matters: without it `gh-pages` silently drops `dist/.nojekyll`, and GitHub Pages then
ignores every `_`-prefixed asset directory. To reproduce the Pages subpath locally:

```bash
npx vite preview --base=/InteractiveCPUSched/
```

## Architecture in one paragraph

The entire run is **precomputed as a pure function** — `simulate(processes, config) => Timeline`
(`src/engine/simulate.js`), with zero React imports. The `Timeline` holds one immutable snapshot per
tick plus a full event trace; React state is just `{ timeline, cursor }`. Start/Pause/Step/Next
Event/Reset/Run-to-end are all cursor arithmetic on one code path, Reset reproduces the run exactly
(no step-wise mutation to diverge), and Compare All is a `map` over six calls on a frozen workload
copy. Runtime records are copy-on-write, so unchanged processes keep reference identity across
ticks and Framer Motion's shared-layout animations stay cheap.

## Documented conventions

The brief leaves a handful of rules open and requires the chosen reading to be documented and
applied consistently. These are the choices this simulator makes, and where they are enforced:

1. **Tie-break "lexical process ID" is byte order, not natural order.** `P10` sorts *before* `P2`,
   because `"P10" < "P2"` lexically. The workload editor and the seeded generator emit zero-padded
   IDs (`P01`…) precisely so this reading and a natural reading coincide in practice. Enforced in
   every scheduler's comparator (`src/engine/algorithms.js`) and pinned in the tie tests.

2. **Context-switch predicate.** A context switch is a change between two *different* running PIDs
   across maximal contiguous runs of non-idle CPU ticks. The first dispatch of the run is not a
   switch; a re-dispatch after an idle gap is a *dispatch*, not a switch (there is nothing to
   switch *from*); and when a quantum expires with an empty Ready Queue, the quantum is
   **re-granted in place** — no eviction, no switch. Enforced in the counters
   (`src/engine/simulate.js`) and pinned by `rr.test.js`: the 24/3/3 q=4 preset reports 3 switches,
   not 7.

3. **Makespan = last completion − first arrival**, not `− 0`. All six §9 rates divide by it, so
   this choice moves every denominator. The alternative (counting from t=0) would change
   utilisation figures whenever the first arrival is later than t=0.

4. **Switch segments in the Gantt at zero overhead.** §8 wants Context Switch segments visible, but
   at the default overhead of 0 a switch costs no ticks and has zero width. The chart therefore
   renders a thin boundary marker at overhead 0 and a full-width hatched block when the overhead is
   positive.

5. **"Reset event" is implemented as Clear log** — the event trace collapses to events at or after
   the current cursor. ("Reset event" is not a standard control; this is the reading that keeps
   Reset (`cursor = 0`) and log-clearing orthogonal.)

6. **The Job Queue column shows arrived-but-not-admitted processes.** Not-yet-arrived processes are
   shown separately as a scheduled-arrivals strip — these are two different things (a process
   cannot be *in* a queue before it exists, spec §6).

7. **Time units.** The engine is always integer ticks; the display label defaults to `ms` via one
   constant (`DEFAULT_UNIT_LABEL`). No real-time equivalence is claimed, and playback speed is
   independent of simulated time (spec §8).

8. **The §9 warning is enforced structurally.** Ready waiting, job waiting and device waiting are
   three separate running totals accrued in the tick loop — the textbook shortcut
   `waiting = turnaround − total CPU time` is never used anywhere in the codebase, because it is
   invalid for a multiburst workload (it would silently fold I/O and admission delays into
   ready-waiting).

## The §4 sample workload

The brief's workload table wraps across a page break and its two text extractions disagree. The
reading used here is the **only** one that satisfies the brief's own rules (1/3/5 bursts, beginning
*and* ending with CPU, each burst 50–200):

| PID | Arrival | Priority | Burst sequence |
|---|---:|---:|---|
| P1 | 0 | 3 | CPU 180, A 100, CPU 120, B 80, CPU 70 |
| P2 | 30 | 1 | CPU 70, B 150, CPU 90 |
| P3 | 50 | 4 | CPU 120, A 70, CPU 160 |
| P4 | 80 | 2 | CPU 60, B 100, CPU 80, A 60, CPU 100 |
| P5 | 110 | 5 | CPU 150 |

The competing extraction gives P1 four bursts ending in I/O — impossible under §4. The reading is
pinned by `workload.test.js`, which asserts every §4 constraint, so any transcription error fails
the suite rather than silently skewing every demonstration.

Note that the engine — not any reference screenshot — is the source of truth for every number. The
brief's mockup images are internally inconsistent (e.g. `116/160` CPU busy at `t=0`), so this
project targets their layout and visual language, not their figures.

## Documentation

- [`docs/BUILD_GUIDE.md`](docs/BUILD_GUIDE.md) — the phase-by-phase build guide: commands, file
  tree and core snippets for reproducing this project from an empty directory.
- [`docs/report/ANSWERS.md`](docs/report/ANSWERS.md) — answers to the brief's six §10 questions,
  with observed figures from the engine.
- [`docs/validation/SCENARIOS.md`](docs/validation/SCENARIOS.md) — the automated test inventory and
  hand-computed scenario catalogue (textbook presets, the I/O-preemption case, the switch-penalty
  sweep, starvation escalation), plus a UI walkthrough checklist.
- `docs/development/steps/` — incremental build log, one entry per phase.

## Project layout

```
src/
├─ engine/     # pure simulation: schedulers, tick loop, metrics, gantt, compare, serialize
├─ data/       # §4 sample workload + hand-computed textbook presets
├─ state/      # React: precomputed timeline + playback cursor (reducer + context)
├─ hooks/      # rAF playback loop with a time accumulator
├─ components/ # layout, controls, flow board, gantt, tables, logs, editor, compare
└─ lib/        # CSV (RFC 4180), downloads, formatting
docs/          # build guide, §10 report answers, validation scenarios
```

The dependency surface is deliberately pinned at the six runtime packages plus `gh-pages` — no state
library, no charting library, no test framework, no router.
