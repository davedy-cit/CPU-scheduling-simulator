/**
 * Devices, blocking and the WAITING state — spec §5, §6 and §7.
 *
 * Four properties are graded here:
 *   - each device is a single FIFO server, so a second requester queues;
 *   - the two devices are concurrent with each other *and* with the CPU;
 *   - an I/O completion can trigger a preemption even though no process
 *     arrived — the case spec §10 explicitly asks about;
 *   - `device waiting` counts only time spent *queued*, never time being
 *     serviced (spec §9).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { simulate } from '../simulate.js';
import { IO_SET, IO_EXPECTED } from '../../data/presets.js';
import { byId, close, completions, cpuTrace, deviceBusy, traceIs } from './helpers.js';

describe('Device A contention', () => {
  const timeline = simulate(IO_SET, { algorithm: 'FCFS' });
  const expected = IO_EXPECTED;

  it('makes the second requester wait, then promotes it FIFO', () => {
    // P1 takes A from t=2. P2 asks at t=3, is queued, and is promoted the
    // instant P1's service ends at t=7.
    traceIs(deviceBusy(timeline, 'A'), 'P1[2,7) P2[7,10)', 'device A service spans');
    assert.deepEqual(completions(timeline), expected.completion);
  });

  it('charges only the queued ticks to device waiting', () => {
    // P2 sits in A's queue from t=3 to t=7 — four ticks. The three ticks it is
    // actually being serviced are *not* waiting, which is exactly the
    // distinction the spec draws when it warns against the textbook shortcut.
    assert.equal(byId(timeline).P2.deviceWait, expected.deviceAWait.P2);
    assert.equal(byId(timeline).P1.deviceWait, expected.deviceAWait.P1);
  });

  it('measures device busy time as service time, not wall time', () => {
    assert.equal(timeline.summary.deviceUtilizationA, (expected.deviceABusyTicks / expected.makespan) * 100);
    assert.equal(timeline.summary.deviceUtilizationB, 0, 'device B is never used by this workload');
  });

  it('idles the CPU while every process is blocked on I/O', () => {
    // Nothing is ready from t=3 to t=7: P1 is being serviced and P2 is queued.
    assert.ok(timeline.summary.idleTime > 0);
    assert.equal(timeline.snapshots[4].cpu.pid, null);
    assert.equal(timeline.snapshots[4].devices.A.busyPid, 'P1');
    assert.deepEqual(timeline.snapshots[4].devices.A.queue, ['P2']);
  });

  it('returns a process to the Ready Queue when its I/O completes', () => {
    const p1 = byId(timeline).P1;
    // P1's CPU burst ended at t=2; it is back in the CPU timeline at t=7.
    assert.equal(p1.completion, 9);
    assert.equal(p1.ioRequests, 1);
    assert.equal(p1.cpuTime, 4, 'two units of CPU either side of the I/O burst');
  });

  it('records the WAITING state and the device it is waiting on', () => {
    const waiting = timeline.snapshots[4].proc.P2;
    assert.equal(waiting.state, 'WAITING');
    assert.equal(waiting.device, 'A');
    // P1 is being serviced, so it is WAITING too — service is not "ready".
    assert.equal(timeline.snapshots[4].proc.P1.state, 'WAITING');
  });
});

describe('Device concurrency', () => {
  /**
   * One process on each device, overlapping in time.
   *
   *   P1: CPU 2, A 6, CPU 2      P2: CPU 2, B 6, CPU 2
   *
   *   P1 [0,2)   P2 [2,4)   IDLE [4,8)   P1 [8,10)   P2 [10,12)
   *   A:        P1 [2,8)
   *   B:                  P2 [4,10)
   *
   * Between t=4 and t=8 both devices are busy at once while the CPU is idle —
   * the clearest evidence that devices are independent servers.
   */
  const set = [
    {
      id: 'P1',
      arrival: 0,
      priority: 1,
      bursts: [
        { kind: 'CPU', duration: 2 },
        { kind: 'A', duration: 6 },
        { kind: 'CPU', duration: 2 },
      ],
    },
    {
      id: 'P2',
      arrival: 0,
      priority: 1,
      bursts: [
        { kind: 'CPU', duration: 2 },
        { kind: 'B', duration: 6 },
        { kind: 'CPU', duration: 2 },
      ],
    },
  ];
  const timeline = simulate(set, { algorithm: 'FCFS' });

  it('runs both devices at once', () => {
    traceIs(cpuTrace(timeline), 'P1[0,2) P2[2,4) IDLE[4,8) P1[8,10) P2[10,12)', 'CPU trace');
    traceIs(deviceBusy(timeline, 'A'), 'P1[2,8)', 'device A');
    traceIs(deviceBusy(timeline, 'B'), 'P2[4,10)', 'device B');

    // Overlap of A and B on [4,8).
    assert.equal(timeline.snapshots[6].devices.A.busyPid, 'P1');
    assert.equal(timeline.snapshots[6].devices.B.busyPid, 'P2');
    assert.equal(timeline.snapshots[6].cpu.pid, null, 'and the CPU is idle meanwhile');
  });

  it('neither process ever queues, because each has its own device', () => {
    assert.equal(byId(timeline).P1.deviceWait, 0);
    assert.equal(byId(timeline).P2.deviceWait, 0);
  });

  it('reports both device utilisations independently', () => {
    close(timeline.summary.deviceUtilizationA, 50, 'device A utilisation');
    close(timeline.summary.deviceUtilizationB, 50, 'device B utilisation');
    assert.deepEqual(completions(timeline), { P1: 10, P2: 12 });
  });
});

