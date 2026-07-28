import { useCallback, useEffect, useState } from "react";

const KEY = "smartlecture_profile";
const EVENT = "smartlecture_profile_change";

export type Profile = {
  name: string;
  email: string;
  institution: string;
  dailyGoalMinutes: number;
};

export const emptyProfile: Profile = {
  name: "",
  email: "",
  institution: "",
  dailyGoalMinutes: 30,
};

export function getProfile(): Profile {
  if (typeof window === "undefined") return emptyProfile;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyProfile;
    return { ...emptyProfile, ...(JSON.parse(raw) as Partial<Profile>) };
  } catch {
    return emptyProfile;
  }
}

export function saveProfile(profile: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Reactive profile that stays in sync across components and tabs. */
export function useProfile() {
  const [profile, setProfile] = useState<Profile>(() => getProfile());

  useEffect(() => {
    const sync = () => setProfile(getProfile());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((next: Profile) => {
    saveProfile(next);
    setProfile(next);
  }, []);

  return { profile, update };
}

/** First name for greetings, falls back to a friendly default. */
export function displayName(profile: Profile): string {
  const n = profile.name.trim();
  if (!n) return "";
  return n.split(/\s+/)[0];
}
