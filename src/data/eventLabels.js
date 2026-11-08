/**
 * Presentation for trace event reasons.
 *
 * Kept beside the palette rather than inside a component because three panels
 * render the same reasons — the trace, the per-process history and the exported
 * CSV — and they must agree on what each one is called.
 *
 * The reasons themselves are fixed by the engine; see `EventReason` in
 * `engine/types.js` for what each one means. Two are worth stating here:
 *
 *   - a CPU burst never "completes" as its own event — it always leads either to
 *     an I/O request or to termination, so those are the recorded reasons; and
 *   - `QUANTUM_EXPIRE` and `PREEMPT` are separate reasons because the spec
 *     counts preemptions, and a Round Robin eviction at quantum expiry is the
 *     same kind of event as an SRTF interruption for metric purposes.
 */

/** @type {Record<import('../engine/types.js').EventReason, string>} */
export const REASON_LABEL = {
  ARRIVE: 'Arrive',
  ADMIT: 'Admit',
  DISPATCH: 'Dispatch',
  CONTEXT_SWITCH: 'Context switch',
  PREEMPT: 'Preempt',
  QUANTUM_EXPIRE: 'Quantum expiry',
  IO_REQUEST: 'I/O request',
  IO_START: 'I/O start',
  IO_COMPLETE: 'I/O complete',
  TERMINATE: 'Terminate',
  IDLE: 'Idle',
};

/** Chip tone per reason, so preemptions stand out from routine bookkeeping. */
/** @type {Record<import('../engine/types.js').EventReason, 'neutral'|'accent'|'warn'>} */
export const REASON_TONE = {
  ARRIVE: 'neutral',
  ADMIT: 'neutral',
  DISPATCH: 'accent',
  CONTEXT_SWITCH: 'accent',
  PREEMPT: 'warn',
  QUANTUM_EXPIRE: 'warn',
  IO_REQUEST: 'neutral',
  IO_START: 'neutral',
  IO_COMPLETE: 'neutral',
  TERMINATE: 'accent',
  IDLE: 'neutral',
};

/**
 * @param {string} reason
 * @returns {string}
 */
export function reasonLabel(reason) {
  return REASON_LABEL[reason] ?? reason;
}
