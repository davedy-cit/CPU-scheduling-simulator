/**
 * Keyboard transport controls.
 *
 * A simulator that is driven by a play button is tedious to demonstrate; these
 * bindings make it possible to step through a schedule while talking over it.
 *
 * Two rules keep the shortcuts from becoming a nuisance:
 *
 *   - keystrokes inside a form control are ignored, so typing a process ID or a
 *     seed never triggers playback; and
 *   - modified keystrokes (Ctrl/Meta/Alt) are ignored, so browser and OS
 *     shortcuts keep working.
 */

import { useEffect } from 'react';

/** Elements whose keystrokes belong to the field, not to the transport. */
const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * @param {Object} handlers
 * @param {() => void} [handlers.togglePlay]
 * @param {() => void} [handlers.stepForward]
 * @param {() => void} [handlers.stepBack]
 * @param {() => void} [handlers.nextEvent]
 * @param {() => void} [handlers.prevEvent]
 * @param {() => void} [handlers.reset]
 * @param {() => void} [handlers.runToEnd]
 * @param {boolean} [enabled]
 */
export function useKeyboardShortcuts(handlers, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    /** @param {KeyboardEvent} event */
    const onKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const target = /** @type {HTMLElement|null} */ (event.target);
      if (target && (EDITABLE.has(target.tagName) || target.isContentEditable)) return;

      const run = (fn) => {
        if (!fn) return;
        event.preventDefault();
        fn();
      };

      switch (event.key) {
        case ' ':
        case 'Spacebar':
          run(handlers.togglePlay);
          break;
        case 'ArrowRight':
          run(event.shiftKey ? handlers.nextEvent : handlers.stepForward);
          break;
        case 'ArrowLeft':
          run(event.shiftKey ? handlers.prevEvent : handlers.stepBack);
          break;
        case 'Home':
          run(handlers.reset);
          break;
        case 'End':
          run(handlers.runToEnd);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlers, enabled]);
}

/** The bindings, for the help popover. */
export const SHORTCUTS = [
  { keys: 'Space', action: 'Play / Pause' },
  { keys: '→', action: 'Step forward 1 unit' },
  { keys: '←', action: 'Step back 1 unit' },
  { keys: 'Shift + →', action: 'Next event' },
  { keys: 'Shift + ←', action: 'Previous event' },
  { keys: 'Home', action: 'Reset' },
  { keys: 'End', action: 'Run to end' },
];
