/**
 * Gantt derivation — spec §8.
 *
 * The requirement is "a CPU Gantt chart and separate Device A / B timelines,
 * including Idle and Context Switch segments." Because the run is precomputed,
 * these are derived once and then revealed progressively as the cursor advances.
 *
 * The property that matters most is that the segments *tile* the run: no gaps,
 * no overlaps, no missing ticks. A chart with a hole in it looks plausible and
 * is completely wrong, so it is asserted directly.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { simulate } from '../simulate.js';
import { SAMPLE_WORKLOAD } from '../../data/sampleWorkload.js';
import { RR_SET, SRTF_SET, IO_SET, FCFS_SJF_SET } from '../../data/presets.js';
import { deviceBusy, traceIs } from './helpers.js';

/**
 * Assert a segment list covers `[0, total)` exactly once, with no holes.
 *
 * @param {import('../types.js').GanttSegment[]} segments
 * @param {number} total
 * @param {string} what
 */
function assertTiles(segments, total, what) {
  assert.ok(segments.length > 0, `${what}: expected at least one segment`);
  assert.equal(segments[0].start, 0, `${what}: must start at 0`);

  let cursor = 0;
  for (const [i, seg] of segments.entries()) {
    assert.equal(
      seg.start,
      cursor,
      `${what}: segment ${i} starts at ${seg.start} but the previous ended at ${cursor}`,
    );
    assert.ok(seg.end > seg.start, `${what}: segment ${i} is empty`);
    cursor = seg.end;
  }
  assert.equal(cursor, total, `${what}: must end at ${total}`);
}

const CASES = [
  ['FCFS', FCFS_SJF_SET, {}],
  ['SJF_NP', FCFS_SJF_SET, {}],
  ['SRTF', SRTF_SET, {}],
  ['RR', RR_SET, { quantum: 4 }],
  ['RR q=75 on the §4 workload', SAMPLE_WORKLOAD, { quantum: 75 }],
  ['SRTF on the §4 workload', SAMPLE_WORKLOAD, {}],
  ['FCFS with I/O', IO_SET, {}],
  ['FCFS with switch overhead', FCFS_SJF_SET, { switchOverhead: 3 }],
];

describe('Gantt segments tile the run', () => {
  for (const [label, workload, config] of CASES) {
    it(label, () => {
      const algorithm = config.algorithm ?? label.split(' ')[0];
      const t = simulate(workload, { ...config, algorithm });

      // Snapshot `i` covers `[i, i + 1)`, so `n` snapshots describe `n - 1`
      // intervals. Taking the lane length from the snapshot count avoids
      // re-deriving it from makespan and the earliest arrival.
      const total = t.snapshots.length - 1;

      assertTiles(t.cpuSegments, total, `${label} CPU lane`);
      assertTiles(t.deviceSegments.A, total, `${label} device A lane`);
      assertTiles(t.deviceSegments.B, total, `${label} device B lane`);
    });
  }

  it('the lane length agrees with makespan and the earliest arrival', () => {
    // The two derivations must not drift apart, since the chart is laid out
    // from the lane length while the ruler is labelled from makespan.
    for (const [label, workload, config] of CASES) {
      const algorithm = config.algorithm ?? label.split(' ')[0];
      const t = simulate(workload, { ...config, algorithm });
      const minArrival = Math.min(...workload.map((p) => p.arrival));
      assert.equal(
        t.snapshots.length - 1,
        t.summary.makespan + minArrival,
        `${label}: lane length vs makespan + earliest arrival`,
      );
    }
  });
});

describe('CPU lane segment kinds', () => {
  it('marks idle stretches as IDLE rather than omitting them', () => {
    const set = [
      { id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 2 }] },
      { id: 'P2', arrival: 5, priority: 1, bursts: [{ kind: 'CPU', duration: 2 }] },
    ];
    const t = simulate(set, { algorithm: 'FCFS' });
    traceIs(
      t.cpuSegments.map((s) => `${s.pid ?? s.kind}[${s.start},${s.end})`).join(' '),
      'P1[0,2) IDLE[2,5) P2[5,7)',
      'idle gap is present in the lane',
    );
  });

  it('marks context-switch overhead as SWITCH with no owning process', () => {
    const set = [
      { id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 2 }] },
      { id: 'P2', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 2 }] },
    ];
    const t = simulate(set, { algorithm: 'FCFS', switchOverhead: 2 });
    const sw = t.cpuSegments.filter((s) => s.kind === 'SWITCH');
    assert.equal(sw.length, 1);
    assert.deepEqual(sw[0], { start: 2, end: 4, pid: null, kind: 'SWITCH' });
  });

  it('emits no SWITCH segment at zero overhead', () => {
    const t = simulate(FCFS_SJF_SET, { algorithm: 'FCFS' });
    assert.equal(t.cpuSegments.filter((s) => s.kind === 'SWITCH').length, 0);
  });

  it('merges adjacent ticks with the same occupant into one segment', () => {
    // Run-length encoding must not emit one segment per tick. A 24-unit burst
    // with no interruption is a single span.
    const t = simulate(RR_SET, { algorithm: 'RR', quantum: 4 });
    const last = t.cpuSegments[t.cpuSegments.length - 1];
    assert.deepEqual(last, { start: 10, end: 30, pid: 'P1', kind: 'RUN' });
    assert.equal(t.cpuSegments.length, 4, 'four spans, not thirty');
  });
});

