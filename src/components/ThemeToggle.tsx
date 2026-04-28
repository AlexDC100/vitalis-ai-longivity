import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import type { KeyboardEvent } from "react";

/**
 * Header theme toggle.
 * Accessibility:
 * - 44×44 hit target (mobile-friendly).
 * - Native <button> → Enter/Space activate by default. We also bind an
 *   explicit handler so screen-reader virtual cursors that synthesize
 *   "keydown" without "click" still toggle.
 * - role="switch" with aria-checked exposes the on/off state to AT.
 * - aria-label and title describe the resulting action ("Switch to …").
 * - Visible focus ring via focus-visible:ring-2.
 * Icon swaps between Moon (dark → tap goes light) and Sun (light → tap
 * goes dark). Smooth 200ms color transition is handled globally.
 */
export default function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const isDark = resolved === "dark";
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    // role="switch" — Enter/Space must toggle. Some AT/keyboards send
    // keydown without dispatching click, so handle defensively.
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      toggle();
    }
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!isDark}
      onClick={toggle}
      onKeyDown={onKeyDown}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className="inline-flex items-center justify-center w-11 h-11 -mx-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span className="relative inline-flex items-center justify-center w-5 h-5">
        <Sun
          className={`absolute w-5 h-5 transition-all duration-300 ${
            isDark ? "opacity-0 rotate-90 scale-75" : "opacity-100 rotate-0 scale-100"
          }`}
          aria-hidden="true"
        />
        <Moon
          className={`absolute w-5 h-5 transition-all duration-300 ${
            isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-75"
          }`}
          aria-hidden="true"
        />
      </span>
    </button>
  );
}