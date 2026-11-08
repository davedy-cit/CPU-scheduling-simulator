/**
 * Keep a newly-arrived child in view.
 *
 * The queue columns overflow once a workload has more than a handful of
 * processes, and a chip that flies off the bottom of a scrolled column looks
 * like it vanished. This scrolls the container just enough to reveal a child,
 * and deliberately does nothing when the child is already visible — a column
 * that re-centres itself on every tick is unreadable.
 */

import { useEffect } from 'react';

/**
 * @param {import('react').RefObject<HTMLElement>} containerRef
 * @param {string|number|null|undefined} watch Value that changes when the content does.
 * @param {Object} [options]
 * @param {string} [options.selector] CSS selector for the child to reveal.
 */
export function useAutoScroll(containerRef, watch, { selector = '[data-autoscroll-target]' } = {}) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const target = container.querySelector(selector);
    if (!target) return;

    const containerBox = container.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();

    // Already fully visible: leave the scroll position alone.
    if (targetBox.top >= containerBox.top && targetBox.bottom <= containerBox.bottom) return;

    // Scroll the minimum amount, rather than centring, so the column stays put
    // as much as possible.
    const overflowBottom = targetBox.bottom - containerBox.bottom;
    const overflowTop = targetBox.top - containerBox.top;
    container.scrollTop += overflowBottom > 0 ? overflowBottom : overflowTop;
  }, [containerRef, watch, selector]);
}
