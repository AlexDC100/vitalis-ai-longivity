import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { HealthProfile, defaultHealthProfile, calculateLongevityScore, calculateBiologicalAge } from "./types";
import { supabase } from "@/integrations/supabase/client";

interface HealthContextType {
  profile: HealthProfile;
  setProfile: (p: HealthProfile) => void;
  updateField: (key: keyof HealthProfile, value: any) => void;
  longevityScore: number;
  biologicalAge: number;
  chronologicalAge: number;
  dataCompleteness: number;
  isGuest: boolean;
  setIsGuest: (v: boolean) => void;
  userId: string | null;
  setUserId: (id: string | null) => void;
  saving: boolean;
}

const HealthContext = createContext<HealthContextType | null>(null);

export function HealthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfileState] = useState<HealthProfile>(defaultHealthProfile);
  const [isGuest, setIsGuest] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  // Load profile from DB when userId changes
  useEffect(() => {
    if (!userId) {
      loadedRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("health_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setProfileState(data as unknown as HealthProfile);
      } else if (!error) {
        // No profile yet — create one with defaults
        const newProfile = { ...defaultHealthProfile, user_id: userId };
        const { data: inserted } = await supabase
          .from("health_profiles")
          .insert(newProfile)
          .select()
          .single();
        if (!cancelled && inserted) {
          setProfileState(inserted as unknown as HealthProfile);
        }
      }
      loadedRef.current = true;
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Valid DB columns for health_profiles (must match schema)
  const VALID_DB_COLUMNS = new Set([
    "user_id", "full_name", "date_of_birth", "sex", "height_cm", "weight_kg",
    "body_fat_pct", "waist_cm", "bp_systolic", "bp_diastolic", "hrv_ms",
    "resting_hr", "vo2_max", "avg_sleep_hours", "sleep_quality", "fev1_pct",
    "fasting_glucose", "hba1c", "fasting_insulin", "total_cholesterol", "ldl",
    "hdl", "triglycerides", "apob", "lpa", "hscrp", "homocysteine", "vitamin_d",
    "testosterone", "free_t", "estradiol", "dhea_s", "cortisol", "tsh",
    "free_t3", "free_t4", "igf1",
  ]);

  // Debounced save to DB on profile change
  const saveToDb = useCallback((p: HealthProfile) => {
    if (!userId || !loadedRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      const { id, created_at, updated_at, ...allFields } = p as any;
      // Only send columns that exist in the DB schema
      const fields: Record<string, any> = {};
      for (const [key, val] of Object.entries(allFields)) {
        if (VALID_DB_COLUMNS.has(key)) fields[key] = val;
      }
      await supabase
        .from("health_profiles")
        .update(fields)
        .eq("user_id", userId);
      setSaving(false);
    }, 1000);
  }, [userId]);

  const setProfile = useCallback((p: HealthProfile) => {
    setProfileState(p);
    saveToDb(p);
  }, [saveToDb]);

  const updateField = useCallback((key: keyof HealthProfile, value: any) => {
    setProfileState((prev) => {
      const next = { ...prev, [key]: value };
      saveToDb(next);
      return next;
    });
  }, [saveToDb]);

  const longevityScore = calculateLongevityScore(profile);
  const biologicalAge = calculateBiologicalAge(profile);
  const chronologicalAge = new Date().getFullYear() - new Date(profile.date_of_birth).getFullYear();

  const fields = Object.keys(defaultHealthProfile).filter(k => !["id","user_id","created_at","updated_at","full_name","date_of_birth","sex"].includes(k));
  const filled = fields.filter(k => (profile as any)[k] !== 0 && (profile as any)[k] !== "").length;
  const dataCompleteness = Math.round((filled / fields.length) * 100);

  return (
    <HealthContext.Provider value={{ profile, setProfile, updateField, longevityScore, biologicalAge, chronologicalAge, dataCompleteness, isGuest, setIsGuest, userId, setUserId, saving }}>
      {children}
    </HealthContext.Provider>
  );
}

export function useHealth() {
  const ctx = useContext(HealthContext);
  if (!ctx) throw new Error("useHealth must be used within HealthProvider");
  return ctx;
}