describe('I/O completion triggering preemption (spec §10)', () => {
  /**
   * No process arrives at t=6 — yet a preemption happens there.
   *
   *   P1: CPU 10        (arrival 0)
   *   P2: CPU 2, A 4, CPU 2   (arrival 0)
   *
   *   t=0  P2 has 2 units left against P1's 10, so SRTF runs P2
   *   t=2  P2 blocks on A [2,6); P1 takes the CPU
   *   t=6  P2's I/O completes and it re-enters the Ready Queue with 2 units
   *        left, against P1's 6 remaining. 2 < 6, so P1 is evicted — the
   *        preemption is caused purely by the I/O completion
   *   P2 [6,8) finishes, then P1 serves its last 6 units in [8,14)
   *
   * P1 has 10 units of work and serves 4 of them in [2,6), so 6 remain after
   * the preemption — hence a completion at t=14, not t=18.
   */
  const set = [
    { id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 10 }] },
    {
      id: 'P2',
      arrival: 0,
      priority: 1,
      bursts: [
        { kind: 'CPU', duration: 2 },
        { kind: 'A', duration: 4 },
        { kind: 'CPU', duration: 2 },
      ],
    },
  ];
  const timeline = simulate(set, { algorithm: 'SRTF' });

  it('preempts at the I/O completion tick', () => {
    traceIs(
      cpuTrace(timeline),
      'P2[0,2) P1[2,6) P2[6,8) P1[8,14)',
      'SRTF with an I/O return',
    );
  });

  it('proves no arrival occurred at the preemption tick', () => {
    // The whole point: at t=6 nothing arrives. The tick's events are the I/O
    // completion, the preemption it causes, and the dispatch of P2 that
    // follows — and crucially no ARRIVE.
    const atSix = timeline.events.filter((e) => e.tick === 6);
    assert.deepEqual(
      atSix.map((e) => e.reason).sort(),
      ['CONTEXT_SWITCH', 'IO_COMPLETE', 'PREEMPT'],
      'an I/O completion, the preemption it causes, and the resulting switch',
    );
    assert.equal(
      atSix.filter((e) => e.reason === 'ARRIVE').length,
      0,
      'no process arrived, so the preemption is attributable to I/O alone',
    );
  });

  it('makes the I/O device the indirect author of the preemption', () => {
    assert.equal(timeline.summary.preemptions, 1);
    assert.equal(byId(timeline).P1.preemptions, 1);
    // P2 is never preempted — it blocks voluntarily and finishes its short burst.
    assert.equal(byId(timeline).P2.preemptions, 0);
  });
});

describe('Multiple I/O phases', () => {
  it('returns a process to the CPU once per I/O burst, in order', () => {
    // P1 alternates CPU/A/CPU/B/CPU, exercising both devices in one process.
    const set = [
      {
        id: 'P1',
        arrival: 0,
        priority: 1,
        bursts: [
          { kind: 'CPU', duration: 2 },
          { kind: 'A', duration: 2 },
          { kind: 'CPU', duration: 2 },
          { kind: 'B', duration: 2 },
          { kind: 'CPU', duration: 2 },
        ],
      },
    ];
    const t = simulate(set, { algorithm: 'FCFS' });
    traceIs(cpuTrace(t), 'P1[0,2) IDLE[2,4) P1[4,6) IDLE[6,8) P1[8,10)', 'alternating bursts');
    traceIs(deviceBusy(t, 'A'), 'P1[2,4)', 'device A');
    traceIs(deviceBusy(t, 'B'), 'P1[6,8)', 'device B');

    const m = byId(t).P1;
    assert.equal(m.ioRequests, 2);
    assert.equal(m.cpuTime, 6, 'three CPU bursts of two units each');
    assert.equal(m.deviceWait, 0, 'each device was free when requested');
    assert.equal(m.completion, 10);
  });
});
