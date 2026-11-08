# Validation — automated tests and scenario demonstrations

This document is the evidence file for the rubric line **"Validation tests and scenario
demonstrations (10 pts)"**. It has three parts: what the automated suite pins, the hand-computed
scenario catalogue you can reproduce in the UI, and a walkthrough checklist for the remaining rubric
criteria.

The governing principle is stated at the top of `src/data/presets.js`: *"A preset whose numbers the
engine merely agrees with proves nothing."* Every expected value in this document was derived on
paper from the brief's own rules — earlier Ready Queue entry wins, then lexical process ID; a tie
never preempts — and only then asserted against the engine. If a scheduler change makes one of
these fail, the scheduler is wrong, not the preset.

---

## 1. Running the suite

```bash
npm test          # node --test, no test framework installed
npm run lint      # eslint, flat config
npm run build     # vite production build
```

Current state: **298 assertions passing across 43 suites, 0 failures**; ESLint reports 0 problems;
the production build is green. The suite runs on Node's built-in test runner, so it adds **no**
dependencies to the project — the whole engine is verifiable from a clean clone with `npm ci`.

## 2. What each suite pins

| Suite | Cases | What it pins |
|---|---:|---|
| `workload.test.js` | 13 | The §4 workload satisfies every §4 constraint: 1/3/5 bursts, begins *and* ends with CPU, strict CPU↔I/O alternation, bursts in 50–200, priorities 1–5. A transcription error fails loudly instead of skewing every demo. |
| `rng.test.js` | 17 | The seeded generator is reproducible: the same seed yields the same workload byte-for-byte, different seeds diverge, and generated sets pass the §4 validator. |
| `fcfs-sjf.test.js` | 12 | FCFS is arrival-ordered and non-preemptive; SJF-NP reads the **next burst's full duration**, not the remaining time — the distinction the brief grades. |
| `srtf.test.js` | 9 | SRTF preempts on a **strictly** shorter contender; a tie does not preempt; `remaining` (not full duration) drives the decision. |
| `priority.test.js` | 13 | Priority 1 = highest; NP runs to completion; P preempts only on strictly higher priority; the two variants coincide when no late arrival exists. |
| `rr.test.js` | 14 | Quantum expiry returns the process to the **tail**, after same-boundary arrivals and completions; quantum re-granted in place when the Ready Queue is empty; the 24/3/3 q=4 known answer. |
| `io.test.js` | 13 | Device FIFO; A and B concurrent with each other and the CPU; device waiting counts *queued* ticks only, never service; **an I/O completion preempting with zero arrivals**. |
| `metrics.test.js` | 17 | Every §9 formula, including that CPU utilisation excludes switch ticks, context switches exclude the first dispatch and idle-gapped re-dispatches, and the textbook shortcut is invalid here. |
| `gantt.test.js` | 15 | CPU and both device timelines tile `[0, makespan)` with no gaps or overlaps; switch markers appear only where a switch occurred; device timelines are separate. |
| `invariants.test.js` | 16 | Every PID occupies exactly one location per tick; time is conserved (`cpu + idle + switch = elapsed`); re-simulating any tick from fresh state deep-equals the stored snapshot — the determinism guarantee. |
| `serialize.test.js` | 26 | JSON round-trip reproduces an identical timeline; colour indices are not exported; text burst notation (`CPU 180 A 100`) parses; malformed input is rejected with errors, out-of-range durations warn. |
| `compare.test.js` | 19 | Six runs over one frozen workload; each run deep-equals a standalone `simulate`; the comparison is reproducible and does not mutate its input. |
| `csv.test.js` | 18 | RFC 4180 correctness: quoted commas and newlines round-trip through a real parser; spreadsheet formula injection is defused; exported tables are rectangular. |
| `playbackReducer.test.js` | 26 | Cursor arithmetic: step, next-event, run-to-end, reset; the cursor is clamped when a config change shrinks the timeline. |

## 3. Hand-computed scenario catalogue

Each scenario below is a preset in the workload editor (pick it from the **Preset** dropdown) and
carries a derivation you can check with a pencil. Reproduce any of them by loading the preset,
selecting the algorithm, and stepping through with `→`.

### 3.1 FCFS vs SJF — the classic average-waiting comparison

| PID | Burst | Arrival |
|---|---:|---:|
| P1 | 6 | 2 |
| P2 | 2 | 5 |
| P3 | 8 | 1 |
| P4 | 3 | 0 |
| P5 | 4 | 4 |

**FCFS** dispatches in arrival order — P4, P3, P1, P5, P2:

```
P4 [0,3)   P3 [3,11)   P1 [11,17)   P5 [17,21)   P2 [21,23)
waiting    = 0, 2, 9, 13, 16  → Σ 40 → avg 8.0
turnaround = 3, 10, 15, 17, 18 → Σ 63 → avg 12.6
```

