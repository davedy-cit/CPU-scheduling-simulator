/**
 * Inline SVG icons.
 *
 * Hand-rolled rather than pulled from an icon package. The build deliberately
 * holds its dependency surface at the pinned set, and the dashboard needs about
 * twenty glyphs — a package would be larger than the whole icon set.
 *
 * Every icon is drawn on a 24×24 grid with `currentColor` strokes, so it
 * inherits text colour and sizes from the surrounding utility classes.
 */

/**
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.className]
 */
function Icon({ children, className = 'h-4 w-4' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const PlayIcon = (p) => (
  <Icon {...p}>
    <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none" />
  </Icon>
);

export const PauseIcon = (p) => (
  <Icon {...p}>
    <rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none" />
    <rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none" />
  </Icon>
);

export const StepForwardIcon = (p) => (
  <Icon {...p}>
    <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" stroke="none" />
    <line x1="19" y1="4" x2="19" y2="20" />
  </Icon>
);

export const StepBackIcon = (p) => (
  <Icon {...p}>
    <polygon points="19 4 9 12 19 20 19 4" fill="currentColor" stroke="none" />
    <line x1="5" y1="4" x2="5" y2="20" />
  </Icon>
);

export const NextEventIcon = (p) => (
  <Icon {...p}>
    <polygon points="3 5 11 12 3 19 3 5" fill="currentColor" stroke="none" />
    <polygon points="11 5 19 12 11 19 11 5" fill="currentColor" stroke="none" />
    <line x1="21" y1="4" x2="21" y2="20" />
  </Icon>
);

export const PrevEventIcon = (p) => (
  <Icon {...p}>
    <polygon points="21 5 13 12 21 19 21 5" fill="currentColor" stroke="none" />
    <polygon points="13 5 5 12 13 19 13 5" fill="currentColor" stroke="none" />
    <line x1="3" y1="4" x2="3" y2="20" />
  </Icon>
);

export const ResetIcon = (p) => (
  <Icon {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <polyline points="3 4 3 10 9 10" />
  </Icon>
);

export const FastForwardIcon = (p) => (
  <Icon {...p}>
    <polygon points="3 5 12 12 3 19 3 5" fill="currentColor" stroke="none" />
    <polygon points="12 5 21 12 12 19 12 5" fill="currentColor" stroke="none" />
  </Icon>
);

export const ClockIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15 14" />
  </Icon>
);

export const CpuIcon = (p) => (
  <Icon {...p}>
    <rect x="7" y="7" width="10" height="10" rx="1.5" />
    <path d="M4 10h3M4 14h3M17 10h3M17 14h3M10 4v3M14 4v3M10 17v3M14 17v3" />
  </Icon>
);

/**
 * A process token — the rounded chip that travels the flow board. Distinct from
 * `CpuIcon`: one is the processor, the other is a unit of work.
 */
export const ChipIcon = (p) => (
  <Icon {...p}>
    <rect x="3.5" y="7" width="13" height="10" rx="2.5" />
    <path d="M17 10h2.5a1.5 1.5 0 0 1 0 4H17" />
    <path d="M7 10.5v3M10.5 10.5v3" />
  </Icon>
);

export const DeviceIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="7" rx="1.5" />
    <rect x="3" y="14" width="18" height="5" rx="1.5" />
    <circle cx="7" cy="8.5" r="0.6" fill="currentColor" />
    <circle cx="7" cy="16.5" r="0.6" fill="currentColor" />
  </Icon>
);

export const QueueIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="6" width="5" height="12" rx="1" />
    <rect x="10" y="6" width="5" height="12" rx="1" />
    <rect x="17" y="6" width="4" height="12" rx="1" />
  </Icon>
);

export const CheckIcon = (p) => (
  <Icon {...p}>
    <polyline points="4 12.5 9.5 18 20 6.5" />
  </Icon>
);

export const WarningIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3.5 22 20H2L12 3.5Z" />
    <line x1="12" y1="10" x2="12" y2="14.5" />
    <circle cx="12" cy="17.4" r="0.7" fill="currentColor" />
  </Icon>
);

export const ChevronDownIcon = (p) => (
  <Icon {...p}>
    <polyline points="6 9 12 15 18 9" />
  </Icon>
);

export const ChevronRightIcon = (p) => (
  <Icon {...p}>
    <polyline points="9 6 15 12 9 18" />
  </Icon>
);

export const SettingsIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2.2M12 19.3v2.2M4.2 7l1.9 1.1M17.9 15.9l1.9 1.1M4.2 17l1.9-1.1M17.9 8.1l1.9-1.1" />
  </Icon>
);

export const DownloadIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3v12" />
    <polyline points="7 10 12 15 17 10" />
    <path d="M4 19h16" />
  </Icon>
);

export const UploadIcon = (p) => (
  <Icon {...p}>
    <path d="M12 16V4" />
    <polyline points="7 9 12 4 17 9" />
    <path d="M4 19h16" />
  </Icon>
);

export const DiceIcon = (p) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" />
    <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" />
  </Icon>
);

export const TrashIcon = (p) => (
  <Icon {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V4.5h6V7" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M10 11v6M14 11v6" />
  </Icon>
);

export const PlusIcon = (p) => (
  <Icon {...p}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </Icon>
);

export const CompareIcon = (p) => (
  <Icon {...p}>
    <path d="M4 6h6M4 12h10M4 18h6" />
    <path d="M17 4v16" />
    <path d="M14 7l3-3 3 3M20 17l-3 3-3-3" />
  </Icon>
);

export const TableIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9.5h18M9 9.5V20" />
  </Icon>
);

export const ListIcon = (p) => (
  <Icon {...p}>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <circle cx="4" cy="6" r="1.2" fill="currentColor" />
    <circle cx="4" cy="12" r="1.2" fill="currentColor" />
    <circle cx="4" cy="18" r="1.2" fill="currentColor" />
  </Icon>
);

export const ChartIcon = (p) => (
  <Icon {...p}>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <rect x="7" y="12" width="3.5" height="5" rx="0.8" />
    <rect x="13" y="7.5" width="3.5" height="9.5" rx="0.8" />
  </Icon>
);

export const SparkIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    <path d="M6.4 6.4l2.8 2.8M14.8 14.8l2.8 2.8M17.6 6.4l-2.8 2.8M9.2 14.8l-2.8 2.8" />
  </Icon>
);
