/**
 * One lane of the Gantt chart.
 *
 * Segments are positioned as percentages of the run, so the chart needs no
 * measurement pass and stays correct through a resize. The trade-off is that
 * the component cannot know a segment's pixel width — so whether a label fits
 * is decided from the segment's *share* of the run, which holds well because
 * every lane is the same width.
 *
 * These are deliberately plain elements. The flow board owns every `layoutId`
 * on the page, and a process token here sharing one would be dragged into the
 * board's animation.
 */

import { procClasses } from '../../data/palette.js';
import { cx } from '../../lib/cn.js';

/** A segment narrower than this share of the run gets no inline label. */
const LABEL_SHARE = 0.035;

/**
 * @param {Object} props
 * @param {import('../../engine/types.js').GanttSegment[]} props.segments
 * @param {number} props.totalTicks
 * @param {number} props.cursor
 * @param {(pid: string) => number} props.colorOf Maps a PID to its palette index.
 * @param {number} [props.gutter] Left gutter in rem, matching the ruler.
 * @param {Array<{tick: number}>} [props.markers] Zero-width markers, e.g. context switches.
 * @param {string} [props.className]
 */
export function GanttRow({
  segments,
  totalTicks,
  cursor,
  colorOf,
  gutter = 0,
  markers = [],
  className,
}) {
  const total = Math.max(1, totalTicks);

  return (
    <div className={cx('flex items-stretch', className)}>
      <div className="shrink-0" style={{ width: `${gutter}rem` }} />

      <div className="relative h-7 min-w-0 flex-1 overflow-hidden rounded bg-surface-sunken">
        {segments.map((segment, index) => {
          const share = (segment.end - segment.start) / total;
          const current = segment.start <= cursor && cursor < segment.end;
          const palette = segment.pid ? procClasses(colorOf(segment.pid)) : null;

          return (
            <div
              key={`${segment.start}-${segment.kind}-${segment.pid ?? 'x'}-${index}`}
              title={`${describe(segment)} — t = ${segment.start} → ${segment.end} (${segment.end - segment.start})`}
              className={cx(
                'absolute top-0 flex h-full items-center justify-center overflow-hidden',
                'border-r border-surface text-[10px] font-semibold whitespace-nowrap',
                segment.kind === 'RUN' && cx(palette?.bg ?? 'bg-state-running', 'text-white'),
                segment.kind === 'BUSY' && 'bg-state-io text-white',
                segment.kind === 'IDLE' && 'bg-state-idle/30 text-ink-muted',
                // A hatched fill reads as "no process work is happening" even in
                // greyscale, which a flat grey block does not.
                segment.kind === 'SWITCH' && 'text-ink-muted',
                current && 'ring-2 ring-ink/40 ring-inset',
              )}
              style={{
                left: `${(segment.start / total) * 100}%`,
                width: `${share * 100}%`,
                backgroundImage:
                  segment.kind === 'SWITCH'
                    ? 'repeating-linear-gradient(45deg, var(--color-ink-subtle) 0 3px, transparent 3px 6px)'
                    : undefined,
              }}
            >
              {share >= LABEL_SHARE ? (
                <span className="truncate px-1">
                  {segment.kind === 'IDLE'
                    ? 'Idle'
                    : segment.kind === 'SWITCH'
                      ? 'Switch'
                      : (segment.pid ?? '')}
                </span>
              ) : null}
            </div>
          );
        })}

        {markers.map((marker) => (
          <span
            key={`m-${marker.tick}`}
            title={`Context switch at t = ${marker.tick}`}
            className="absolute top-0 h-full w-0.5 bg-ink/60"
            style={{ left: `${(marker.tick / total) * 100}%` }}
          />
        ))}

        {/* The playhead, drawn last so it sits above every segment. */}
        <span
          className="pointer-events-none absolute top-0 z-10 h-full w-px bg-ink"
          style={{ left: `${(cursor / total) * 100}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

/**
 * @param {import('../../engine/types.js').GanttSegment} segment
 * @returns {string}
 */
function describe(segment) {
  if (segment.kind === 'IDLE') return 'Idle';
  if (segment.kind === 'SWITCH') return 'Context switch';
  if (segment.kind === 'BUSY') return `${segment.pid} on I/O`;
  return `${segment.pid} running`;
}
