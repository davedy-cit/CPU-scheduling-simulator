/**
 * Simulation context.
 *
 * One `useSimulation()` call at the top of the tree, handed down by context.
 * Components read `useSim()` instead of taking a dozen props each, which keeps
 * the deep panels (process table, event log, Gantt) from threading playback
 * state through intermediate components that do not care about it.
 *
 * The provider renders nothing but its children, so it costs no DOM.
 */

import { createContext, useContext } from 'react';

import { useSimulation } from './useSimulation.js';

/** @type {React.Context<ReturnType<typeof useSimulation>|null>} */
const SimulationContext = createContext(null);

/**
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {import('../engine/types.js').ProcessSpec[]} [props.initialWorkload]
 * @param {Partial<import('../engine/types.js').SimConfig>} [props.initialConfig]
 */
export function SimulationProvider({ children, initialWorkload, initialConfig }) {
  const value = useSimulation({ initialWorkload, initialConfig });
  // No memo on `value`: `useSimulation` returns a fresh object each render, and
  // the provider only renders when one of its own state slices actually
  // changed — which is precisely when consumers need to re-render anyway.
  // Wrapping it in `useMemo(..., [value])` would look like an optimisation
  // while doing nothing.
  return <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>;
}

/**
 * The context and its consumer hook are deliberately one module: the hook is
 * meaningless without the provider, and splitting them would put the context
 * object in a third file or force every consumer to import from two paths. The
 * only cost is that Fast Refresh reloads the whole subtree instead of the
 * provider alone, which is why the rule is silenced here rather than obeyed.
 *
 * @returns {ReturnType<typeof useSimulation>}
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useSim() {
  const value = useContext(SimulationContext);
  if (!value) throw new Error('useSim() must be used inside <SimulationProvider>.');
  return value;
}
