import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Stethoscope,
  User,
  Upload,
  RefreshCw,
  LogOut,
  MessageCircle,
  Activity,
  FileSearch,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  CommandSeparator,
} from "@/components/ui/command";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";

export type PaletteScreen = "diagnosis" | "body" | "doctor";
export type PaletteAction =
  | "upload-document"
  | "start-ai-chat"
  | "refresh-diagnosis"
  | "continue-chat"
  | "extract-biomarkers"
  | "sign-out";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (screen: PaletteScreen) => void;
  currentScreen: PaletteScreen;
  onAction: (action: PaletteAction) => void;
}

const items: { id: PaletteScreen; label: string; hint: string; icon: React.ElementType }[] = [
  { id: "diagnosis", label: "Diagnosis", hint: "Primary health problem", icon: AlertTriangle },
  { id: "body", label: "Body", hint: "Biomarkers & inputs", icon: User },
  { id: "doctor", label: "AI Doctor", hint: "Chat & document upload", icon: Stethoscope },
];

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
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle className="sr-only">Command palette</DialogTitle>
      <DialogDescription className="sr-only">
        Quickly navigate between screens or trigger common actions. Use arrow keys to move, Enter to select, Escape to close.
      </DialogDescription>
      <CommandInput
        placeholder="Jump to a screen or run an action…"
        aria-label="Search commands"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList aria-label="Available commands">
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {items.map((item, idx) => {
            const Icon = item.icon;
            const isActive = item.id === currentScreen;
            return (
              <CommandItem
                key={item.id}
                value={`${item.label} ${item.hint}`}
                onSelect={() => {
                  onNavigate(item.id);
                  onOpenChange(false);
                }}
                aria-label={`Go to ${item.label}. ${item.hint}${isActive ? ". Current screen" : ""}`}
              >
                <Icon className={isActive ? "text-primary" : "text-muted-foreground"} />
                <span className="flex-1">{item.label}</span>
                <span className="text-xs text-muted-foreground mr-2">{item.hint}</span>
                <CommandShortcut>⌘{idx + 1}</CommandShortcut>
              </CommandItem>
            );
          })}
        </CommandGroup>
        {visibleActions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Quick actions">
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
                  >
                    <Icon className="text-muted-foreground" />
                    <span className="flex-1">{action.label}</span>
                    <span className="text-xs text-muted-foreground mr-2">{action.hint}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}