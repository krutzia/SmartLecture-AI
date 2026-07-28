import { useCallback, useEffect, useState } from "react";

const KEY = "smartlecture_profile";
const EVENT = "smartlecture_profile_change";

export type Profile = {
  name: string;
  email: string;
  institution: string;
  dailyGoalMinutes: number;
  /** Square avatar stored as a data URL (cropped client-side). */
  avatar: string;
  /** True once the user has completed the setup step. */
  onboarded: boolean;
};

export const emptyProfile: Profile = {
  name: "",
  email: "",
  institution: "",
  dailyGoalMinutes: 30,
  avatar: "",
  onboarded: false,
};

export const NAME_MAX = 40;
export const INSTITUTION_MAX = 80;
export const EMAIL_MAX = 254;

/** Letters (incl. accents), spaces, apostrophes, hyphens and dots only. */
const NAME_ALLOWED = /^[\p{L}][\p{L}\s'.-]*$/u;

/** Strips unsafe characters and collapses whitespace. Does not enforce length. */
export function sanitizeName(raw: string): string {
  return raw
    .replace(/[^\p{L}\s'.-]/gu, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s'.-]+/, "");
}

/** Trim + collapse + clamp, ready to persist. */
export function formatName(raw: string): string {
  return sanitizeName(raw).trim().slice(0, NAME_MAX);
}

/** Returns an error message, or null when valid. */
export function validateName(raw: string): string | null {
  const name = raw.trim();
  if (!name) return "Please enter your name.";
  if (name.length < 2) return "Name must be at least 2 characters.";
  if (name.length > NAME_MAX) return `Name must be ${NAME_MAX} characters or fewer.`;
  if (!NAME_ALLOWED.test(name)) return "Use letters, spaces, apostrophes, hyphens or dots only.";
  return null;
}

export function validateEmail(raw: string): string | null {
  const email = raw.trim();
  if (!email) return null; // optional
  if (email.length > EMAIL_MAX) return "Email is too long.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "Enter a valid email address.";
  return null;
}

export function clampGoal(value: number | string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 30;
  return Math.min(600, Math.max(5, Math.round(n)));
}

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
    /* storage unavailable (e.g. quota exceeded from a large avatar) */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Reactive profile that stays in sync across components and tabs, live. */
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

  const update = useCallback((patch: Partial<Profile>) => {
    const next = { ...getProfile(), ...patch };
    saveProfile(next);
    setProfile(next);
    return next;
  }, []);

  return { profile, update };
}

/** First name for greetings; empty string when unset. */
export function displayName(profile: Profile): string {
  const n = profile.name.trim();
  return n ? n.split(/\s+/)[0] : "";
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return parts.map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
