/**
 * Performance measures — spec §9.
 *
 * The spec singles out two definitions that are easy to implement plausibly and
 * wrongly, so both get a dedicated test:
 *
 *   - CPU utilisation "EXCLUDES context-switch time", and
 *   - context switches are "a change between two different running PIDs (do not
 *     count first dispatch)".
 *
 * The spec also warns that `waiting = turnaround − total CPU time` is invalid
 * for a multiburst simulation. The final block demonstrates that the shortcut
 * genuinely disagrees with the engine, rather than merely asserting it does.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { simulate } from '../simulate.js';
import { byId, close, completions, cpuTrace, traceIs } from './helpers.js';

/** Two processes that must switch once, with a configurable switch cost. */
const twoJobs = [
  { id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 4 }] },
  { id: 'P2', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 4 }] },
];

describe('Context-switch overhead', () => {
  it('costs nothing by default', () => {
    const t = simulate(twoJobs, { algorithm: 'FCFS' });
    assert.equal(t.summary.switchTime, 0);
    assert.deepEqual(completions(t), { P1: 4, P2: 8 });
    close(t.summary.cpuUtilization, 100, 'CPU utilisation with no overhead');
  });

  it('inserts a real SWITCH segment when overhead is positive', () => {
    const t = simulate(twoJobs, { algorithm: 'FCFS', switchOverhead: 2 });
    traceIs(cpuTrace(t), 'P1[0,4) SWITCH[4,6) P2[6,10)', 'CPU trace with a 2-tick switch');

    // The first dispatch is not a switch, so only one switch occurs.
    assert.equal(t.summary.contextSwitches, 1);
    assert.equal(t.summary.switchTime, 2);
    assert.deepEqual(completions(t), { P1: 4, P2: 10 }, 'P2 starts two ticks late');
  });

  it('excludes switch ticks from CPU utilisation', () => {
    const t = simulate(twoJobs, { algorithm: 'FCFS', switchOverhead: 2 });
    // 8 ticks of real work in a 10-tick makespan is 80%, not 100%.
    assert.equal(t.summary.cpuBusyTime, 8);
    assert.equal(t.summary.makespan, 10);
    close(t.summary.cpuUtilization, 80, 'CPU utilisation excludes the switch');
    assert.ok(t.summary.cpuUtilization < 100, 'the switch must cost something');
  });

  it('conserves the CPU lane exactly: busy + switch + idle = makespan', () => {
    for (const overhead of [0, 1, 3, 5]) {
      const t = simulate(twoJobs, { algorithm: 'FCFS', switchOverhead: overhead });
      assert.equal(
        t.summary.cpuBusyTime + t.summary.switchTime + t.summary.idleTime,
        t.summary.makespan,
        `overhead ${overhead}: every tick is accounted for`,
      );
    }
  });

  it('delays completion by exactly the switch cost', () => {
    const base = simulate(twoJobs, { algorithm: 'FCFS', switchOverhead: 0 });
    for (const overhead of [1, 2, 4]) {
      const t = simulate(twoJobs, { algorithm: 'FCFS', switchOverhead: overhead });
      assert.equal(
        byId(t).P2.completion,
        byId(base).P2.completion + overhead,
        `P2 completes ${overhead} ticks later`,
      );
    }
  });

  it('never charges overhead to the first dispatch', () => {
    // With one process there is nothing to switch to, so a positive overhead
    // must cost nothing at all.
    const single = [{ id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 5 }] }];
    const t = simulate(single, { algorithm: 'FCFS', switchOverhead: 7 });
    assert.equal(t.summary.switchTime, 0);
    assert.equal(t.summary.contextSwitches, 0);
    assert.deepEqual(completions(t), { P1: 5 });
  });

  it('does not charge overhead after an idle gap', () => {
    // P1 finishes, the CPU idles, then P2 arrives. Going from idle to running
    // is a dispatch, not a switch, so no overhead is paid.
    const gap = [
      { id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 3 }] },
      { id: 'P2', arrival: 10, priority: 1, bursts: [{ kind: 'CPU', duration: 3 }] },
    ];
    const t = simulate(gap, { algorithm: 'FCFS', switchOverhead: 4 });
    assert.equal(t.summary.switchTime, 0, 'idle → run is not a context switch');
    assert.equal(t.summary.contextSwitches, 0);
    assert.deepEqual(completions(t), { P1: 3, P2: 13 });
  });
});

