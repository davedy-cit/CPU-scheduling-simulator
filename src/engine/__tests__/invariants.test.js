/**
 * Structural invariants that must hold for *every* workload and algorithm.
 *
 * The hand-computed suites prove the engine gets specific cases right. These
 * prove it cannot get the general case incoherently wrong — a process in two
 * places at once, time appearing from nowhere, or two runs of the same input
 * disagreeing. They are cheap to state and catch whole classes of bug that a
 * fixed-expectation test would sail past.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { simulate } from '../simulate.js';
import { ALGORITHM_IDS, DEFAULT_QUANTUM } from '../constants.js';
import { generateWorkload, totalCpuDemand, totalIoDemand } from '../workload.js';
import { SAMPLE_WORKLOAD } from '../../data/sampleWorkload.js';
import { placementCounts } from './helpers.js';

/** Every workload/algorithm combination the invariants are checked against. */
const WORKLOADS = [
  ['§4 sample', SAMPLE_WORKLOAD],
  ['generated seed 1', generateWorkload(1, 5)],
  ['generated seed 7', generateWorkload(7, 4)],
  ['generated seed 42', generateWorkload(42, 6)],
  ['single process', [{ id: 'P1', arrival: 0, priority: 3, bursts: [{ kind: 'CPU', duration: 9 }] }]],
];

const CONFIGS = ALGORITHM_IDS.flatMap((algorithm) => [
  { algorithm, quantum: DEFAULT_QUANTUM },
  { algorithm, quantum: DEFAULT_QUANTUM, switchOverhead: 2 },
]);

describe('Every process is in exactly one place, every tick', () => {
  for (const [label, workload] of WORKLOADS) {
    for (const config of CONFIGS) {
      it(`${label} under ${config.algorithm}${config.switchOverhead ? ' +overhead' : ''}`, () => {
        const t = simulate(workload, config);
        assert.equal(t.warning, null, `unexpected warning: ${t.warning}`);

        for (const snap of t.snapshots) {
          const counts = placementCounts(snap);
          for (const p of t.processes) {
            assert.equal(
              counts[p.id] ?? 0,
              1,
              `t=${snap.tick}: ${p.id} occupies ${counts[p.id] ?? 0} places, expected exactly 1`,
            );
          }
        }
      });
    }
  }
});

describe('No process is ever in two queues at once', () => {
  it('keeps the Ready Queue, Job Queue and device queues disjoint', () => {
    const t = simulate(SAMPLE_WORKLOAD, { algorithm: 'RR', quantum: DEFAULT_QUANTUM });
    for (const snap of t.snapshots) {
      const ready = new Set(snap.readyQueue);
      for (const pid of snap.jobQueue) {
        assert.ok(!ready.has(pid), `t=${snap.tick}: ${pid} is in both the Job and Ready queues`);
      }
      for (const device of ['A', 'B']) {
        for (const pid of snap.devices[device].queue) {
          assert.ok(!ready.has(pid), `t=${snap.tick}: ${pid} is queued and ready at once`);
          assert.notEqual(snap.devices[device].busyPid, pid, `${pid} queued and in service at once`);
        }
      }
    }
  });
});

describe('Time is conserved', () => {
  it('accounts for every tick of a process’s life', () => {
    // For each process, the interval from arrival to completion is exactly its
    // CPU service + its I/O service + every tick it spent waiting in some
    // queue. Nothing is invented and nothing is lost. This is the strongest
    // single check that the waiting counters are not double-counting or
    // dropping ticks, and it is precisely the identity the spec warns the
    // textbook shortcut gets wrong.
    for (const [label, workload] of WORKLOADS) {
      // Restricted to zero switch overhead: switch ticks are charged to the
      // system, not to any process, so they legitimately break this identity.
      const t = simulate(workload, { algorithm: 'FCFS', switchOverhead: 0 });

      for (const m of t.metrics) {
        const spec = t.processes.find((p) => p.id === m.id);
        const cpu = spec.bursts.filter((b) => b.kind === 'CPU').reduce((s, b) => s + b.duration, 0);
        const ioFor = spec.bursts
          .filter((b) => b.kind !== 'CPU')
          .reduce((s, b) => s + b.duration, 0);

        assert.equal(
          m.jobWait + m.readyWait + m.deviceWait + cpu + ioFor,
          m.completion - m.arrival,
          `${label}/${m.id}: queued + service should equal lifetime`,
        );
      }
    }
  });

  it('accounts for every tick of the CPU lane', () => {
    for (const [label, workload] of WORKLOADS) {
      for (const config of CONFIGS) {
        const t = simulate(workload, config);
        assert.equal(
          t.summary.cpuBusyTime + t.summary.switchTime + t.summary.idleTime,
          t.snapshots.length - 1,
          `${label}/${config.algorithm}: busy + switch + idle must equal the run length`,
        );
      }
    }
  });

  it('never executes more CPU work than the workload demands', () => {
    for (const [label, workload] of WORKLOADS) {
      for (const config of CONFIGS) {
        const t = simulate(workload, config);
        const served = t.metrics.reduce((s, m) => s + m.cpuTime, 0);
        assert.equal(
          served,
          totalCpuDemand(t.processes),
          `${label}/${config.algorithm}: total CPU served must equal total CPU demanded`,
        );
      }
    }
  });

  it('services every I/O burst exactly once', () => {
    for (const [label, workload] of WORKLOADS) {
      for (const config of CONFIGS) {
        const t = simulate(workload, config);
        const demand = totalIoDemand(t.processes);
        const busy = t.deviceSegments.A
          .concat(t.deviceSegments.B)
          .filter((s) => s.kind === 'BUSY')
          .reduce((s, seg) => s + (seg.end - seg.start), 0);
        assert.equal(
          busy,
          demand.A + demand.B,
          `${label}/${config.algorithm}: device busy ticks must equal I/O demand`,
        );
      }
    }
  });
});

