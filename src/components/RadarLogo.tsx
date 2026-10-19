/** RadarLogo.tsx — The AssetRadar radar logo as an inline SVG (rings, sweep line and blip). */
interface RadarLogoProps {
  size?: number;
  className?: string;
}

export function RadarLogo({ size = 32, className = '' }: RadarLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        width="64"
        height="64"
        rx="16"
        fill="var(--bg-surface-subtle)"
        stroke="var(--border-subtle)"
        strokeWidth="1.5"
      />
      {/* Radar outer & inner rings */}
      <circle
        cx="32"
        cy="32"
        r="21"
        stroke="var(--accent-radar)"
        strokeWidth="2.2"
        strokeOpacity="0.35"
      />
      <circle
        cx="32"
        cy="32"
        r="12.5"
        stroke="var(--accent-radar)"
        strokeWidth="1.8"
        strokeOpacity="0.55"
      />
      {/* Crosshairs */}
      <line
        x1="11"
        y1="32"
        x2="53"
        y2="32"
        stroke="var(--accent-radar)"
        strokeWidth="1.2"
        strokeOpacity="0.2"
      />
      <line
        x1="32"
        y1="11"
        x2="32"
        y2="53"
        stroke="var(--accent-radar)"
        strokeWidth="1.2"
        strokeOpacity="0.2"
      />
      {/* Sweep line */}
      <line
        x1="32"
        y1="32"
        x2="47"
        y2="17"
        stroke="var(--accent-radar)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Target blip dot */}
      <circle cx="43.5" cy="20.5" r="3.8" fill="var(--accent-radar)" />
      {/* Center origin */}
      <circle cx="32" cy="32" r="2.8" fill="var(--accent-radar)" />
    </svg>
  );
}
