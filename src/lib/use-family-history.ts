import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useHealth } from "./health-context";

/**
 * Hook that returns the user's family medical history, sourced from the
 * RLS-protected `user_family_history` table. Each row stores a single
 * condition; we expose a flat list of condition names for the UI.
 *
 * Previously stored unencrypted in `localStorage` under
 * `vitalis_family_history`.
 */
export function useFamilyHistory() {
  const { userId } = useHealth();
  const [conditions, setConditions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setConditions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("user_family_history")
      .select("condition")
      .eq("user_id", userId);
    setConditions(data ? data.map((r) => r.condition) : []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleCondition = useCallback(
    async (condition: string) => {
      if (!userId) return;
      // "None" is mutually exclusive with everything else
      if (condition === "None") {
        // Clear everything, then insert "None"
        await supabase.from("user_family_history").delete().eq("user_id", userId);
        await supabase
          .from("user_family_history")
          .insert({ user_id: userId, condition: "None" });
        setConditions(["None"]);
        return;
      }
      // If "None" is currently set, remove it first
      if (conditions.includes("None")) {
        await supabase
          .from("user_family_history")
          .delete()
          .eq("user_id", userId)
          .eq("condition", "None");
      }
      if (conditions.includes(condition)) {
        await supabase
          .from("user_family_history")
          .delete()
          .eq("user_id", userId)
          .eq("condition", condition);
        setConditions((prev) => prev.filter((c) => c !== condition && c !== "None"));
      } else {
        await supabase
          .from("user_family_history")
          .insert({ user_id: userId, condition });
        setConditions((prev) => [...prev.filter((c) => c !== "None"), condition]);
      }
    },
    [userId, conditions],
  );

  return { conditions, loading, toggleCondition, refresh };
}
