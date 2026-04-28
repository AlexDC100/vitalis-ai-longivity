import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Vitalis brand mark.
 *
 * One canonical, code-defined SVG — NOT a raster import. The same
 * source renders across header, sidebar, favicon, splash, and OG
 * exports so proportions, stroke weight, and color story stay
 * pixel-perfect across surfaces.
 *
 * The icon uses the design-system primary token for its gradient so
 * it rebrands automatically if `--primary` changes. Wordmark color
 * follows `currentColor`, which inherits the active theme's text
 * color (white in dark mode, dark-grey in light mode) — no manual
 * "light" vs "dark" switch required at the call site.
 *
 * Variants:
 *   - "full"  → icon + "Vitalis" wordmark.
 *   - "icon"  → icon only (sidebar, favicon, compact UI).
 *   - "wordmark" → text only (rare, e.g. settings footer).
 *
 * Tone:
 *   - "auto"  → follows currentColor (default — preferred).
 *   - "light" → forces white wordmark (use on photos / colored hero).
 *   - "dark"  → forces dark-grey wordmark (#111827, use on white hero).
 */

export type VitalisLogoVariant = "full" | "icon" | "wordmark";
export type VitalisLogoTone = "auto" | "light" | "dark";

export interface VitalisLogoProps extends Omit<React.SVGProps<SVGSVGElement>, "ref"> {
  variant?: VitalisLogoVariant;
  tone?: VitalisLogoTone;
  /** Pixel height of the mark. Width is derived to preserve aspect ratio. */
  size?: number;
  /** Subtle teal glow behind the icon (dark mode only). Default: true. */
  glow?: boolean;
  /** Optional accessible label. When omitted, the SVG is decorative. */
  title?: string;
}

const ICON_VB = 64;            // icon viewBox is 64×64
const FULL_VB_W = 220;         // full mark viewBox width  (icon + gap + word)
const FULL_VB_H = 64;

/* ------------------------------------------------------------------ */
/*  Icon path: hexagonal capsule + heartbeat pulse + runner head.     */
/*  Drawn in a 64×64 grid so it lines up with our 4px spacing scale.  */
/* ------------------------------------------------------------------ */
function IconPaths({ gradientId, glowId, glow }: { gradientId: string; glowId: string; glow: boolean }) {
  return (
    <g filter={glow ? `url(#${glowId})` : undefined}>
      {/* Hex capsule */}
      <path
        d="M20 8 L44 8 L56 24 L56 40 L44 56 L20 56 L8 40 L8 24 Z"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={3.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Heartbeat pulse */}
      <path
        d="M10 34 H22 L26 24 L32 44 L38 28 L42 34 H54"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={3.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Runner head dot */}
      <circle cx={42} cy={18} r={3.25} fill={`url(#${gradientId})`} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/*  Wordmark: drawn as <text> using Inter so it inherits the system   */
/*  font and currentColor. Letter-spacing matches the bitmap source.  */
/* ------------------------------------------------------------------ */
function Wordmark({ x, tone }: { x: number; tone: VitalisLogoTone }) {
  const fill =
    tone === "light" ? "#FFFFFF" :
    tone === "dark"  ? "#111827" :
    "currentColor";
  return (
    <text
      x={x}
      y={44}
      fontFamily="Inter, system-ui, sans-serif"
      fontWeight={700}
      fontSize={40}
      letterSpacing="-0.02em"
      fill={fill}
    >
      Vitalis
    </text>
  );
}

const VitalisLogo = forwardRef<SVGSVGElement, VitalisLogoProps>(function VitalisLogo(
  {
    variant = "full",
    tone = "auto",
    size = 24,
    glow = true,
    title,
    className,
    ...rest
  },
  ref,
) {
  // Stable, unique IDs per instance so multiple logos can coexist
  // without their <defs> colliding.
  const uid = useId().replace(/[:]/g, "");
  const gradientId = `vitalis-grad-${uid}`;
  const glowId = `vitalis-glow-${uid}`;

  const isIconOnly = variant === "icon";
  const isWordOnly = variant === "wordmark";

  const vbW = isIconOnly ? ICON_VB : isWordOnly ? 160 : FULL_VB_W;
  const vbH = isIconOnly ? ICON_VB : FULL_VB_H;

  // Width derived from aspect ratio so callers only specify height.
  const width = (vbW / vbH) * size;

  return (
    <svg
      ref={ref}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      viewBox={`0 0 ${vbW} ${vbH}`}
      width={width}
      height={size}
      className={cn("inline-block align-middle select-none", className)}
      {...rest}
    >
      <defs>
        {/* Brand gradient — anchored to design-system primary token so
            light/dark + future re-skins automatically propagate. */}
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="hsl(var(--brand-grad-start))" />
          <stop offset="55%"  stopColor="hsl(var(--brand-grad-mid))" />
          <stop offset="100%" stopColor="hsl(var(--brand-grad-end))" />
        </linearGradient>
        {/* Subtle glow — only used on dark surfaces. */}
        <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {!isWordOnly && <IconPaths gradientId={gradientId} glowId={glowId} glow={glow} />}
      {!isIconOnly && <Wordmark x={isWordOnly ? 0 : 72} tone={tone} />}
    </svg>
  );
});

export default VitalisLogo;