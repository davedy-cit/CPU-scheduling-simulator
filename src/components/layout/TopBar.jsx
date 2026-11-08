/**
 * The application header.
 *
 * Carries the one number that must never be ambiguous — the logical clock — at
 * display size, together with the algorithm currently in force. Everything else
 * in the dashboard is read relative to those two values, so they get the
 * strongest visual weight on the page.
 */

import { useState } from 'react';

import { ALGORITHM_BY_ID } from '../../engine/constants.js';
import { fmtTick } from '../../lib/format.js';
import { useSim } from '../../state/SimulationContext.jsx';
import { SHORTCUTS } from '../../hooks/useKeyboardShortcuts.js';
import { Button } from '../common/Button.jsx';
import { Chip } from '../common/Badge.jsx';
import { ClockIcon } from '../common/icons.jsx';

export function TopBar() {
  const { timeline, cursor, maxCursor, config } = useSim();
  const [showKeys, setShowKeys] = useState(false);

  const unit = timeline.config.unitLabel;
  const algorithm = ALGORITHM_BY_ID[config.algorithm];
  const progress = maxCursor > 0 ? (cursor / maxCursor) * 100 : 0;

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[110rem] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-subtle uppercase">
            CCS635 · Advanced Operating Systems &amp; Networking
          </p>
          <h1 className="truncate text-lg leading-tight font-semibold text-ink">
            Interactive CPU Scheduling &amp; Process Lifecycle Simulator
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Chip tone="accent">{algorithm?.short ?? config.algorithm}</Chip>
          {algorithm?.needsQuantum ? <Chip>q = {config.quantum}</Chip> : null}
          {config.switchOverhead > 0 ? <Chip tone="warn">switch = {config.switchOverhead}</Chip> : null}
        </div>

        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-3">
            <ClockIcon className="h-5 w-5 text-ink-subtle" />
            <div className="text-right">
              <div className="tnum flex items-baseline justify-end gap-1">
                <span className="text-2xl leading-none font-semibold text-ink">
                  {fmtTick(cursor)}
                </span>
                <span className="text-xs font-medium text-ink-muted">{unit}</span>
              </div>
              <p className="tnum mt-0.5 text-[11px] text-ink-subtle">
                of {fmtTick(maxCursor)} {unit} · {progress.toFixed(0)}% elapsed
              </p>
            </div>
          </div>

          <div className="relative">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowKeys((v) => !v)}
              aria-expanded={showKeys}
            >
              Keys
            </Button>
            {showKeys ? (
              <div className="absolute right-0 z-30 mt-1 w-60 rounded-lg border border-line bg-surface p-3 shadow-raised">
                <p className="mb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                  Keyboard shortcuts
                </p>
                <dl className="space-y-1">
                  {SHORTCUTS.map((row) => (
                    <div key={row.keys} className="flex items-center justify-between gap-3 text-xs">
                      <dt className="font-mono text-[11px] text-ink">{row.keys}</dt>
                      <dd className="text-ink-muted">{row.action}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
