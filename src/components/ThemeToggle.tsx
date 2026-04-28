import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

/**
 * Header theme toggle.
 * - 44×44 hit target (mobile-friendly).
 * - Icon swaps between Moon (currently dark → tap to go light) and Sun
 *   (currently light → tap to go dark). Smooth 200ms transition handled
 *   globally via the theme transition utility.
 */
export default function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const isDark = resolved === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className="inline-flex items-center justify-center w-11 h-11 -mx-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span className="relative inline-flex items-center justify-center w-5 h-5">
        <Sun
          className={`absolute w-5 h-5 transition-all duration-300 ${
            isDark ? "opacity-0 rotate-90 scale-75" : "opacity-100 rotate-0 scale-100"
          }`}
        />
        <Moon
          className={`absolute w-5 h-5 transition-all duration-300 ${
            isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-75"
          }`}
        />
      </span>
    </button>
  );
}