import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import VitalisLogo from "@/components/brand/VitalisLogo";
import {
  ArrowLeft,
  Bell,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Loader2,
  ShieldAlert,
  AlertOctagon,
  MonitorSmartphone,
  Mail,
  MailX,
  Trash2,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface Notification {
  id: string;
  case_id: string | null;
  case_ref: string | null;
  priority: string;
  title: string;
  body: string | null;
  read_at: string | null;
  delivered_email: boolean;
  delivered_in_app: boolean;
  created_at: string;
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [deliveryFilter, setDeliveryFilter] = useState<"all" | "in_app" | "email" | "unread">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailDeliveryView, setDetailDeliveryView] = useState<"in_app" | "email">("in_app");
  const [refreshing, setRefreshing] = useState(false);

  const fetchItems = async (silent = false) => {
    if (!silent) setRefreshing(true);
    const { data, error } = await supabase
      .from("clinic_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      if (!silent) toast.error("Could not load notifications");
    } else {
      setItems((data ?? []) as Notification[]);
    }
    if (!silent) setRefreshing(false);
    return !error;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      setAuthed(!!user);
      if (!user) {
        setLoading(false);
        return;
      }
      await fetchItems(true);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const markAllRead = async () => {
    const unread = items.filter((n) => !n.read_at).map((n) => n.id);
    if (unread.length === 0) return;
    const now = new Date().toISOString();
    await supabase.from("clinic_notifications").update({ read_at: now }).in("id", unread);
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    toast.success("All notifications marked as read");
  };

  const open = async (n: Notification) => {
    if (!n.read_at) {
      const now = new Date().toISOString();
      await supabase.from("clinic_notifications").update({ read_at: now }).eq("id", n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: now } : x)));
    }
    if (n.case_id) navigate(`/case/${n.case_id}`);
  };

  const remove = async (id: string) => {
    await supabase.from("clinic_notifications").delete().eq("id", id);
    setItems((prev) => prev.filter((n) => n.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkMarkRead = async () => {
    const ids = Array.from(selected).filter((id) => {
      const n = items.find((x) => x.id === id);
      return n && !n.read_at;
    });
    if (ids.length === 0) {
      toast.info("No unread items selected");
      return;
    }
    const now = new Date().toISOString();
    await supabase.from("clinic_notifications").update({ read_at: now }).in("id", ids);
    setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: now } : n)));
    // Re-fetch from server so list + bell badge reflect authoritative state
    await fetchItems(true);
    toast.success(`Marked ${ids.length} as read`);
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const snapshot = items.filter((n) => ids.includes(n.id));
    if (snapshot.length === 0) return;
    // Optimistic delete
    await supabase.from("clinic_notifications").delete().in("id", ids);
    setItems((prev) => prev.filter((n) => !ids.includes(n.id)));
    setSelected(new Set());
    let undone = false;
    toast.success(
      `Deleted ${snapshot.length} notification${snapshot.length === 1 ? "" : "s"}`,
      {
        duration: 6000,
        action: {
          label: "Undo",
          onClick: async () => {
            undone = true;
            // Re-insert snapshots; user_id preserved via RLS (own rows)
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const restore = snapshot.map((n) => ({
              id: n.id,
              user_id: user.id,
              case_id: n.case_id,
              case_ref: n.case_ref,
              priority: n.priority,
              title: n.title,
              body: n.body,
              read_at: n.read_at,
              delivered_email: n.delivered_email,
              delivered_in_app: n.delivered_in_app,
              created_at: n.created_at,
            }));
            const { error } = await supabase.from("clinic_notifications").insert(restore);
            if (error) {
              toast.error("Could not restore notifications");
              return;
            }
            await fetchItems(true);
            toast.success("Notifications restored");
          },
        },
      },
    );
    // Refresh after grace period if not undone, to sync bell badge
    setTimeout(() => {
      if (!undone) fetchItems(true);
    }, 6500);
  };

  const clearSelection = () => setSelected(new Set());

  const toggleSelectAllVisible = (visible: Notification[]) => {
    const visibleIds = visible.map((n) => n.id);
    const allSelected = visibleIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  if (authed === false) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-sm text-muted-foreground">Sign-in required.</p>
          <Button className="mt-4" onClick={() => navigate("/")}>Go to sign in</Button>
        </div>
      </div>
    );
  }

  const unreadCount = items.filter((n) => !n.read_at).length;
  const inAppCount = items.filter((n) => n.delivered_in_app).length;
  const emailCount = items.filter((n) => n.delivered_email).length;
  const filtered = items.filter((n) => {
    if (deliveryFilter === "in_app") return n.delivered_in_app;
    if (deliveryFilter === "email") return n.delivered_email;
    if (deliveryFilter === "unread") return !n.read_at;
    return true;
  });
  const allVisibleSelected =
    filtered.length > 0 && filtered.every((n) => selected.has(n.id));

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 backdrop-blur-md bg-background/85 border-b border-border/50">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" /> Queue
          </button>
          <div className="flex items-center gap-2">
            <VitalisLogo variant="icon" size={18} />
            <span className="text-[12px] font-semibold tracking-tight">Vitalis</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground border-l border-border/50 pl-2 ml-1">
              Notifications
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8 pb-32">
        <div className="flex items-end justify-between gap-3 mb-6">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
              Clinical alerts
            </p>
            <h1 className="text-2xl font-bold tracking-tight">Notification center</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {unreadCount > 0
                ? `${unreadCount} unread alert${unreadCount === 1 ? "" : "s"}`
                : "All caught up"}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="w-3.5 h-3.5 mr-2" /> Mark all read
            </Button>
          )}
        </div>

        {/* Delivery filter chips */}
        {!loading && items.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            {([
              { key: "all", label: `All (${items.length})` },
              { key: "unread", label: `Unread (${unreadCount})` },
              { key: "in_app", label: `In-app (${inAppCount})` },
              { key: "email", label: `Email (${emailCount})` },
            ] as const).map((f) => {
              const active = deliveryFilter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setDeliveryFilter(f.key)}
                  className={`text-[11px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Bulk actions toolbar */}
        {!loading && filtered.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded-md border border-border/60 bg-muted/20">
            <label className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold pl-1 cursor-pointer">
              <Checkbox
                checked={allVisibleSelected}
                onCheckedChange={() => toggleSelectAllVisible(filtered)}
                aria-label="Select all visible notifications"
              />
              {selected.size > 0 ? `${selected.size} selected` : "Select all"}
            </label>
            <div className="ml-auto flex items-center gap-1.5">
            {selected.size > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={clearSelection}
                className="text-muted-foreground"
              >
                <X className="w-3.5 h-3.5 mr-1.5" /> Clear selection
              </Button>
            )}
              <Button
                size="sm"
                variant="outline"
                onClick={bulkMarkRead}
                disabled={selected.size === 0}
              >
                <CheckCheck className="w-3.5 h-3.5 mr-1.5" /> Mark read
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={bulkDelete}
                disabled={selected.size === 0}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
              </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => fetchItems(false)}
              disabled={refreshing}
              className="text-muted-foreground"
              title="Refresh from server"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 px-6">
            <div className="w-12 h-12 rounded-full bg-primary/10 mx-auto mb-3 flex items-center justify-center">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-base font-semibold">No notifications yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              You'll see alerts here when Critical or High priority cases are detected.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 px-6 border border-dashed border-border rounded-xl">
            <p className="text-sm text-muted-foreground">No notifications match this filter.</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setDeliveryFilter("all")}>
              Clear filter
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((n) => {
              const Icon = n.priority === "critical" ? ShieldAlert : AlertOctagon;
              const tone =
                n.priority === "critical" ? "text-destructive" : "text-amber-500";
              const ring =
                n.priority === "critical"
                  ? "border-destructive/40 bg-destructive/5"
                  : "border-amber-500/40 bg-amber-500/5";
              const isExpanded = expandedId === n.id;
              const isSelected = selected.has(n.id);
              return (
                <li key={n.id}>
                  <div
                    className={`rounded-xl border p-4 ${ring} ${
                      n.read_at ? "opacity-70" : ""
                    } ${isSelected ? "ring-2 ring-primary/40" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelected(n.id)}
                          aria-label="Select notification"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Icon className={`w-4 h-4 ${tone}`} />
                        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                          {n.case_ref ?? "—"}
                        </span>
                        <Badge variant="outline" className={`text-[10px] ${tone} border-current/40`}>
                          {n.priority}
                        </Badge>
                        {!n.read_at && (
                          <span className="text-[10px] uppercase tracking-wider font-bold text-primary">
                            new
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm font-semibold">{n.title}</p>
                    {n.body && (
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{n.body}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                          n.delivered_in_app
                            ? "border-primary/40 text-primary bg-primary/5"
                            : "border-border text-muted-foreground"
                        }`}
                        title={n.delivered_in_app ? "Delivered in-app" : "Not delivered in-app"}
                      >
                        <MonitorSmartphone className="w-3 h-3" />
                        In-app {n.delivered_in_app ? "delivered" : "pending"}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                          n.delivered_email
                            ? "border-primary/40 text-primary bg-primary/5"
                            : "border-border text-muted-foreground"
                        }`}
                        title={n.delivered_email ? "Email sent" : "Email not sent"}
                      >
                        {n.delivered_email ? <Mail className="w-3 h-3" /> : <MailX className="w-3 h-3" />}
                        Email {n.delivered_email ? "sent" : "off"}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      {n.case_id && (
                        <Button size="sm" variant="outline" onClick={() => open(n)}>
                          Open case
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setExpandedId(isExpanded ? null : n.id);
                          setDetailDeliveryView(n.delivered_in_app ? "in_app" : "email");
                        }}
                        className="text-muted-foreground"
                      >
                          {isExpanded ? (
                            <><ChevronDown className="w-3.5 h-3.5 mr-1" /> Hide details</>
                          ) : (
                            <><ChevronRight className="w-3.5 h-3.5 mr-1" /> Details</>
                          )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(n.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-border/60">
                        <div className="flex items-center justify-between mb-2 gap-2">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                            Delivery history
                          </p>
                          <div className="flex rounded-md border border-border overflow-hidden">
                            {(["in_app", "email"] as const).map((v) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => setDetailDeliveryView(v)}
                                className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 transition-colors ${
                                  detailDeliveryView === v
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-card text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                {v === "in_app" ? "In-app" : "Email"}
                              </button>
                            ))}
                          </div>
                        </div>
                        {detailDeliveryView === "in_app" ? (
                          <DeliveryTimestampList
                            channel="in_app"
                            entries={[
                              {
                                label: "Created",
                                value: n.created_at,
                                hint: "Notification record created on server",
                              },
                              {
                                label: "Delivered in-app",
                                value: n.delivered_in_app ? n.created_at : null,
                                hint: n.delivered_in_app
                                  ? "Visible in notification center"
                                  : "Not delivered to in-app center",
                              },
                              {
                                label: "Read by clinician",
                                value: n.read_at,
                                hint: n.read_at ? "Marked read in-app" : "Not yet read",
                              },
                            ]}
                          />
                        ) : (
                          <DeliveryTimestampList
                            channel="email"
                            entries={[
                              {
                                label: "Created",
                                value: n.created_at,
                                hint: "Notification record created on server",
                              },
                              {
                                label: "Email sent",
                                value: n.delivered_email ? n.created_at : null,
                                hint: n.delivered_email
                                  ? "Sent to clinician inbox"
                                  : "Email delivery disabled for this organisation",
                              },
                              {
                                label: "Email read",
                                value: null,
                                hint: "Email read receipts are not tracked",
                              },
                            ]}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-10 text-[11px] text-muted-foreground border-t border-border/40 pt-4">
          In-app alerts are generated automatically for Critical and High priority cases. Email
          delivery can be enabled per organisation; AI-assisted review only — final diagnosis must
          be confirmed by a licensed clinician.
        </p>
      </main>
    </div>
  );
}