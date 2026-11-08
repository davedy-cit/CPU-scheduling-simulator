/**
 * FCFS and SJF (non-preemptive) — spec §3.
 *
 * The pair is tested together because the interesting result is the *contrast*:
 * on the same workload, choosing the shortest next burst lowers average waiting.
 * Both are non-preemptive, so neither may ever record a preemption.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { simulate } from '../simulate.js';
import { FCFS_SJF_SET, FCFS_SJF_EXPECTED } from '../../data/presets.js';
import { byId, close, completions, cpuTrace, traceIs } from './helpers.js';

describe('FCFS', () => {
  const timeline = simulate(FCFS_SJF_SET, { algorithm: 'FCFS' });
  const expected = FCFS_SJF_EXPECTED.FCFS;

  it('dispatches in arrival order, ignoring burst length', () => {
    // P4 arrives first and is longest-but-one; FCFS must still run it first.
    traceIs(cpuTrace(timeline), 'P4[0,3) P3[3,11) P1[11,17) P5[17,21) P2[21,23)', 'FCFS trace');
  });

  it('produces the hand-computed completion times', () => {
    assert.deepEqual(completions(timeline), expected.completion);
  });

  it('produces the hand-computed averages', () => {
    close(timeline.summary.avgReadyWait, expected.avgWaiting, 'FCFS avg ready waiting');
    close(timeline.summary.avgTurnaround, expected.avgTurnaround, 'FCFS avg turnaround');
  });

  it('never preempts', () => {
    assert.equal(timeline.summary.preemptions, 0);
    assert.equal(timeline.events.filter((e) => e.reason === 'PREEMPT').length, 0);
  });

  it('holds every process to its CPU demand', () => {
    // FCFS changes nothing about how much CPU a process needs.
    for (const m of timeline.metrics) {
      const spec = FCFS_SJF_SET.find((p) => p.id === m.id);
      const demand = spec.bursts.reduce((s, b) => s + b.duration, 0);
      assert.equal(m.cpuTime, demand, `${m.id} CPU time`);
    }
  });
});

describe('SJF (non-preemptive)', () => {
  const timeline = simulate(FCFS_SJF_SET, { algorithm: 'SJF_NP' });
  const expected = FCFS_SJF_EXPECTED.SJF_NP;

  it('reorders to shortest-next-burst at each decision point', () => {
    // At t=9 the ready set is P3(8), P5(4), P2(2) — P2 goes next, not P3.
    // A "longest first" or arrival-order bug shows up here immediately.
    traceIs(cpuTrace(timeline), 'P4[0,3) P1[3,9) P2[9,11) P5[11,15) P3[15,23)', 'SJF trace');
  });

  it('produces the hand-computed completion times', () => {
    assert.deepEqual(completions(timeline), expected.completion);
  });

  it('beats FCFS on average waiting, which is the textbook result', () => {
    close(timeline.summary.avgReadyWait, expected.avgWaiting, 'SJF avg ready waiting');
    close(timeline.summary.avgTurnaround, expected.avgTurnaround, 'SJF avg turnaround');

    const fcfs = simulate(FCFS_SJF_SET, { algorithm: 'FCFS' });
    assert.ok(
      timeline.summary.avgReadyWait < fcfs.summary.avgReadyWait,
      'SJF should reduce average waiting versus FCFS',
    );
  });

  it('never preempts, even when a shorter job arrives mid-run', () => {
    assert.equal(timeline.summary.preemptions, 0);
  });

  it('does not use the remaining time of a burst already in progress', () => {
    // P1 is dispatched at t=3 with its full 6-unit burst. SJF reads the *full*
    // next burst; if it wrongly read `remaining` it would behave like SRTF and
    // preempt P1 at t=4 when P5 (4 units) arrives.
    const running = timeline.snapshots[4].cpu.pid;
    assert.equal(running, 'P1', 'P1 should still hold the CPU at t=4 under SJF');
    assert.equal(timeline.summary.preemptions, 0);
  });
});

describe('FCFS and SJF agree on a single process', () => {
  const one = [{ id: 'P1', arrival: 5, priority: 1, bursts: [{ kind: 'CPU', duration: 7 }] }];

  it('both dispatch at arrival and complete at arrival + burst', () => {
    for (const algorithm of ['FCFS', 'SJF_NP']) {
      const t = simulate(one, { algorithm });
      assert.deepEqual(completions(t), { P1: 12 }, algorithm);
      close(t.summary.avgReadyWait, 0, `${algorithm} waiting`);
      close(t.summary.avgResponse, 0, `${algorithm} response`);
      // The CPU is idle before the arrival, and the Gantt must say so.
      assert.equal(t.cpuSegments[0].kind, 'IDLE');
      assert.deepEqual(
        { start: t.cpuSegments[0].start, end: t.cpuSegments[0].end },
        { start: 0, end: 5 },
        `${algorithm} leading idle span`,
      );
    }
  });

  it('charges the pre-arrival idle span to neither job nor ready waiting', () => {
    // A process that has not arrived is in no queue at all, so the five idle
    // ticks before t=5 must not appear in any waiting total.
    const t = simulate(one, { algorithm: 'FCFS' });
    const m = byId(t).P1;
    assert.equal(m.jobWait, 0);
    assert.equal(m.readyWait, 0);
    assert.equal(t.summary.idleTime, 5);
  });
});
