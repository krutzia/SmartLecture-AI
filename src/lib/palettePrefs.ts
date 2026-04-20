// LocalStorage helpers for the global Cmd+K palette: recent lectures and
// pinned lectures. Scoped per user so multiple accounts on one browser
// don't leak each other's history.

const RECENT_KEY = (uid: string) => `palette:recent:${uid}`;
const PINNED_KEY = (uid: string) => `palette:pinned:${uid}`;
const MAX_RECENT = 8;

const safeParse = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};

export const getRecent = (uid: string): string[] =>
  safeParse(localStorage.getItem(RECENT_KEY(uid)));

export const pushRecent = (uid: string, lectureId: string) => {
  const next = [lectureId, ...getRecent(uid).filter((id) => id !== lectureId)].slice(
    0,
    MAX_RECENT,
  );
  localStorage.setItem(RECENT_KEY(uid), JSON.stringify(next));
};

export const getPinned = (uid: string): string[] =>
  safeParse(localStorage.getItem(PINNED_KEY(uid)));

export const togglePinned = (uid: string, lectureId: string): boolean => {
  const current = getPinned(uid);
  const isPinned = current.includes(lectureId);
  const next = isPinned
    ? current.filter((id) => id !== lectureId)
    : [lectureId, ...current];
  localStorage.setItem(PINNED_KEY(uid), JSON.stringify(next));
  return !isPinned;
};

export const isPinned = (uid: string, lectureId: string): boolean =>
  getPinned(uid).includes(lectureId);
