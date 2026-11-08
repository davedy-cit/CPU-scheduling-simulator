/**
 * Round Robin — spec §3 and §7.
 *
 * RR is where the boundary rules bite hardest, so this suite is the most
 * detailed in the project. Three separate spec clauses are pinned:
 *
 *   §3  "at quantum expiry if CPU burst not done" — and §7's corollary that
 *       "if a CPU burst ends at quantum expiry, completion wins";
 *   §7  a preempted process goes to the END of the Ready Queue, *after* any
 *       same-boundary arrivals and I/O completions;
 *   §9  context switches count "a change between two different running PIDs"
 *       and explicitly exclude the first dispatch.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { simulate } from '../simulate.js';
import { RR_SET, RR_EXPECTED } from '../../data/presets.js';
import { byId, close, completions, cpuTrace, traceIs } from './helpers.js';

describe('Round Robin, quantum 4', () => {
  const timeline = simulate(RR_SET, { algorithm: 'RR', quantum: RR_EXPECTED.quantum });
  const expected = RR_EXPECTED;

  it('preempts the long job so the two short ones finish first', () => {
    // P1 needs 24 units; P2 and P3 need 3 each. One quantum each, then P1
    // resumes and runs out the remaining 20.
    traceIs(cpuTrace(timeline), 'P1[0,4) P2[4,7) P3[7,10) P1[10,30)', 'RR trace');
  });

  it('produces the hand-computed completion times', () => {
    assert.deepEqual(completions(timeline), expected.completion);
  });

  it('produces the hand-computed averages', () => {
    close(timeline.summary.avgReadyWait, expected.avgWaiting, 'RR avg ready waiting');
    close(timeline.summary.avgTurnaround, expected.avgTurnaround, 'RR avg turnaround');
  });

  it('counts three context switches, not seven', () => {
    // P1→P2, P2→P3, P3→P1 are switches. The quantum expiries at t=14, 18, 22
    // and 26 find an empty Ready Queue, so P1 keeps the CPU and no switch
    // occurs — and the very first dispatch is never a switch either.
    assert.equal(timeline.summary.contextSwitches, expected.contextSwitches);
    assert.equal(timeline.summary.dispatches, 4, 'four dispatches, three of them switches');
  });

  it('counts one preemption, at the single quantum expiry that had a waiter', () => {
    assert.equal(timeline.summary.preemptions, 1);
    assert.equal(byId(timeline).P1.preemptions, 1);
    assert.equal(byId(timeline).P2.preemptions, 0);
    assert.equal(byId(timeline).P3.preemptions, 0);
  });

  it('records exactly one QUANTUM_EXPIRE event', () => {
    const expiries = timeline.events.filter((e) => e.reason === 'QUANTUM_EXPIRE');
    assert.equal(expiries.length, 1);
    assert.equal(expiries[0].tick, 4);
    assert.equal(expiries[0].pid, 'P1');
  });

  it('keeps the CPU busy for the whole run', () => {
    assert.equal(timeline.summary.idleTime, 0);
    assert.equal(timeline.summary.cpuBusyTime, 30);
    close(timeline.summary.cpuUtilization, 100, 'RR CPU utilisation');
  });
});

describe('Round Robin quantum arithmetic', () => {
  const single = [{ id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 10 }] }];

  it('does not evict a process that is alone in the system', () => {
    // The quantum expires at t=4 with nobody waiting. Evicting P1 only to
    // re-dispatch it would log a phantom preemption and a phantom switch.
    const t = simulate(single, { algorithm: 'RR', quantum: 4 });
    assert.equal(t.summary.preemptions, 0);
    assert.equal(t.summary.contextSwitches, 0);
    assert.equal(t.summary.dispatches, 1);
    // And the Gantt must show one unbroken run, not two abutting segments.
    assert.equal(t.cpuSegments.length, 1);
    assert.deepEqual(t.cpuSegments[0], { start: 0, end: 10, pid: 'P1', kind: 'RUN' });
  });

  it('lets completion win when the burst ends exactly at quantum expiry', () => {
    // Burst 8, quantum 8: the process finishes on the same tick the quantum
    // runs out. Spec §7 says completion wins, so there is no preemption.
    const exact = [{ id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 8 }] }];
    const t = simulate(exact, { algorithm: 'RR', quantum: 8 });
    assert.equal(t.summary.preemptions, 0);
    assert.deepEqual(completions(t), { P1: 8 });
  });

  it('preempts when the burst outlives the quantum by one unit', () => {
    const over = [
      { id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 9 }] },
      { id: 'P2', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 1 }] },
    ];
    const t = simulate(over, { algorithm: 'RR', quantum: 8 });
    traceIs(cpuTrace(t), 'P1[0,8) P2[8,9) P1[9,10)', 'burst one unit over the quantum');
    assert.equal(t.summary.preemptions, 1);
  });

  it('honours a quantum of 1, degenerating to processor sharing', () => {
    const three = [
      { id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 3 }] },
      { id: 'P2', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 2 }] },
      { id: 'P3', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 1 }] },
    ];
    const t = simulate(three, { algorithm: 'RR', quantum: 1 });
    traceIs(cpuTrace(t), 'P1[0,1) P2[1,2) P3[2,3) P1[3,4) P2[4,5) P1[5,6)', 'quantum 1');
    assert.deepEqual(completions(t), { P1: 6, P2: 5, P3: 3 });
  });

  it('honours a quantum larger than every burst, degenerating to FCFS', () => {
    const t = simulate(RR_SET, { algorithm: 'RR', quantum: 1000 });
    // Nobody is ever preempted, so RR on a huge quantum must equal FCFS.
    const fcfs = simulate(RR_SET, { algorithm: 'FCFS' });
    assert.equal(cpuTrace(t), cpuTrace(fcfs));
    assert.equal(t.summary.preemptions, 0);
  });
});

describe('Round Robin queue rotation', () => {
  it('sends a preempted process to the tail, behind a same-tick arrival', () => {
    // The graded boundary rule (spec §7). At t=4 P1's quantum expires *and* P3
    // arrives. P3 is admitted first (phase 2), then P1 is appended (phase 3),
    // so the order is P2, P3, P1 — not P2, P1, P3.
    const set = [
      { id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 12 }] },
      { id: 'P2', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 4 }] },
      { id: 'P3', arrival: 4, priority: 1, bursts: [{ kind: 'CPU', duration: 4 }] },
    ];
    const t = simulate(set, { algorithm: 'RR', quantum: 4 });

    // P2 is dispatched at the t=4 boundary, so what remains queued is P3 ahead
    // of the preempted P1 — the arrival was admitted before P1 was appended.
    assert.deepEqual(t.snapshots[4].readyQueue, ['P3', 'P1']);

    // P2 finishes at t=8, then P3 runs, and only then does P1 return.
    traceIs(cpuTrace(t), 'P1[0,4) P2[4,8) P3[8,12) P1[12,20)', 'rotation behind an arrival');
  });

  it('sends a preempted process to the tail, behind a same-tick I/O completion', () => {
    // The same rule with an I/O completion as the competitor instead of an
    // arrival. This set is built so the two events genuinely collide: P2's
    // device-A burst runs [8,12), which is exactly when P1's second quantum
    // expires.
    const set = [
      { id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 12 }] },
      {
        id: 'P2',
        arrival: 0,
        priority: 1,
        bursts: [
          { kind: 'CPU', duration: 4 },
          { kind: 'A', duration: 4 },
          { kind: 'CPU', duration: 2 },
        ],
      },
    ];
    const t = simulate(set, { algorithm: 'RR', quantum: 4 });

    // At t=12 the I/O completion (phase 1) puts P2 in the Ready Queue before
    // the quantum expiry (phase 3) appends P1 — so P2 is dispatched first and
    // P1, not P2, is left waiting.
    traceIs(
      cpuTrace(t),
      'P1[0,4) P2[4,8) P1[8,12) P2[12,14) P1[14,18)',
      'rotation behind an I/O completion',
    );
    assert.deepEqual(t.snapshots[12].readyQueue, ['P1'], 'P2 was dispatched, P1 waits');

    assert.deepEqual(completions(t), { P1: 18, P2: 14 });
    assert.equal(byId(t).P2.deviceWait, 0, 'P2 found device A free, so it never queued');
    assert.equal(byId(t).P2.readyWait, 4, 'P2 waited one quantum before its first dispatch');
  });
});
