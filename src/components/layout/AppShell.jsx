/**
 * Page shell.
 *
 * Owns the page-level grid and the keyboard bindings. The bindings live here
 * rather than in `PlaybackControls` because they belong to the page, not to the
 * button group: pressing Space should work whether or not the transport has
 * focus.
 */

import { useMemo } from 'react';

import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { useSim } from '../../state/SimulationContext.jsx';
import { TopBar } from './TopBar.jsx';

/**
 * @param {Object} props
 * @param {React.ReactNode} props.children
 */
export function AppShell({ children }) {
  const { actions } = useSim();

  const handlers = useMemo(
    () => ({
      togglePlay: actions.toggle,
      stepForward: actions.stepForward,
      stepBack: actions.stepBack,
      nextEvent: actions.nextEvent,
      prevEvent: actions.prevEvent,
      reset: actions.reset,
      runToEnd: actions.runToEnd,
    }),
    [actions],
  );

  useKeyboardShortcuts(handlers);

  return (
    <div className="min-h-screen bg-surface-muted">
      <TopBar />
      <main className="mx-auto max-w-[110rem] space-y-4 px-4 py-4 sm:px-6">{children}</main>
      <footer className="mx-auto max-w-[110rem] px-4 pt-2 pb-8 sm:px-6">
        <p className="text-[11px] leading-relaxed text-ink-subtle">
          Deterministic discrete-time simulation. The whole schedule is computed once from
          <span className="font-mono"> (workload, config)</span>; every control — play, pause, step,
          next event, reset, scrub — is cursor arithmetic over that frozen run, so a reset reproduces
          the trace exactly. Context-switch counting, the makespan origin and the Ready-Queue
          ordering convention are documented in the README.
        </p>
      </footer>
    </div>
  );
}
