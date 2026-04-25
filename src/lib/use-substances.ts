import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useHealth } from "./health-context";
import type { SubstanceEntry } from "./diagnosis-engine";

/**
 * Hook that returns the user's substances (medications, supplements, PEDs, etc.)
 * sourced from the RLS-protected `user_substances` table.
 *
 * Previously these were stored unencrypted in `localStorage` under
 * `vitalis_substances`, which exposed sensitive medical data to any
 * browser extension or XSS payload running in the active session.
 */
export function useSubstances() {
  const { userId } = useHealth();
  const [substances, setSubstances] = useState<SubstanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const idMapRef = useRef<Map<number, string>>(new Map()); // local index → row id

  const refresh = useCallback(async () => {
    if (!userId) {
      setSubstances([]);
      idMapRef.current.clear();
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("user_substances")
      .select("id, name, category, dose, frequency")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    const list: SubstanceEntry[] = [];
    idMapRef.current.clear();
    if (data) {
      data.forEach((row, i) => {
        idMapRef.current.set(i, row.id);
        list.push({
          name: row.name,
          category: (row.category as SubstanceEntry["category"]) || "other",
          dose: row.dose ?? undefined,
          frequency: row.frequency ?? undefined,
        });
      });
    }
    setSubstances(list);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addSubstance = useCallback(
    async (sub: SubstanceEntry) => {
      if (!userId) return;
      const { data } = await supabase
        .from("user_substances")
        .insert({
          user_id: userId,
          name: sub.name,
          category: sub.category,
          dose: sub.dose ?? null,
          frequency: sub.frequency ?? null,
        })
        .select("id")
        .single();
      if (data) {
        setSubstances((prev) => {
          const next = [...prev, sub];
          idMapRef.current.set(next.length - 1, data.id);
          return next;
        });
      }
    },
    [userId],
  );

  const removeSubstance = useCallback(
    async (index: number) => {
      if (!userId) return;
      const rowId = idMapRef.current.get(index);
      if (!rowId) return;
      await supabase
        .from("user_substances")
        .delete()
        .eq("id", rowId)
        .eq("user_id", userId);
      await refresh();
    },
    [userId, refresh],
  );

  return { substances, loading, addSubstance, removeSubstance, refresh };
}