describe('Runs are deterministic', () => {
  it('two runs of the same input produce identical timelines', () => {
    // Spec §7 makes reproducible traces a graded requirement, so this is the
    // property Reset depends on: resetting must not produce a different answer
    // from the first run.
    for (const [label, workload] of WORKLOADS) {
      for (const config of CONFIGS) {
        const a = simulate(workload, config);
        const b = simulate(workload, config);
        assert.deepEqual(b.snapshots, a.snapshots, `${label}/${config.algorithm}: snapshots differ`);
        assert.deepEqual(b.events, a.events, `${label}/${config.algorithm}: event traces differ`);
        assert.deepEqual(b.metrics, a.metrics, `${label}/${config.algorithm}: metrics differ`);
      }
    }
  });

  it('does not mutate the workload it was given', () => {
    // The UI holds the workload in state and re-simulates on every config
    // change, so a mutating engine would corrupt the user's input.
    const original = JSON.parse(JSON.stringify(SAMPLE_WORKLOAD));
    simulate(SAMPLE_WORKLOAD, { algorithm: 'RR', quantum: 40 });
    assert.deepEqual(SAMPLE_WORKLOAD, original, 'the workload must come back unchanged');
  });

  it('is unaffected by the order processes are listed in', () => {
    // Arrival order, not array order, must drive the schedule. Reversing the
    // input may not change the outcome.
    const reversed = [...SAMPLE_WORKLOAD].reverse();
    for (const algorithm of ALGORITHM_IDS) {
      const a = simulate(SAMPLE_WORKLOAD, { algorithm, quantum: 40 });
      const b = simulate(reversed, { algorithm, quantum: 40 });
      assert.deepEqual(
        b.metrics.map((m) => [m.id, m.completion]),
        a.metrics.map((m) => [m.id, m.completion]),
        `${algorithm}: input order changed the result`,
      );
    }
  });
});

describe('Every run terminates', () => {
  it('completes all processes without tripping the runaway guard', () => {
    for (const [label, workload] of WORKLOADS) {
      for (const config of CONFIGS) {
        const t = simulate(workload, config);
        assert.equal(t.warning, null, `${label}/${config.algorithm}: ${t.warning}`);
        assert.equal(
          t.summary.completed,
          t.processes.length,
          `${label}/${config.algorithm}: not every process completed`,
        );
      }
    }
  });

  it('terminates even under a pathological quantum of 1', () => {
    const t = simulate(SAMPLE_WORKLOAD, { algorithm: 'RR', quantum: 1 });
    assert.equal(t.warning, null);
    assert.equal(t.summary.completed, 5);
    assert.ok(t.snapshots.length < 100000, 'must not approach the guard');
  });

  it('warns rather than hanging on an invalid workload', () => {
    const broken = [
      { id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 4 }] },
      { id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 4 }] },
    ];
    const t = simulate(broken, { algorithm: 'FCFS' });
    assert.ok(t.warning, 'a duplicate ID must produce a warning');
    assert.deepEqual(t.snapshots, []);
    assert.equal(t.summary.completed, 0);
  });

  it('warns on a workload that violates the burst alternation rule', () => {
    // Three CPU bursts: the count is legal and it begins and ends with CPU, so
    // alternation is the only rule left to catch it.
    const bad = [
      {
        id: 'P1',
        arrival: 0,
        priority: 1,
        bursts: [
          { kind: 'CPU', duration: 4 },
          { kind: 'CPU', duration: 4 },
          { kind: 'CPU', duration: 4 },
        ],
      },
    ];
    const t = simulate(bad, { algorithm: 'FCFS' });
    assert.ok(t.warning?.includes('alternate'), `expected an alternation warning, got: ${t.warning}`);
  });

  it('warns on a process that ends with an I/O burst', () => {
    const bad = [
      {
        id: 'P1',
        arrival: 0,
        priority: 1,
        bursts: [
          { kind: 'CPU', duration: 4 },
          { kind: 'A', duration: 4 },
          { kind: 'CPU', duration: 4 },
          { kind: 'A', duration: 4 },
        ],
      },
    ];
    const t = simulate(bad, { algorithm: 'FCFS' });
    assert.ok(t.warning, 'a four-burst process is not permitted by §4');
    assert.deepEqual(t.snapshots, [], 'and must not be simulated');
  });
});

describe('Metrics stay finite', () => {
  it('produces no NaN or Infinity in any summary field', () => {
    for (const [label, workload] of WORKLOADS) {
      for (const config of CONFIGS) {
        const t = simulate(workload, config);
        for (const [key, value] of Object.entries(t.summary)) {
          if (typeof value !== 'number') continue;
          assert.ok(
            Number.isFinite(value),
            `${label}/${config.algorithm}: summary.${key} is ${value}`,
          );
        }
      }
    }
  });

  it('keeps utilisation within 0–100%', () => {
    for (const [label, workload] of WORKLOADS) {
      for (const config of CONFIGS) {
        const t = simulate(workload, config);
        for (const key of ['cpuUtilization', 'deviceUtilizationA', 'deviceUtilizationB']) {
          const v = t.summary[key];
          assert.ok(v >= 0 && v <= 100, `${label}/${config.algorithm}: ${key} = ${v}`);
        }
      }
    }
  });
});
