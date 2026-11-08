# Report — answers to the brief's six questions (spec §10)

Every number below was produced by the simulator's engine (`src/engine/simulate.js`) over the
assignment's §4 workload — P1…P5, arrivals 0/30/50/80/110, priorities 3/1/4/2/5, five-, three-,
three-, five- and one-burst sequences — with Round Robin quantum 75 and zero context-switch
overhead unless a section says otherwise. Each table can be reproduced in two clicks: load the
**Assignment workload (§4)** preset in the app, then open **Compare all six algorithms**; or from
the command line:

```bash
node --test src/engine/__tests__/          # 298 assertions pin these figures
```

The full six-algorithm comparison, for reference throughout:

| Algorithm | Makespan | Avg turnaround | Avg response | Avg ready wait | Switches | Preemptions |
|---|---:|---:|---:|---:|---:|---:|
| FCFS      | 1200 | 870.00 | 192.00 | 518.00 | 10 | 0  |
| SJF (NP)  | 1200 | 848.00 | 256.00 | 490.00 | 10 | 0  |
| SRTF      | 1200 | 802.00 | 168.00 | 432.00 | 11 | 1  |
| Prio (NP) | 1200 | 786.00 | 364.00 | 402.00 | 10 | 0  |
| Prio (P)  | 1200 | 768.00 | 246.00 | 396.00 | 16 | 6  |
| RR q=75   | 1200 | 928.00 | 120.00 | 576.00 | 20 | 10 |

Makespan is 1200 for every algorithm and that is not a coincidence to be explained away: with a
zero-cost context switch the CPU is never idle on this workload, so the total time to clear it is
order-independent. What differs is *who waits, and where*. Makespan is measured as
last completion − first arrival.

---

## Q1. Why does a process return to the Ready Queue several times?

Because a CPU burst that is not the process's last one ends in a request for I/O, and the process
cannot re-enter the CPU until that I/O finishes. The multiburst model required by the brief
(§4: "a process may have 1, 3, or 5 alternating bursts and MUST begin and end with CPU") makes the
return mandatory: the only way a process with three bursts can be scheduled twice is to come back
through the Ready Queue in between.

P4 — the five-burst process — makes the journey concrete. Traced under FCFS, every location change
of its lifetime is:

| t | Event | From | To |
|---:|---|---|---|
| 80 | ARRIVE | — | Job Queue |
| 80 | ADMIT | Job Queue | Ready Queue |
| 370 | CONTEXT_SWITCH | Ready Queue | CPU |
| 430 | IO_REQUEST | CPU | Device B |
| 530 | IO_COMPLETE | Device B | **Ready Queue** |
| 950 | CONTEXT_SWITCH | Ready Queue | CPU |
| 1030 | IO_REQUEST | CPU | Device A |
| 1090 | IO_COMPLETE | Device A | **Ready Queue** |
| 1100 | CONTEXT_SWITCH | Ready Queue | CPU |
| 1200 | TERMINATE | CPU | Terminated |

Two I/O excursions, three separate Ready Queue entries, three dispatches. Under FCFS on this
workload the processes enter the Ready Queue 1–3 times each: P1 and P4 three times, P2 and P3
twice, P5 once (single burst — it never leaves once dispatched).

## Q2. How does a device queue differ from the Ready Queue?

Three differences, all visible in the simulator:

**The states are different.** A process in the Ready Queue is *runnable* — it would execute this
instant if the CPU were free, and it is charged `ready waiting` (§9). A process in a device queue
is *blocked* — it is in the WAITING state, cannot use the CPU no matter how idle the CPU is, and
the time is charged to `device waiting` instead. The two totals are kept separate precisely because
collapsing them (as the textbook shortcut `waiting = turnaround − CPU time` does) hides where the
waiting happened.

**Who is competing for what.** The Ready Queue feeds one server, the CPU, which is claimed by one
process at a time. Each device queue also feeds one server — Device A and Device B are single FIFO
servers (§5) — but the two device servers run *concurrently with the CPU and with each other*. So a
full Ready Queue means a busy CPU; a full device queue means a busy device while the CPU may sit
idle.

