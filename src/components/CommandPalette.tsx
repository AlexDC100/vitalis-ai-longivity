import { useEffect } from "react";
import {
  AlertTriangle,
  Stethoscope,
  User,
  Upload,
  RefreshCw,
  LogOut,
  MessageCircle,
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
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

export type PaletteScreen = "diagnosis" | "body" | "doctor";
export type PaletteAction =
  | "upload-document"
  | "start-ai-chat"
  | "refresh-diagnosis"
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
  { id: "start-ai-chat", label: "Start AI Doctor chat", hint: "Open chat & ask a question", icon: MessageCircle, screens: ["diagnosis", "body"] },
  { id: "upload-document", label: "Upload medical document", hint: "Extract biomarkers from PDF", icon: Upload, screens: "all" },
  { id: "refresh-diagnosis", label: "Refresh diagnosis", hint: "Re-run analysis", icon: RefreshCw, screens: ["diagnosis"] },
  { id: "sign-out", label: "Sign out", hint: "End your session", icon: LogOut, screens: "all" },
];

export default function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  currentScreen,
  onAction,
}: CommandPaletteProps) {
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
      <VisuallyHidden>
        <DialogTitle>Command palette</DialogTitle>
        <DialogDescription>
          Quickly navigate between screens or trigger common actions. Press Escape to close.
        </DialogDescription>
      </VisuallyHidden>
      <CommandInput
        placeholder="Jump to a screen or run an action…"
        aria-label="Search commands"
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
              {visibleActions.map((action) => {
                const Icon = action.icon;
                return (
                  <CommandItem
                    key={action.id}
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