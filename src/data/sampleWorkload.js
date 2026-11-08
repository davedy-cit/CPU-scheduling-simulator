/**
 * The assignment's built-in sample workload (spec §4).
 *
 * Transcribed from Instructions.pdf §4. The burst column of that table wraps
 * across a page break and the two text-extraction modes disagree about it; the
 * reading below is the only one that satisfies the spec's own rules:
 *
 *   - a process has 1, 3 or 5 alternating bursts
 *   - it MUST begin AND end with CPU
 *   - every burst is 50–200 simulated time units
 *
 * (The competing extraction gave P1 four bursts ending in I/O, which the spec
 * forbids.) `sampleWorkload.test.js` asserts every one of those constraints, so
 * a transcription error fails loudly instead of silently skewing every demo.
 *
 * @type {import('../engine/types.js').ProcessSpec[]}
 */
export const SAMPLE_WORKLOAD = [
  {
    id: 'P1',
    arrival: 0,
    priority: 3,
    colorIndex: 1,
    bursts: [
      { kind: 'CPU', duration: 180 },
      { kind: 'A', duration: 100 },
      { kind: 'CPU', duration: 120 },
      { kind: 'B', duration: 80 },
      { kind: 'CPU', duration: 70 },
    ],
  },
  {
    id: 'P2',
    arrival: 30,
    priority: 1,
    colorIndex: 2,
    bursts: [
      { kind: 'CPU', duration: 70 },
      { kind: 'B', duration: 150 },
      { kind: 'CPU', duration: 90 },
    ],
  },
  {
    id: 'P3',
    arrival: 50,
    priority: 4,
    colorIndex: 3,
    bursts: [
      { kind: 'CPU', duration: 120 },
      { kind: 'A', duration: 70 },
      { kind: 'CPU', duration: 160 },
    ],
  },
  {
    id: 'P4',
    arrival: 80,
    priority: 2,
    colorIndex: 4,
    bursts: [
      { kind: 'CPU', duration: 60 },
      { kind: 'B', duration: 100 },
      { kind: 'CPU', duration: 80 },
      { kind: 'A', duration: 60 },
      { kind: 'CPU', duration: 100 },
    ],
  },
  {
    id: 'P5',
    arrival: 110,
    priority: 5,
    colorIndex: 5,
    bursts: [{ kind: 'CPU', duration: 150 }],
  },
];

/** Total CPU demand of the sample workload, in simulated time units. */
export const SAMPLE_TOTAL_CPU = SAMPLE_WORKLOAD.reduce(
  (sum, p) => sum + p.bursts.filter((b) => b.kind === 'CPU').reduce((s, b) => s + b.duration, 0),
  0,
);