describe('Device lanes are independent of the CPU lane', () => {
  const t = simulate(IO_SET, { algorithm: 'FCFS' });

  it('reports device busy spans separately from CPU spans', () => {
    traceIs(deviceBusy(t, 'A'), 'P1[2,7) P2[7,10)', 'device A');
    // The CPU lane is genuinely different, so the two are not aliases.
    assert.notEqual(
      t.cpuSegments.map((s) => s.pid).join(),
      t.deviceSegments.A.map((s) => s.pid).join(),
    );
  });

  it('shows a device idle while the CPU is busy', () => {
    // At t=0 the CPU runs P1 and device A has not been requested yet.
    assert.equal(t.snapshots[0].cpu.pid, 'P1');
    assert.equal(t.snapshots[0].devices.A.busyPid, null);
    assert.equal(t.deviceSegments.A[0].kind, 'IDLE');
  });

  it('shows the CPU idle while a device is busy', () => {
    // At t=4 P2 is queued behind P1 on device A and nothing is ready.
    assert.equal(t.snapshots[4].cpu.pid, null);
    assert.equal(t.snapshots[4].devices.A.busyPid, 'P1');
  });

  it('gives each device its own queue in the snapshot', () => {
    const snap = t.snapshots[4];
    assert.deepEqual(snap.devices.A.queue, ['P2']);
    assert.deepEqual(snap.devices.B.queue, []);
    // The queues must be separate arrays, not two references to one.
    assert.notEqual(snap.devices.A.queue, snap.devices.B.queue);
  });
});

describe('Snapshot history is immutable', () => {
  it('does not let a later tick rewrite an earlier snapshot', () => {
    // The hazard of a precomputed timeline is aliasing: if snapshots shared a
    // mutable array, the final state would leak backwards into every earlier
    // tick and the whole chart would be wrong.
    const t = simulate(IO_SET, { algorithm: 'FCFS' });
    const early = t.snapshots[4];
    const earlyQueue = [...early.devices.A.queue];
    const earlyReady = [...early.readyQueue];

    // Re-simulate so we hold a second, independent timeline; the first must be
    // untouched by it.
    simulate(IO_SET, { algorithm: 'FCFS' });

    assert.deepEqual(early.devices.A.queue, earlyQueue);
    assert.deepEqual(early.readyQueue, earlyReady);
    assert.equal(early.devices.A.busyPid, 'P1', 'history still shows P1 in service at t=4');
  });

  it('gives each snapshot its own queue arrays', () => {
    const t = simulate(IO_SET, { algorithm: 'FCFS' });
    assert.notEqual(t.snapshots[4].readyQueue, t.snapshots[5].readyQueue);
    assert.notEqual(t.snapshots[4].devices.A.queue, t.snapshots[5].devices.A.queue);
  });

  it('keeps process records identity-stable while they are being serviced', () => {
    // Copy-on-write means an unchanged record keeps its identity, which is what
    // lets React.memo skip re-rendering a chip that has not moved. P1 is on
    // device A from t=2 to t=7 and its own record is not touched meanwhile —
    // the device's progress lives on the device, not on the process.
    const t = simulate(IO_SET, { algorithm: 'FCFS' });
    assert.equal(t.snapshots[5].proc.P1, t.snapshots[6].proc.P1, 'P1 is unchanged in service');
  });

  it('rebuilds a record on any tick that changes it', () => {
    const t = simulate(IO_SET, { algorithm: 'FCFS' });
    // P1 is running over [0,2), so its remaining time and CPU time both move.
    assert.notEqual(t.snapshots[0].proc.P1, t.snapshots[1].proc.P1, 'P1 ran, so it changed');
  });

  it('rebuilds a queued record every tick, because its wait counter moves', () => {
    // Worth knowing when reasoning about render cost: a process sitting in a
    // queue is patched every tick to accrue its waiting time, so its record is
    // *not* identity-stable even though the chip does not visually move. The
    // memo optimisation therefore helps serviced processes, not queued ones —
    // with five processes this is immaterial, but it is not what you would
    // guess from the copy-on-write design alone.
    const t = simulate(IO_SET, { algorithm: 'FCFS' });
    assert.notEqual(t.snapshots[5].proc.P2, t.snapshots[6].proc.P2, 'P2 is queued on device A');
    assert.equal(t.snapshots[6].proc.P2.deviceWait, t.snapshots[5].proc.P2.deviceWait + 1);
  });
});