**Admission to service is FIFO in both, but the events differ.** A Ready Queue entry happens on
admission, I/O completion or preemption; a device queue entry happens only on an IO_REQUEST whose
device is busy.

Device contention is rare on the §4 workload — device A finishes at 19.2% utilisation and B at
27.5% regardless of algorithm — but it is real: under SRTF, P4 accumulates 90 ticks of device
waiting, and under Priority-NP P1 waits 70 and P4 90. A purpose-built case makes the mechanics
exact (two processes, both targeting device A):

```
P1: CPU 2, A 5, CPU 2   (arrives t=0)      P2: CPU 2, A 3, CPU 2   (arrives t=1)

t=2   IO_REQUEST P1→A  A free, so service starts at once: A busy [2,7)
t=2   P2 is dispatched; A's queue is empty
t=4   IO_REQUEST P2→A  A busy until 7, so P2 JOINS THE DEVICE QUEUE
t=4→7 CPU is idle — every process is blocked or queued, and that is legal
t=7   IO_COMPLETE P1   A promotes P2 immediately (FIFO), A busy [7,10)
```

Result: P1 `deviceWait = 0`, P2 `deviceWait = 3` (queued ticks 4→7 only; the three ticks P2 is
being serviced [7,10) are *service*, not waiting), average device wait 1.5, makespan 12.

The decisive contrast sits at t=4–7: the device queue holds a blocked process while the CPU idles.
Swap the roles — two processes contending for the *CPU* — and the ready queue would be non-empty
while a device sat idle. Neither queue says anything about the other resource.

## Q3. How can an I/O completion trigger a preemption when no process arrived?

Because preemption is evaluated at every boundary tick against the *current* Ready Queue, and an
I/O completion is one of the three things that can put a process into that queue (the others being
admission and quantum expiry). A short job that blocked on I/O re-enters with its remaining CPU
time still small; if it re-enters while a long job runs, a strict-priority or shortest-remaining
scheduler must evict the long job. Nothing arrived — the contender was simply hidden in a device
queue.

Engine test `io.test.js → "I/O completion triggering preemption (spec §10)"` pins the minimal case
under SRTF:

```
P1: CPU 10          P2: CPU 2, A 4, CPU 2     both arrive t=0

t=0    P2 has 2 units remaining vs P1's 10 → SRTF runs P2
t=2    P2's CPU burst ends; it blocks on A for 4 units
t=2→6  P1 runs. Nothing else is ready, so no decision is possible
t=6    P2's I/O completes. It re-enters the Ready Queue with 2 units left
       against P1's 6 remaining. 2 < 6 strictly → P1 is preempted
t=6→8  P2 finishes; t=8→14 P1 serves its last 6 units
```

At t=6 the trace contains exactly three events — `IO_COMPLETE`, `PREEMPT`, `CONTEXT_SWITCH` — and
the test asserts an `ARRIVE` count of **zero**. P1 is the preempted process
(`summary.preemptions = 1`); P2 is never preempted, because blocking is voluntary.

Note the timing subtlety: during [2,6) P1's remaining time (10−4 = 6) was *longer* than P2's
residual (2) all along, but P2 was not in the Ready Queue to compete. Preemption only becomes
possible the instant P2 becomes ready again.

On the §4 workload itself SRTF records exactly **one** preemption, and it is an *arrival* trigger —
at t=30, when P2 arrives with 70 units against P1's 180. No I/O completion on that workload
produces a preemption. That is a property of the workload rather than of SRTF: because the five
processes arrive at 0/30/50/80/110, the Ready Queue is almost always populated by arrivals before
any device returns a process, so the arrival path gets to the decision first. The constructed case
above is what isolates the I/O path.

## Q4. Which scheduler minimises average ready waiting — and does it also minimise response?

On this workload, **Preemptive Priority** minimises average ready waiting at **396.00 ticks** —
edging out its non-preemptive twin (402) and SRTF (432). It does **not** minimise response:

