import { useEffect } from "react";
import { AlertTriangle, Stethoscope, User } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";

export type PaletteScreen = "diagnosis" | "body" | "doctor";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (screen: PaletteScreen) => void;
  currentScreen: PaletteScreen;
}

const items: { id: PaletteScreen; label: string; hint: string; icon: React.ElementType }[] = [
  { id: "diagnosis", label: "Diagnosis", hint: "Primary health problem", icon: AlertTriangle },
  { id: "body", label: "Body", hint: "Biomarkers & inputs", icon: User },
  { id: "doctor", label: "AI Doctor", hint: "Chat & document upload", icon: Stethoscope },
];

export default function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  currentScreen,
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

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to a screen…" />
      <CommandList>
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
              >
                <Icon className={isActive ? "text-primary" : "text-muted-foreground"} />
                <span className="flex-1">{item.label}</span>
                <span className="text-xs text-muted-foreground mr-2">{item.hint}</span>
                <CommandShortcut>⌘{idx + 1}</CommandShortcut>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}