**SJF-NP** picks the shortest *next burst* at each decision point. The trap is t=9: the ready set is
P3(8), P5(4), P2(2) — P5 and P2 arrived at t=4 and t=5 and have been waiting ever since, so they
are live candidates, not future arrivals:

```
P4 [0,3)   P1 [3,9)   P2 [9,11)   P5 [11,15)   P3 [15,23)
waiting    = 0, 1, 4, 7, 14 → Σ 26 → avg 5.2
turnaround = 3, 7, 6, 11, 22 → Σ 49 → avg 9.8
```

**Expected:** avg waiting 8.0 → 5.2, avg turnaround 12.6 → 9.8, makespan 23 for both. The
improvement in average waiting is the textbook result, and SJF's cost is visible in P3: turnaround
22, worse than under FCFS.

### 3.2 SRTF — preemption on a strictly shorter job

| PID | Burst | Arrival |
|---|---:|---:|
| P1 | 8 | 0 |
| P2 | 4 | 1 |
| P3 | 9 | 2 |
| P4 | 5 | 3 |

```
t=0  P1 dispatched (rem 8)
t=1  P2 arrives (4)  — 4 < 7 remaining → PREEMPT, run P2
t=2  P3 arrives (9)  — 9 > 3 remaining → P2 keeps the CPU
t=3  P4 arrives (5)  — 5 > 2 remaining → P2 keeps the CPU
t=5  P2 completes. Ready: P1(7), P3(9), P4(5) → P4 shortest
t=10 P4 completes. Ready: P1(7), P3(9) → P1
t=17 P1 completes, then P3 [17,26)

completion = P2 5, P4 10, P1 17, P3 26
turnaround = 4, 7, 24, 17 → Σ 52 → avg 13
waiting    = 9, 0, 15, 2  → Σ 26 → avg 6.5
response   = 0, 0, 15, 2  → Σ 17 → avg 4.25
```

**Expected:** avg turnaround 13, avg ready wait 6.5, avg response 4.25, makespan 26, 1 preemption.
Note t=2 and t=3 are the *negative* cases the rubric cares about — a longer contender must not
preempt — and response is measured to the **first** dispatch only, so P1's re-dispatch at t=10 adds
no second response time.

### 3.3 Round Robin — the quantum, and what is *not* a context switch

| PID | Burst | Arrival |
|---|---:|---:|
| P1 | 24 | 0 |
| P2 | 3 | 0 |
| P3 | 3 | 0 |

Quantum **4**. All arrive at t=0, so the initial Ready Queue is lexical: P1, P2, P3.

```
P1 [0,4)   quantum expires, P2 and P3 are waiting → P1 to the TAIL
P2 [4,7)   completes (3 < 4) → P3
P3 [7,10)  completes → P1
P1 [10,30) completes; quantum expiries at 14/18/22/26 re-grant IN PLACE
           because the Ready Queue is empty

completion = P1 30, P2 7, P3 10
turnaround = 30, 7, 10 → Σ 47 → avg 47/3 ≈ 15.67
waiting    = 6, 4, 7   → Σ 17 → avg 17/3 ≈ 5.67
```

**Expected:** avg waiting ≈ 5.67, avg turnaround ≈ 15.67, **3 context switches** (P1→P2 at t=4,
P2→P3 at t=7, P3→P1 at t=10).

This preset is the sharpest test of the switch predicate. P1's four later quantum expiries are *not*
switches: the Ready Queue is empty, so the quantum is re-granted to the process already running
rather than it being evicted and a different PID dispatched. Counting them would report 7 switches
instead of 3 — this is exactly the convention the README documents, and `rr.test.js` pins it.

### 3.4 Priority — NP vs P when they must agree

| PID | Burst | Priority | Arrival |
|---|---:|---:|---:|
| P1 | 10 | 3 | 0 |
| P2 | 1 | 1 | 0 |
| P3 | 2 | 4 | 0 |
| P4 | 1 | 5 | 0 |
| P5 | 5 | 2 | 0 |

All arrive at t=0, so every wait is simply its dispatch time.

```
P2 [0,1)   P5 [1,6)   P1 [6,16)   P3 [16,18)   P4 [18,19)
waiting    = 1, 0, 16, 18, 6 → Σ 41 → avg 8.2
turnaround = 16, 1, 18, 19, 6 → Σ 60 → avg 12
```

**Expected:** **both** variants produce avg waiting 8.2 and avg turnaround 12 — identical. No
higher-priority process ever arrives after a lower-priority one has started, so preemption never
fires. That equality is worth pinning precisely because it shows preemption is *strictly*
better-only: it does not fire on ties, and it does not fire on equal priority.

### 3.5 Priority preemption — where the variants diverge