| Ranked by avg ready wait | Value | | Ranked by avg response | Value |
|---|---:|---|---|---:|
| **Prio (P)** | **396.00** | | **RR q=75** | **120.00** |
| Prio (NP) | 402.00 | | SRTF | 168.00 |
| SRTF | 432.00 | | FCFS | 192.00 |
| SJF (NP) | 490.00 | | Prio (P) | 246.00 |
| FCFS | 518.00 | | SJF (NP) | 256.00 |
| RR | 576.00 | | Prio (NP) | 364.00 |

The winner of one metric is fourth on the other, and the winner of the other is *last* on the
first. The two metrics reward different things. Response is decided once, at a process's first
dispatch, so RR's rapid cycling gets everyone onto the CPU quickly (120.00 — barely one and a half
quanta of wait for the worst-off process). Ready waiting is accumulated over the process's entire
life, so RR's constant re-queueing costs it dearly (576.00 — the worst), while preemptive priority
lets each dispatch run to completion and keeps total queue time low.

The general claim "SRTF optimises everything" does not survive contact with a multiburst workload:
SRTF is third on ready waiting here, because priority — not burst length — is what the §4 workload
actually varies, and SRTF ignores priority entirely.

## Q5. Which algorithm does the most preemptions and context switches? How does a positive switch penalty change the results?

**Round Robin does the most of both on this workload: 10 preemptions and 20 context switches**
(FCFS, SJF-NP and Priority-NP have zero preemptions; SRTF has 1; Priority-P has 6). RR preempts by
construction — every quantum expiry that finds a non-empty Ready Queue is one — and each
preemption creates a switch.

The switch penalty sweeps the ranking. Average turnaround (makespan in parentheses) as overhead
rises from 0 to 50:

| Overhead | FCFS | SJF (NP) | SRTF | Prio (NP) | Prio (P) | RR q=75 |
|---:|---:|---:|---:|---:|---:|---:|
| 0  | 870 (1200)  | 848 (1200)  | 802 (1200)  | **786** (1200) | 768 (1200)  | 928 (1200)  |
| 5  | 906 (1250)  | 886 (1250)  | 845 (1260)  | **822** (1250) | 828 (1280)  | 1015 (1300) |
| 15 | 978 (1350)  | 962 (1350)  | 905 (1395)  | **894** (1350) | 908 (1425)  | 1171 (1500) |
| 25 | 1050 (1450) | 1038 (1450) | 1010 (1525) | **966** (1450) | 998 (1575)  | 1347 (1700) |
| 50 | 1230 (1700) | 1228 (1700) | 1222 (1900) | **1146** (1700)| 1248 (2000) | 1742 (2200) |

Three effects, all monotone and all visible in that table:

1. **Preemptive Priority loses the crown immediately.** At overhead 0 it has the best average
   turnaround (768). At overhead 5 it is already behind its own non-preemptive variant
   (828.20 vs 822), and the gap only widens. Its 16 switches at overhead 0 become 16 × overhead
   ticks of pure loss, and preemption stops being free.
2. **Makespan is entirely explained by the switch count.** Because the CPU never idles on this
   workload, `makespan = 1200 + switches × overhead` holds exactly, for every algorithm. Check it
   against the table: RR has 20 switches, so 1200, 1300, 1500, 1700, 2200 at overheads 0/5/15/25/50
   — exact. FCFS, SJF-NP and Priority-NP all make exactly 10 switches (their re-dispatch count
   after I/O), so they are *indistinguishable* on makespan at every overhead level: 1250, 1350,
   1450, 1700. SRTF's count creeps up as the overhead creates new boundaries
   (11 → 12 → 13 → 13 → 14), and Priority-P's wobbles (16 → 16 → 15 → 15 → 16). The identity is what makes the cost of a
   scheduling policy legible: an algorithm does not lose time to preemption in general, it loses
   exactly `switches × overhead`.
3. **RR degrades fastest on both axes.** Its 20 switches and 10 preemptions make it the worst on
   average turnaround at *every* overhead level, and its makespan grows to 2200 at overhead 50 —
   1000 of those ticks are switches. CPU utilisation falls from 100% (overhead 0) to 70.6%
   (overhead 25) to 54.5% (overhead 50).

