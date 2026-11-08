/**
 * Priority scheduling, both variants — spec §3.
 *
 * Two conventions are graded here and both are easy to get backwards:
 *   - **priority 1 is the highest**, so the scheduler minimises the priority
 *     number rather than maximising it;
 *   - preemptive priority evicts only on a *strictly* higher priority, so an
 *     equal-priority arrival never preempts.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { simulate } from '../simulate.js';
import {
  PRIORITY_SET,
  PRIORITY_EXPECTED,
  PRIORITY_PREEMPT_SET,
  PRIORITY_PREEMPT_EXPECTED,
} from '../../data/presets.js';
import { byId, close, completions, cpuTrace, traceIs } from './helpers.js';

describe('Priority, five ready processes', () => {
  const expected = PRIORITY_EXPECTED;

  for (const algorithm of ['PRIO_NP', 'PRIO_P']) {
    describe(algorithm, () => {
      const timeline = simulate(PRIORITY_SET, { algorithm });

      it('runs strictly in priority order, 1 first', () => {
        // Priorities: P2=1, P5=2, P1=3, P3=4, P4=5.
        traceIs(
          cpuTrace(timeline),
          'P2[0,1) P5[1,6) P1[6,16) P3[16,18) P4[18,19)',
          `${algorithm} trace`,
        );
      });

      it('produces the hand-computed completion times', () => {
        assert.deepEqual(completions(timeline), expected.completion);
      });

      it('produces the hand-computed averages', () => {
        close(timeline.summary.avgReadyWait, expected.avgWaiting, `${algorithm} avg waiting`);
        close(timeline.summary.avgTurnaround, expected.avgTurnaround, `${algorithm} avg turnaround`);
      });

      it('admits every process at t=0, so nobody waits in the Job Queue', () => {
        for (const m of timeline.metrics) {
          assert.equal(m.jobWait, 0, `${m.id} job wait`);
        }
      });
    });
  }

  it('the two variants coincide when no higher priority ever arrives late', () => {
    // Every process is ready from t=0, so preemption has nothing to act on.
    // If the two ever disagree on this workload, the preemptive variant is
    // firing when it should not.
    const np = simulate(PRIORITY_SET, { algorithm: 'PRIO_NP' });
    const p = simulate(PRIORITY_SET, { algorithm: 'PRIO_P' });
    assert.equal(cpuTrace(np), cpuTrace(p));
    assert.equal(p.summary.preemptions, 0);
  });
});

describe('Priority preemption', () => {
  it('non-preemptive lets the low-priority process finish its burst', () => {
    const t = simulate(PRIORITY_PREEMPT_SET, { algorithm: 'PRIO_NP' });
    const expected = PRIORITY_PREEMPT_EXPECTED.PRIO_NP;
    traceIs(cpuTrace(t), 'P1[0,6) P2[6,7)', 'PRIO_NP trace');
    assert.deepEqual(completions(t), expected.completion);
    assert.equal(t.summary.preemptions, expected.preemptions);
  });

  it('preemptive evicts the low-priority process on a strictly higher arrival', () => {
    const t = simulate(PRIORITY_PREEMPT_SET, { algorithm: 'PRIO_P' });
    const expected = PRIORITY_PREEMPT_EXPECTED.PRIO_P;
    // P2 (priority 1) arrives at t=4 while P1 (priority 5) is mid-burst.
    traceIs(cpuTrace(t), 'P1[0,4) P2[4,5) P1[5,7)', 'PRIO_P trace');
    assert.deepEqual(completions(t), expected.completion);
    close(t.summary.avgReadyWait, expected.avgWaiting, 'PRIO_P avg waiting');
    assert.equal(t.summary.preemptions, expected.preemptions);
    assert.equal(byId(t).P1.preemptions, 1);
  });

  it('does not preempt on equal priority', () => {
    const equal = [
      { id: 'P1', arrival: 0, priority: 2, bursts: [{ kind: 'CPU', duration: 6 }] },
      { id: 'P2', arrival: 4, priority: 2, bursts: [{ kind: 'CPU', duration: 1 }] },
    ];
    const t = simulate(equal, { algorithm: 'PRIO_P' });
    assert.equal(t.summary.preemptions, 0, 'equal priority must not preempt');
    assert.deepEqual(completions(t), { P1: 6, P2: 7 });
  });

  it('does not preempt on a strictly lower priority arrival', () => {
    const lower = [
      { id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 6 }] },
      { id: 'P2', arrival: 4, priority: 3, bursts: [{ kind: 'CPU', duration: 1 }] },
    ];
    const t = simulate(lower, { algorithm: 'PRIO_P' });
    assert.equal(t.summary.preemptions, 0);
    assert.deepEqual(completions(t), { P1: 6, P2: 7 });
  });
});

describe('Priority starvation', () => {
  /**
   * The scenario spec §10 asks about: a low-priority process that arrives
   * *first* and still finishes last.
   *
   *   P9  arrival 0, priority 5, 5 units
   *   H0…H5 arrive at t=1…6, priority 1, 10 units each
   *
   *   t=0  P9 is the only process, so it is dispatched and runs [0,1)
   *   t=1  H0 arrives with strictly higher priority → P9 is evicted
   *   H0 [1,11) H1 [11,21) … H5 [51,61) — each newcomer outranks P9 and the
   *        ready queue is never empty of priority-1 work until H5 finishes
   *   t=61 P9 finally resumes with 4 units left and runs [61,65), completing
   *        at t=65 — it served 1 unit at t=0 and the remaining 4 at the end
   *
   * P9 therefore waits 60 ticks in the Ready Queue despite having the earliest
   * arrival and the earliest Ready Queue entry time in the whole workload — the
   * tie-break cannot save it, because every rival has a strictly better
   * priority.
   */
  const hog = { id: 'P9', arrival: 0, priority: 5, bursts: [{ kind: 'CPU', duration: 5 }] };
  const stream = [0, 1, 2, 3, 4, 5].map((i) => ({
    id: `H${i}`,
    arrival: i + 1,
    priority: 1,
    bursts: [{ kind: 'CPU', duration: 10 }],
  }));
  const timeline = simulate([hog, ...stream], { algorithm: 'PRIO_P' });

  it('evicts the victim exactly once, at the first higher-priority arrival', () => {
    // P9 *was* running (it arrived alone at t=0), so it is preempted once. It is
    // never preempted again because it never runs again until the stream ends.
    assert.equal(timeline.summary.preemptions, 1);
    assert.equal(byId(timeline).P9.preemptions, 1);
  });

  it('gives the victim a good response time and a terrible waiting time', () => {
    const p9 = byId(timeline).P9;
    // Response is to the *first* dispatch, which happened immediately at t=0 —
    // so response alone would flatter this scheduler. Ready waiting exposes it.
    assert.equal(p9.response, 0);
    assert.equal(p9.readyWait, 60);
    assert.equal(p9.completion, 65);
  });

  it('lets the victim finish, because the high-priority stream is finite', () => {
    // Genuine starvation needs an unbounded supply of higher-priority work.
    // With a finite stream the low-priority process is delayed, not starved —
    // the distinction matters when writing up §10.
    assert.equal(timeline.summary.completed, 7);
    assert.equal(timeline.warning, null);
  });

  it('the same workload under FCFS protects the early arrival', () => {
    // FCFS ignores priority, so arriving first actually means something.
    const fcfs = simulate([hog, ...stream], { algorithm: 'FCFS' });
    assert.equal(byId(fcfs).P9.completion, 5, 'P9 should finish at t=5 under FCFS');
    assert.equal(fcfs.summary.preemptions, 0);
    assert.ok(
      byId(fcfs).P9.readyWait < byId(timeline).P9.readyWait,
      'FCFS should spare the early arrival the priority scheduler inflicts',
    );
  });
});
