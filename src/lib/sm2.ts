// SuperMemo SM-2 spaced repetition algorithm.
// quality: 0–5 (we map UI to: Again=2, Hard=3, Good=4, Easy=5)
export type SM2State = {
  ease_factor: number;
  interval_days: number;
  repetitions: number;
};

export type SM2Result = SM2State & {
  due_date: string; // ISO
  last_reviewed_at: string; // ISO
  known: boolean;
};

export function sm2(prev: SM2State, quality: number): SM2Result {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let { ease_factor, interval_days, repetitions } = prev;

  if (q < 3) {
    repetitions = 0;
    interval_days = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval_days = 1;
    else if (repetitions === 2) interval_days = 6;
    else interval_days = Math.round(interval_days * ease_factor);
  }

  ease_factor = Math.max(1.3, ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  const now = new Date();
  const due = new Date(now.getTime() + interval_days * 24 * 60 * 60 * 1000);

  return {
    ease_factor: Math.round(ease_factor * 100) / 100,
    interval_days,
    repetitions,
    due_date: due.toISOString(),
    last_reviewed_at: now.toISOString(),
    known: q >= 4,
  };
}

export const QUALITY = {
  AGAIN: 2,
  HARD: 3,
  GOOD: 4,
  EASY: 5,
} as const;