describe('Context-switch counting', () => {
  it('excludes the first dispatch', () => {
    const single = [{ id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 4 }] }];
    const t = simulate(single, { algorithm: 'FCFS' });
    assert.equal(t.summary.dispatches, 1);
    assert.equal(t.summary.contextSwitches, 0, 'one dispatch is zero switches');
  });

  it('counts only changes between different running PIDs', () => {
    // Five processes, all arriving together, run back to back: five dispatches
    // but only four switches between distinct PIDs.
    const five = [1, 2, 3, 4, 5].map((i) => ({
      id: `P${i}`,
      arrival: 0,
      priority: 1,
      bursts: [{ kind: 'CPU', duration: 2 }],
    }));
    const t = simulate(five, { algorithm: 'FCFS' });
    assert.equal(t.summary.dispatches, 5);
    assert.equal(t.summary.contextSwitches, 4);
  });

  it('does not count a re-dispatch of the same process as a switch', () => {
    // A process that blocks on I/O and returns is dispatched twice, but it is
    // the same PID both times, so no switch is recorded.
    const set = [
      {
        id: 'P1',
        arrival: 0,
        priority: 1,
        bursts: [
          { kind: 'CPU', duration: 2 },
          { kind: 'A', duration: 2 },
          { kind: 'CPU', duration: 2 },
        ],
      },
    ];
    const t = simulate(set, { algorithm: 'FCFS' });
    assert.equal(t.summary.dispatches, 2);
    assert.equal(t.summary.contextSwitches, 0, 'same PID before and after the I/O');
  });

  it('agrees with the number of CONTEXT_SWITCH events in the trace', () => {
    const set = [
      { id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 6 }] },
      { id: 'P2', arrival: 2, priority: 1, bursts: [{ kind: 'CPU', duration: 6 }] },
      { id: 'P3', arrival: 20, priority: 1, bursts: [{ kind: 'CPU', duration: 2 }] },
    ];
    for (const algorithm of ['FCFS', 'SJF_NP', 'SRTF', 'PRIO_NP', 'PRIO_P', 'RR']) {
      const t = simulate(set, { algorithm, quantum: 4 });
      const events = t.events.filter((e) => e.reason === 'CONTEXT_SWITCH').length;
      assert.equal(t.summary.contextSwitches, events, `${algorithm} switch count matches trace`);
    }
  });
});

describe('Aggregate measures', () => {
  it('computes makespan as lastCompletion − minArrival', () => {
    const set = [
      { id: 'P1', arrival: 10, priority: 1, bursts: [{ kind: 'CPU', duration: 4 }] },
      { id: 'P2', arrival: 12, priority: 1, bursts: [{ kind: 'CPU', duration: 4 }] },
    ];
    const t = simulate(set, { algorithm: 'FCFS' });
    // P1 [10,14), P2 [14,18): last completion 18, earliest arrival 10.
    assert.equal(t.summary.makespan, 8);
    close(t.summary.cpuUtilization, 100, 'the CPU is busy for the whole makespan');
  });

  it('computes throughput as completed ÷ makespan', () => {
    const t = simulate(twoJobs, { algorithm: 'FCFS' });
    assert.equal(t.summary.completed, 2);
    assert.equal(t.summary.makespan, 8);
    close(t.summary.throughput, 0.25, 'throughput');
  });

  it('averages response over processes that actually ran', () => {
    // A process that never ran has a null response and must not drag the mean
    // toward zero by being counted as 0.
    const set = [
      { id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 4 }] },
      { id: 'P2', arrival: 1, priority: 1, bursts: [{ kind: 'CPU', duration: 4 }] },
    ];
    const t = simulate(set, { algorithm: 'FCFS' });
    // P1 response 0, P2 response 3 (dispatched at 4, arrived at 1).
    close(t.summary.avgResponse, 1.5, 'average response');
  });

  it('reports null averages rather than NaN for an empty result set', () => {
    // An invalid workload yields an empty timeline; every average must be null
    // or finite, never NaN, or the KPI tiles would render "NaN".
    const t = simulate([], { algorithm: 'FCFS' });
    assert.ok(t.warning, 'an empty workload should warn');
    assert.equal(t.summary.avgTurnaround, null);
    assert.equal(t.summary.avgResponse, null);
    assert.ok(Number.isFinite(t.summary.cpuUtilization), 'utilisation stays finite');
    assert.ok(Number.isFinite(t.summary.throughput), 'throughput stays finite');
  });
});

describe('The invalid textbook shortcut (spec §9)', () => {
  it('waiting = turnaround − CPU time is wrong once I/O is involved', () => {
    // Spec §9 explicitly invalidates this shortcut. This test exists to show
    // the engine does not use it, and to quantify the error for the write-up.
    const set = [
      {
        id: 'P1',
        arrival: 0,
        priority: 1,
        bursts: [
          { kind: 'CPU', duration: 2 },
          { kind: 'A', duration: 10 },
          { kind: 'CPU', duration: 2 },
        ],
      },
      { id: 'P2', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 2 }] },
    ];
    const t = simulate(set, { algorithm: 'FCFS' });
    const p1 = byId(t).P1;

    const shortcut = p1.turnaround - p1.cpuTime;
    // The shortcut counts the 10 ticks of I/O service as if they were waiting.
    assert.equal(p1.readyWait, 0, 'P1 is never actually waiting in the Ready Queue');
    assert.equal(p1.deviceWait, 0, 'and it never queues behind another device user');
    assert.equal(shortcut, 10, 'the shortcut invents 10 units of waiting out of I/O service');
    assert.notEqual(
      shortcut,
      p1.readyWait + p1.jobWait + p1.deviceWait,
      'the shortcut disagrees with the engine, exactly as the spec warns',
    );
  });

  it('ready waiting excludes time spent in the Job Queue', () => {
    // With an admission limit of one, the second process waits in the Job Queue
    // and must not be charged to ready waiting.
    const set = [
      { id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 4 }] },
      { id: 'P2', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 4 }] },
    ];
    const t = simulate(set, { algorithm: 'FCFS', admissionLimit: 1 });
    const p2 = byId(t).P2;
    assert.equal(p2.jobWait, 4, 'P2 waits four ticks for an admission slot');
    assert.equal(p2.readyWait, 0, 'but never waits in the Ready Queue');
    assert.equal(p2.completion, 8);
  });
});
