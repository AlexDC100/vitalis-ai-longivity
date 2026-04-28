import { MoreVertical, Sun, Moon, Settings, SlidersHorizontal, Command, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/lib/theme";

/**
 * Single overflow control for the app header.
 *
 * Replaces the previous trio of buttons (Theme · Quick actions · Settings)
 * with one ⋮ trigger that opens a clean dropdown — Apple-style "one
 * action → one control" grouping. Reduces top-bar visual noise to a
 * single 44×44 hit target on the right edge.
 */

export type HeaderMenuProps = {
  onOpenSettings: () => void;
  onOpenPreferences: () => void;
  onOpenQuickActions: () => void;
  onSignOut: () => void;
};

export default function HeaderMenu({
  onOpenSettings,
  onOpenPreferences,
  onOpenQuickActions,
  onSignOut,
}: HeaderMenuProps) {
  const { resolved, toggle } = useTheme();
  const isDark = resolved === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center justify-center w-11 h-11 -mr-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=open]:bg-muted/60 data-[state=open]:text-foreground"
        aria-label="Open menu"
        title="Menu"
      >
        <MoreVertical className="w-[18px] h-[18px]" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-56">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-medium">
          Appearance
        </DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={(e) => { e.preventDefault(); toggle(); }}
          className="cursor-pointer"
        >
          {isDark ? (
            <Sun className="w-4 h-4 mr-2.5 text-muted-foreground" aria-hidden="true" />
          ) : (
            <Moon className="w-4 h-4 mr-2.5 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="flex-1">{isDark ? "Light mode" : "Dark mode"}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
            {isDark ? "Dark" : "Light"}
          </span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-medium">
          App
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={onOpenSettings} className="cursor-pointer">
          <Settings className="w-4 h-4 mr-2.5 text-muted-foreground" aria-hidden="true" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onOpenPreferences} className="cursor-pointer">
          <SlidersHorizontal className="w-4 h-4 mr-2.5 text-muted-foreground" aria-hidden="true" />
          Preferences
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onOpenQuickActions} className="cursor-pointer">
          <Command className="w-4 h-4 mr-2.5 text-muted-foreground" aria-hidden="true" />
          <span className="flex-1">Quick actions</span>
          <span className="text-[10px] tracking-wider text-muted-foreground/70">⌘K</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onSignOut}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="w-4 h-4 mr-2.5" aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}