| PID | Burst | Priority | Arrival |
|---|---:|---:|---:|
| P1 | 6 | 5 (lowest) | 0 |
| P2 | 1 | 1 (highest) | 4 |

P1's burst is 6, not 4, so P2's arrival at t=4 lands strictly *inside* P1's execution. (A burst of
exactly 4 would complete at t=4 — the same instant P2 arrives — and no preemption would ever be
tested. That is a real trap, and the preset is built to avoid it.)

```
Non-preemptive:  P1 [0,6)   P2 [6,7)
  completion P1 6, P2 7;  waiting P1 0, P2 2 → avg 1.0;  preemptions 0

Preemptive:      P1 [0,4)   P2 [4,5)   P1 [5,7)
  completion P1 7, P2 5;  waiting P1 1, P2 0 → avg 0.5;  preemptions 1
```

**Expected:** NP → avg waiting 1.0, 0 preemptions; P → avg waiting 0.5, 1 preemption. The
preemptive variant is better on **both** averages — the opposite of the usual "preemption costs
you" intuition, and true only because the switch overhead is zero here. Raise it (see §3.8) and the
verdict reverses.

### 3.6 Device contention — FIFO queueing and device waiting

| PID | Bursts | Arrival |
|---|---|---:|
| P1 | CPU 2 → A 5 → CPU 2 | 0 |
| P2 | CPU 1 → A 3 → CPU 1 | 1 |

```
t=0  P1 dispatched (arrival order), runs [0,1)
t=1  P2 arrives and waits — FCFS does not preempt, so P1 runs [1,2)
t=2  P1's CPU burst ends. Requests A — free, service starts at once, A busy [2,7).
     CPU is now free, so P2 is dispatched, running [2,3)
t=3  P2's CPU burst ends. Requests A — busy until t=7 → P2 JOINS A'S QUEUE.
     Nothing is ready: the CPU IDLES [3,7)
t=7  P1's I/O completes → P1 to Ready; A promotes P2 immediately (FIFO), A busy [7,10)
     P1 runs [7,9) and terminates
t=9  Nothing ready: CPU idles [9,10)
t=10 P2's I/O completes → Ready; P2 runs [10,11) and terminates
```

**Expected:** completion P1 9, P2 11; **device waiting P1 0, P2 4** (queued ticks 3→7 — the three
ticks P2 is actually serviced, [7,10), are *service*, not waiting); device A busy 8 ticks;
**1 context switch**; makespan 11.

Two things to check in the UI here: the CPU idles at t=4 while device A is busy and P2 sits in A's
queue — the visible proof that a device queue is not a Ready Queue; and the Gantt's Device A row
shows `P1[2,7) P2[7,10)` back to back, which is FIFO promotion made visible.

### 3.7 I/O completion triggering preemption with no arrival

The case spec §10 explicitly asks about. This scenario is built inline in `io.test.js` rather than
as a preset, because it only shows its point under SRTF.

| PID | Bursts | Arrival |
|---|---|---:|
| P1 | CPU 10 | 0 |
| P2 | CPU 2 → A 4 → CPU 2 | 0 |

```
t=0    P2 has 2 units remaining vs P1's 10 → SRTF runs P2
t=2    P2's CPU burst ends; it blocks on A for 4 units
t=2→6  P1 runs. Nothing else is ready, so no decision is possible
t=6    P2's I/O completes. It re-enters Ready with 2 units left against
       P1's 6 remaining. 2 < 6 strictly → P1 IS PREEMPTED
t=6→8  P2 finishes;  t=8→14 P1 serves its last 6 units
```

**Expected CPU trace:** `P2[0,2) P1[2,6) P2[6,8) P1[8,14)`. At t=6 the trace contains exactly three
events — `IO_COMPLETE`, `PREEMPT`, `CONTEXT_SWITCH` — and **zero** `ARRIVE` events. `preemptions = 1`
(P1); P2 is never preempted, because blocking is voluntary.

The subtlety worth stating: during [2,6) P1's remaining time (6) was longer than P2's residual (2)
the whole time, but P2 was not *in* the Ready Queue to compete. Preemption becomes possible only at
the instant P2 becomes ready again. Filter the event log to t=6 and confirm no process arrives.

### 3.8 Switch penalty sweep

Not a preset — a control. On the §4 workload, set **Advanced → context-switch overhead** and watch
the numbers move. The relation is exact:

```
makespan = 1200 + switches × overhead          (holds for all six algorithms, all overheads)
```

