import { useEffect, useState } from "react";
import {
  Upload,
  RefreshCw,
  LogOut,
  MessageCircle,
  Activity,
  FileSearch,
  Settings as SettingsIcon,
} from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export type PaletteScreen = "diagnosis" | "body" | "doctor";
export type PaletteAction =
  | "upload-document"
  | "start-ai-chat"
  | "refresh-diagnosis"
  | "continue-chat"
  | "extract-biomarkers"
  | "open-settings"
  | "sign-out";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (screen: PaletteScreen) => void;
  currentScreen: PaletteScreen;
  onAction: (action: PaletteAction) => void;
}

type QuickAction = {
  id: PaletteAction;
  label: string;
  hint: string;
  icon: React.ElementType;
  screens: PaletteScreen[] | "all";
};

const quickActions: QuickAction[] = [
  { id: "refresh-diagnosis", label: "Run diagnosis re-check", hint: "Re-run analysis on latest data", icon: RefreshCw, screens: ["diagnosis"] },
  { id: "start-ai-chat", label: "Start AI Doctor chat", hint: "Open chat & ask a question", icon: MessageCircle, screens: ["diagnosis"] },
  { id: "extract-biomarkers", label: "Extract biomarkers", hint: "Upload a lab report to auto-fill", icon: FileSearch, screens: ["body"] },
  { id: "upload-document", label: "Upload medical document", hint: "Add a PDF to your record", icon: Upload, screens: ["body"] },
  { id: "continue-chat", label: "Continue AI Doctor chat", hint: "Jump back into the conversation", icon: Activity, screens: ["doctor"] },
  { id: "upload-document", label: "Attach document to chat", hint: "Share a PDF with the AI", icon: Upload, screens: ["doctor"] },
  { id: "open-settings", label: "Open Settings", hint: "Account, preferences, data, privacy", icon: SettingsIcon, screens: "all" },
  { id: "sign-out", label: "Sign out", hint: "End your session", icon: LogOut, screens: "all" },
];

const QUERY_STORAGE_KEY = "vitalis_palette_query";

export default function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  currentScreen,
  onAction,
}: CommandPaletteProps) {
  const [query, setQuery] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(QUERY_STORAGE_KEY) ?? "";
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(QUERY_STORAGE_KEY, query);
    } catch {
      /* ignore storage errors (private mode, quota) */
    }
  }, [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  const visibleActions = quickActions.filter(
    (a) => a.screens === "all" || a.screens.includes(currentScreen),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[10%] sm:top-[20%] translate-y-0 max-w-[640px] w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] gap-0 p-0 rounded-2xl border border-border/50 bg-popover/95 backdrop-blur-xl shadow-2xl shadow-black/40 ring-1 ring-white/5 [&>button]:hidden origin-top duration-200 ease-out data-[state=open]:animate-palette-in data-[state=closed]:animate-palette-out"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Quickly navigate between screens or trigger common actions. Use arrow keys to move, Enter to select, Escape to close.
        </DialogDescription>
        <Command
          className="bg-transparent [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground/70 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]]:border-b [&_[cmdk-input-wrapper]]:border-border/40 [&_[cmdk-input-wrapper]]:px-4 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input-wrapper]_svg]:opacity-40"
        >
          <CommandInput
            placeholder="Search or run an action…"
            aria-label="Search commands"
            value={query}
            onValueChange={setQuery}
            className="h-12 text-[15px] placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <CommandList
            aria-label="Available commands"
            className="max-h-[420px] py-1"
          >
            <CommandEmpty className="py-8 text-center text-sm text-muted-foreground">
              No results.
            </CommandEmpty>
            {visibleActions.length > 0 && (
              <CommandGroup heading="Actions">
                  {visibleActions.map((action, idx) => {
                    const Icon = action.icon;
                    return (
                      <CommandItem
                        key={`${action.id}-${idx}`}
                        value={`${action.label} ${action.hint}`}
                        onSelect={() => {
                          onAction(action.id);
                          onOpenChange(false);
                        }}
                        aria-label={`${action.label}. ${action.hint}`}
                        className="group gap-3 px-2.5 py-2 rounded-lg aria-selected:bg-foreground/[0.06] data-[selected=true]:bg-foreground/[0.06] data-[selected=true]:text-foreground data-[selected=true]:ring-0"
                      >
                        <Icon className="h-4 w-4 text-muted-foreground/80" />
                        <div className="flex-1 min-w-0 text-left">
                          <div className="text-[13px] font-medium text-foreground leading-tight">
                            {action.label}
                          </div>
                          <div className="text-[11px] text-muted-foreground/70 leading-tight mt-0.5">
                            {action.hint}
                          </div>
                        </div>
                      </CommandItem>
                    );
                  })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}