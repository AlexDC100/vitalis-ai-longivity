import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useHealth } from "./health-context";

/**
 * Hook that returns the user's per-day action completion log, sourced from the
 * RLS-protected `action_completions` table. The previous implementation kept
 * a `Record<dateISO, string[]>` blob in `localStorage` under
 * `vitalis_action_log`, exposing the user's medical action history to any
 * script running in the page.
 *
 * Returns:
 *  - `logByDay`: map of `YYYY-MM-DD` → list of fix keys completed that day
 *  - `completeAction(fixId, label)`: mark a fix as done for today
 *  - `getTodayCompleted()` / `getDayCompleted(dateISO)` helpers
 *  - `daysActiveLast7`, `actionsCompletedLast7` derived counters
 */
export function useActionLog() {
  const { userId } = useHealth();
  const [logByDay, setLogByDay] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setLogByDay({});
      setLoading(false);
      return;
    }
    setLoading(true);
    // Pull last 30 days of completions to keep the payload small.
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { data } = await supabase
      .from("action_completions")
      .select("fix_key, completed_at, status, started_at")
      .eq("user_id", userId)
      .gte("started_at", since.toISOString());
    const grouped: Record<string, string[]> = {};
    if (data) {
      for (const row of data) {
        if (row.status !== "done" || !row.completed_at) continue;
        const day = new Date(row.completed_at).toISOString().slice(0, 10);
        if (!grouped[day]) grouped[day] = [];
        if (!grouped[day].includes(row.fix_key)) grouped[day].push(row.fix_key);
      }
    }
    setLogByDay(grouped);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const completeAction = useCallback(
    async (fixId: string, label: string) => {
      if (!userId) return;
      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      // Optimistic local update
      setLogByDay((prev) => {
        const day = prev[today] ?? [];
        if (day.includes(fixId)) return prev;
        return { ...prev, [today]: [...day, fixId] };
      });
      // Upsert by (user_id, fix_key) — tolerate duplicates by ignoring conflict errors
      await supabase.from("action_completions").insert({
        user_id: userId,
        fix_key: fixId,
        action_text: label,
        status: "done",
        completed_at: now,
        started_at: now,
      });
    },
    [userId],
  );

  const getTodayCompleted = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    return logByDay[today] ?? [];
  }, [logByDay]);

  const getDayCompleted = useCallback(
    (dateISO: string) => logByDay[dateISO] ?? [],
    [logByDay],
  );

  // Last-7-day counters used by Today/Dashboard/Future screens.
  let daysActiveLast7 = 0;
  let actionsCompletedLast7 = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const list = logByDay[key];
    if (list && list.length > 0) {
      daysActiveLast7 += 1;
      actionsCompletedLast7 += list.length;
    }
  }

  return {
    logByDay,
    loading,
    completeAction,
    getTodayCompleted,
    getDayCompleted,
    daysActiveLast7,
    actionsCompletedLast7,
    refresh,
  };
}
