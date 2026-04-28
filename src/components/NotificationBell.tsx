import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  size?: "sm" | "md";
  className?: string;
}

/**
 * Notification bell with unread badge, links to /notifications.
 * Self-contained: fetches the current user's unread count and
 * subscribes to clinic_notifications realtime updates.
 */
export default function NotificationBell({ size = "md", className = "" }: Props) {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!cancelled) setUserId(user?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = async () => {
      const { count: c } = await supabase
        .from("clinic_notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      if (!cancelled) setCount(c ?? 0);
    };
    load();
    const ch = supabase
      .channel(`notif_bell_${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clinic_notifications", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [userId]);

  if (userId === null) return null;

  const dim = size === "sm" ? "w-8 h-8" : "w-9 h-9";
  const icon = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

  return (
    <button
      type="button"
      onClick={() => navigate("/notifications")}
      className={`relative inline-flex items-center justify-center ${dim} rounded-full border border-border bg-card text-muted-foreground hover:text-foreground transition-colors ${className}`}
      aria-label={count > 0 ? `${count} unread notifications` : "Notifications"}
    >
      <Bell className={icon} />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}