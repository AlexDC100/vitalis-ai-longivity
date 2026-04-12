import { useHealth } from "@/lib/health-context";
import { NavSection } from "@/lib/types";
import {
  LayoutDashboard, Bot, Users, FileHeart, Shield, TrendingUp,
  Layers, Archive, LogOut, ChevronLeft, Menu
} from "lucide-react";
import { useState } from "react";

const navItems: { id: NavSection; label: string; sub: string; icon: React.ElementType; badge?: string }[] = [
  { id: "command-center", label: "Command Center", sub: "Health overview", icon: LayoutDashboard },
  { id: "ai-advisor", label: "AI Advisor", sub: "Chat + photo analysis", icon: Bot },
  { id: "medical-team", label: "Medical Team", sub: "Book a doctor", icon: Users, badge: "Live" },
  { id: "health-blueprint", label: "Health Blueprint", sub: "Your health data", icon: FileHeart },
  { id: "risk-engine", label: "Risk Engine", sub: "Disease risk map", icon: Shield },
  { id: "future-self", label: "Future Self", sub: "Trajectory simulator", icon: TrendingUp },
  { id: "action-stack", label: "Action Stack", sub: "Ranked interventions", icon: Layers },
  { id: "medical-vault", label: "Medical Vault", sub: "Labs & reports", icon: Archive },
];

interface Props {
  active: NavSection;
  onNavigate: (s: NavSection) => void;
  onSignOut: () => void;
}

export default function AppSidebar({ active, onNavigate, onSignOut }: Props) {
  const { longevityScore, dataCompleteness, isGuest } = useHealth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebar = (
    <aside className={`flex flex-col h-full bg-sidebar border-r border-sidebar-border transition-all duration-300 ${collapsed ? "w-16" : "w-64"}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
          <TrendingUp className="w-5 h-5 text-primary" />
        </div>
        {!collapsed && (
          <div>
            <h1 className="text-base font-bold text-foreground">Vitalis</h1>
            <p className="text-[10px] tracking-widest text-muted-foreground uppercase">Longevity OS</p>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="ml-auto text-muted-foreground hover:text-foreground hidden md:block">
          <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Profile card */}
      {!collapsed && (
        <div className="mx-3 mt-4 p-3 rounded-lg bg-secondary/50 border border-border">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">PROFILE</span>
            <span className="text-primary font-semibold">{dataCompleteness}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-muted mb-2">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${dataCompleteness}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Longevity Score</span>
            <span className="text-foreground font-bold">{longevityScore}<span className="text-muted-foreground font-normal">/100</span></span>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => { onNavigate(item.id); setMobileOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all group ${
                isActive
                  ? "bg-primary/10 text-primary border-l-2 border-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{item.label}</span>
                    {item.badge && (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-vitalis-success/20 text-vitalis-success">{item.badge}</span>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground truncate block">{item.sub}</span>
                </div>
              )}
              {isActive && !collapsed && <div className="w-0.5 h-6 rounded-full bg-primary" />}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
              {isGuest ? "GU" : "U"}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{isGuest ? "Guest User" : "User"}</p>
              <p className="text-[11px] text-muted-foreground">{isGuest ? "Demo Mode" : "Active"}</p>
            </div>
          </div>
        )}
        <button onClick={onSignOut} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-full px-1">
          <LogOut className="w-4 h-4" />
          {!collapsed && "Sign Out"}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 md:hidden bg-secondary p-2 rounded-lg border border-border"
      >
        <Menu className="w-5 h-5 text-foreground" />
      </button>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div className="relative h-full w-64" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </div>
        </div>
      )}
      {/* Desktop sidebar */}
      <div className="hidden md:block h-screen sticky top-0">
        {sidebar}
      </div>
    </>
  );
}
