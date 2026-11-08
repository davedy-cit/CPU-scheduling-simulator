/**
 * SRTF — spec §3: "smallest remaining current CPU burst", preempting only on a
 * *strictly* shorter contender.
 *
 * The strictness is the subtle half. A contender of equal remaining time must
 * NOT preempt, so a process that reaches a tie keeps the CPU until it finishes
 * or is beaten outright. Both halves are pinned below.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { simulate } from '../simulate.js';
import { SRTF_SET, SRTF_EXPECTED } from '../../data/presets.js';
import { byId, close, completions, cpuTrace, traceIs } from './helpers.js';

describe('SRTF', () => {
  const timeline = simulate(SRTF_SET, { algorithm: 'SRTF' });
  const expected = SRTF_EXPECTED;

  it('preempts the running process when a shorter one arrives', () => {
    // P1 starts at t=0 with 8 units. P2 arrives at t=1 with 4, which is
    // strictly shorter than P1's remaining 7, so P1 is evicted after one tick.
    traceIs(
      cpuTrace(timeline),
      'P1[0,1) P2[1,5) P4[5,10) P1[10,17) P3[17,26)',
      'SRTF trace',
    );
  });

  it('produces the hand-computed completion times', () => {
    assert.deepEqual(completions(timeline), expected.completion);
  });

  it('produces the hand-computed averages', () => {
    close(timeline.summary.avgTurnaround, expected.avgTurnaround, 'SRTF avg turnaround');
    close(timeline.summary.avgReadyWait, expected.avgWaiting, 'SRTF avg ready waiting');
    close(timeline.summary.avgResponse, expected.avgResponse, 'SRTF avg response');
  });

  it('counts exactly one preemption', () => {
    // P1 is evicted once, at t=1. Its re-dispatch at t=10 is a fresh dispatch,
    // not a second preemption.
    assert.equal(timeline.summary.preemptions, 1);
    assert.equal(byId(timeline).P1.preemptions, 1);
    for (const id of ['P2', 'P3', 'P4']) {
      assert.equal(byId(timeline)[id].preemptions, 0, `${id} should never be preempted`);
    }
  });

  it('records a response time only for the first dispatch', () => {
    // P1 is dispatched at t=0 and again at t=10; its response time is 0, not 10.
    const p1 = byId(timeline).P1;
    assert.equal(p1.response, 0);
    assert.equal(p1.arrival, 0);
    // P3 waits the longest and pays for it in both response and waiting.
    assert.equal(byId(timeline).P3.response, 15);
  });

  it('resumes a preempted process with the time it had left', () => {
    // P1 served 1 of its 8 units before eviction, so it needs 7 more at t=10.
    const p1 = byId(timeline).P1;
    assert.equal(p1.cpuTime, 8);
    assert.equal(p1.completion - 10, 7);
  });
});

describe('SRTF preemption strictness', () => {
  /** A long-running process and a later arrival of exactly equal length. */
  const tieSet = [
    { id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 10 }] },
    { id: 'P2', arrival: 3, priority: 1, bursts: [{ kind: 'CPU', duration: 7 }] },
  ];

  it('does not preempt on an exact tie', () => {
    // At t=3 P1 has 7 left and P2 arrives needing 7. Equal is not strictly
    // shorter, so P1 must keep the CPU and run to completion at t=10.
    const t = simulate(tieSet, { algorithm: 'SRTF' });
    assert.equal(t.summary.preemptions, 0);
    assert.deepEqual(completions(t), { P1: 10, P2: 17 });
  });

  it('preempts when the contender is one unit shorter', () => {
    // Same shape, but P2 now needs 6 — strictly fewer than P1's 7 remaining.
    const justShorter = [
      { id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 10 }] },
      { id: 'P2', arrival: 3, priority: 1, bursts: [{ kind: 'CPU', duration: 6 }] },
    ];
    const t = simulate(justShorter, { algorithm: 'SRTF' });
    assert.equal(t.summary.preemptions, 1);
    assert.deepEqual(completions(t), { P1: 16, P2: 9 });
  });
});

describe('SRTF tie-breaking', () => {
  it('prefers the earlier Ready Queue entry, then the lexical ID', () => {
    // Both arrive at t=0 with identical bursts, so the tie-break decides the
    // order: P1 and P2 are admitted together and P1 has the earlier entry.
    const twins = [
      { id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 4 }] },
      { id: 'P2', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 4 }] },
    ];
    const t = simulate(twins, { algorithm: 'SRTF' });
    assert.equal(t.snapshots[0].cpu.pid, 'P1', 'lexically earlier ID wins the tie');
    // And critically: an exact tie must not cause the second to preempt the
    // first, which would thrash the CPU between two equal processes.
    assert.equal(t.summary.preemptions, 0);
    assert.deepEqual(completions(t), { P1: 4, P2: 8 });
  });
});