| Overhead | FCFS | SJF (NP) | SRTF | Prio (NP) | Prio (P) | RR q=75 |
|---:|---:|---:|---:|---:|---:|---:|
| 0  | 870 (1200)  | 848 (1200)  | 802 (1200)  | 786 (1200)  | **768** (1200)  | 928 (1200)  |
| 5  | 906 (1250)  | 886 (1250)  | 845 (1260)  | **822** (1250) | 828 (1280)  | 1015 (1300) |
| 15 | 978 (1350)  | 962 (1350)  | 905 (1395)  | **894** (1350) | 908 (1425)  | 1171 (1500) |
| 25 | 1050 (1450) | 1038 (1450) | 1010 (1525) | **966** (1450) | 998 (1575)  | 1347 (1700) |
| 50 | 1230 (1700) | 1228 (1700) | 1222 (1900) | **1146** (1700)| 1248 (2000) | 1742 (2200) |

Cell = average turnaround (makespan). Switch counts: FCFS/SJF-NP/Prio-NP 10 at every level; SRTF
11/12/13/13/14; Prio-P 16/16/15/15/16; RR 20 at every level.

**What to observe:** Preemptive Priority holds the best average turnaround at overhead 0 and loses
it by overhead 5 — its 16 switches stop being free. The three algorithms making exactly 10 switches
are indistinguishable on makespan at every level. RR is worst on turnaround throughout, and its CPU
utilisation falls 100% → 54.5%. This is the scenario that makes the case for treating switch cost as
a first-class parameter rather than an assumed zero.

### 3.9 Starvation escalation

Reproducible in the workload editor by hand: one process `PLONG` (arrival 0, priority 5, single CPU
burst 200) plus *n* short processes `S01…Sn` (priority 1, CPU burst 50, arriving every 60 ticks).
PLONG's completion time as *n* grows:

| n | FCFS | SRTF | Prio (NP) | Prio (P) | RR q=75 |
|---:|---:|---:|---:|---:|---:|
| 2 | 200 | 300 | 250 | 300 | 300 |
| 4 | 200 | 400 | 250 | 400 | 400 |
| 6 | 200 | 500 | 250 | 500 | 450 |
| 8 | 200 | 600 | 250 | 600 | 450 |

**What to observe:** under Preemptive Priority and SRTF, PLONG's completion grows without bound —
+100 per pair of added short jobs, with no ceiling. Under **non-preemptive** Priority it is constant
at 250: once dispatched, nothing can evict it, so non-preemption is itself a starvation bound.
Under FCFS it is 200 — best for the long process, and the mirror-image unfairness, since every short
job arriving after t=0 waits behind it. Full discussion, including the aging mitigation and its
trade-offs, is in `docs/report/ANSWERS.md` §Q6.

---

## 4. UI walkthrough checklist

Mapped to the rubric's non-engine criteria. Each line is a thing to do in the running app, not a
thing to read.

**Animated UI, controls and usability (15 pts)**

- [ ] **Start** begins playback; **Pause** halts it; **Resume** continues from the same tick.
- [ ] **Step 1 unit** (or `→`) advances exactly one tick; the logical clock increments by one.
- [ ] **Next Event** (or `Shift + →`) jumps to the next tick carrying an event, skipping quiet ticks.
- [ ] **Run to end** (`End`) snaps to the final tick — it does **not** play hundreds of staggered animations.
- [ ] **Reset** (`Home`) returns to t=0 and reproduces the identical run.
- [ ] **Playback speed** changes how fast simulated time advances and leaves simulated time itself untouched.
- [ ] Watch one chip (P4 is the best) traverse **all five columns**: Job Queue → Ready Queue → CPU → Device → Terminated, as a single moving element rather than a disappear/reappear.
- [ ] Scroll a queue column with several processes in it, then trigger a hand-off — the chip must still land in the right place (this is the `layoutScroll` fix).
- [ ] The **CPU Gantt** and the **separate Device A and Device B timelines** all track the cursor, and include Idle and Context Switch segments.
- [ ] The process table, event log, clock and per-process history all agree on the current tick at every position.

**Accurate clock, metrics and deterministic traces (15 pts)**

- [ ] The metrics table shows all §9 columns; hover a heading for its definition.
- [ ] CPU utilisation excludes context-switch ticks — confirm by raising the switch overhead and watching utilisation fall while busy time stays 1200.
- [ ] Context switches exclude the first dispatch — check the RR q=4 preset reports 3, not 7.
- [ ] The event trace records timestamp, PID, previous location, new location, reason, and the active algorithm for every event.

**Workload editing and data (rubric support)**

- [ ] The seeded generator produces the same set for the same seed, twice.
- [ ] **Export JSON** then **Import JSON** reproduces an identical timeline.
- [ ] **Download CSV** for metrics and for events; both open cleanly in Excel with no ragged rows.
- [ ] Invalid input is refused with a specific message (a burst count of 2, a missing CPU-final burst, a duplicate ID).
- [ ] **Compare all six algorithms** reports the §4 table at the top of `docs/report/ANSWERS.md`.

---

*Everything asserted in this document is re-derived on every `npm test` run. The suite is the
contract; this file is the readable index to it.*
