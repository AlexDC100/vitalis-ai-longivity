import React, { createContext, useContext, useState, useCallback } from "react";
import { HealthProfile, defaultHealthProfile, calculateLongevityScore, calculateBiologicalAge } from "./types";

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
}

const HealthContext = createContext<HealthContextType | null>(null);

export function HealthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<HealthProfile>(defaultHealthProfile);
  const [isGuest, setIsGuest] = useState(true);

  const updateField = useCallback((key: keyof HealthProfile, value: any) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  }, []);

  const longevityScore = calculateLongevityScore(profile);
  const biologicalAge = calculateBiologicalAge(profile);
  const chronologicalAge = new Date().getFullYear() - new Date(profile.date_of_birth).getFullYear();

  const fields = Object.keys(defaultHealthProfile).filter(k => !["id","user_id","created_at","updated_at","full_name","date_of_birth","sex"].includes(k));
  const filled = fields.filter(k => (profile as any)[k] !== 0 && (profile as any)[k] !== "").length;
  const dataCompleteness = Math.round((filled / fields.length) * 100);

  return (
    <HealthContext.Provider value={{ profile, setProfile, updateField, longevityScore, biologicalAge, chronologicalAge, dataCompleteness, isGuest, setIsGuest }}>
      {children}
    </HealthContext.Provider>
  );
}

export function useHealth() {
  const ctx = useContext(HealthContext);
  if (!ctx) throw new Error("useHealth must be used within HealthProvider");
  return ctx;
}