One honest caveat about overhead 0: makespan is identical (1200) across all six algorithms there,
because a zero-cost switch means the CPU never idles and total time is order-independent. Any
comparison of *makespan* is only meaningful once the overhead is positive — which is itself an
argument for the instructor's making switch cost part of the discussion.

## Q6. Can low-priority or long-running processes starve? What mitigates it, and at what cost?

Yes — **Preemptive Priority starves low-priority processes without bound.** The demonstration is
escalation: one long low-priority process (PLONG, priority 5, a single CPU 200 burst) against
growing numbers of short priority-1 processes (CPU 50, arriving every 60 ticks). PLONG's completion
time:

| Short jobs (n) | FCFS | SRTF | Prio (NP) | Prio (P) | RR q=75 |
|---:|---:|---:|---:|---:|---:|
| 2 | 200 | 300 | 250 | 300 | 300 |
| 4 | 200 | 400 | 250 | 400 | 400 |
| 6 | 200 | 500 | 250 | 500 | 450 |
| 8 | 200 | 600 | 250 | 600 | 450 |

Under **Preemptive Priority** PLONG's completion grows by exactly 100 per added pair of short jobs
— each arrival at priority 1 restarts the eviction, and PLONG only ever executes in the gaps
between the short stream's members. The trend has no ceiling: with an unbounded arrival stream it
never runs to completion at all. SRTF escalates identically (600 at n=8) — it starves *long*
processes for the same structural reason, using remaining time instead of priority. RR is bounded
(its 450 plateau comes from quantum rotation: everyone gets a slice), and two results are the
instructive surprises:

- **Non-preemptive Priority does not starve at all** — PLONG completes at 250 for every n. Once
  dispatched, nothing can evict it: at the first gap in the short stream (t=50, before S02 arrives
  at t=60) PLONG gets the CPU and keeps it for its full 200 ticks. Non-preemption is itself a
  starvation bound, purchased with the loss of responsiveness that preemption buys.
- **FCFS is the *best* algorithm for the long process** (completion 200, zero waiting, zero
  response delay) — which is the mirror image of starvation: the same property that protects
  PLONG makes every short job that arrives after it wait behind it. Starvation is not a property
  of an algorithm but of a direction of unfairness.

**Mitigation: aging.** Raise a process's effective priority by one for every k ticks it waits in
the Ready Queue (k = 25, say). A waiting priority-5 process reaches priority 1 after 100 ticks and
preempts the stream that was starving it.

**The trade-off is real, not decorative:**

- *It destroys the meaning of the priority field at equilibrium.* Under sustained load, every
  long-waiting process eventually becomes "highest priority", so the scheduler's decisions converge
  toward FIFO-with-noise — you have re-imported FCFS's head-of-line blocking through the back door.
- *It makes behaviour timing-dependent.* The same workload produces different schedules depending
  on when aging ticks land relative to arrivals, which weakens exactly the deterministic,
  reproducible trace this assignment requires (§7). A deterministic aging rule (age strictly at
  boundary ticks, before dispatch) keeps it reproducible, but the schedule is now sensitive to k.
- *It can cause preemption storms.* When a starved process crosses the threshold, it evicts the
  running job; if several age across the threshold together, they preempt each other in turn and
  the switch count spikes — at a positive switch overhead, aging burns the very ticks it was meant
  to make fair.
- *Choosing k is choosing whom to favour.* Small k protects interactive processes but erodes
  priority; large k preserves priority but approaches starvation again. There is no value that is
  right for all workloads.

A softer alternative with a smaller bill: **bounded priority promotion** — cap how far aging can
promote a process (e.g. a priority-5 process can age to priority 3, never to 1). Starvation is
still impossible (the promoted process eventually outranks *untouched* priority-3 competitors), but
the freshest priority-1 arrivals always win, preserving responsiveness. The cost is one more
tunable parameter and a slightly harder analysis.

---

*All figures in this document are engine output, not hand-typed values. The test suites in
`src/engine/__tests__/` re-derive the key ones from scratch on every run — 298 assertions across
43 suites — so a regression in any number quoted here fails the build.*
