/**
 * Timeline scrubber.
 *
 * Dragging is just `seek`, which is the same cursor arithmetic as every other
 * control — there is no separate fast-forward path, which is why scrubbing a
 * precomputed run cannot desynchronise the view.
 *
 * The filled portion is coloured with `accent-color` rather than by stacking a
 * second element over the track. Splitting a native range input's track means
 * fighting two different sets of vendor pseudo-elements, and the result is
 * fragile in exactly the way a slider should not be.
 *
 * Event ticks are drawn as marks beneath the track. They are deduplicated
 * because several events share a boundary, and the strip is capped: a thousand
 * absolutely-positioned marks costs more than it communicates, and past a few
 * hundred the marks read as a solid band anyway.
 */

import { useMemo } from 'react';

import { eventCutoff } from '../../engine/selectors.js';
import { fmtTick } from '../../lib/format.js';
import { useSim } from '../../state/SimulationContext.jsx';

const MAX_MARKERS = 400;

export function Scrubber() {
  const { cursor, maxCursor, actions, timeline } = useSim();

  const { markers, thinned } = useMemo(() => {
    const ticks = timeline.eventTicks;
    const unique = [];
    for (let i = 0; i < ticks.length; i++) {
      if (i === 0 || ticks[i] !== ticks[i - 1]) unique.push(ticks[i]);
    }
    if (unique.length <= MAX_MARKERS) return { markers: unique, thinned: false };
    // Thin evenly rather than truncating, so the strip still shows the whole run.
    const step = unique.length / MAX_MARKERS;
    return {
      markers: Array.from({ length: MAX_MARKERS }, (_, i) => unique[Math.floor(i * step)]),
      thinned: true,
    };
  }, [timeline.eventTicks]);

  const elapsedEvents = eventCutoff(timeline, cursor);
  const unit = timeline.config.unitLabel;
  const pctOf = (tick) => (maxCursor > 0 ? (tick / maxCursor) * 100 : 0);

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
          Timeline
        </span>
        <span className="tnum text-xs text-ink-muted">
          t = <span className="font-semibold text-ink">{fmtTick(cursor)}</span> /{' '}
          {fmtTick(maxCursor)} {unit} · {elapsedEvents} of {timeline.events.length} events
          {thinned ? ' · marks thinned' : ''}
        </span>
      </div>

      <div className="relative mt-2">
        {/* Marks sit behind the input so they can never intercept the drag. */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2">
          {markers.map((tick) => (
            <span
              key={tick}
              className={`absolute top-0 h-2.5 w-px ${
                tick <= cursor ? 'bg-accent/50' : 'bg-line-strong'
              }`}
              style={{ left: `${pctOf(tick)}%` }}
            />
          ))}
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(0, maxCursor)}
          step={1}
          value={cursor}
          aria-label="Simulated time cursor"
          aria-valuetext={`t = ${cursor} ${unit}`}
          onChange={(event) => actions.seek(Number(event.target.value))}
          className="relative block h-4 w-full cursor-pointer accent-accent"
        />
      </div>

      <div className="tnum mt-1 flex justify-between text-[10px] text-ink-subtle">
        <span>0</span>
        <span>{fmtTick(Math.round(maxCursor / 2))}</span>
        <span>{fmtTick(maxCursor)}</span>
      </div>
    </div>
  );
}
