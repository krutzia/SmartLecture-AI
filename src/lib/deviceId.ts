const KEY = "smartlecture_device_id";

/** App-owned localStorage prefixes that must be wiped when a session ends. */
const APP_STORAGE_PREFIXES = ["smartlecture", "sl_db_", "palette", "chat_telemetry", "slide_bookmarks"];

/** Returns the current anonymous session id, or null when signed out. */
export function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}

/** Creates a brand-new anonymous session id (never reuses the previous one). */
export function startSession(): string {
  const id = crypto.randomUUID();
  localStorage.setItem(KEY, id);
  return id;
}

/**
 * Backwards-compatible accessor. Returns the active session id, creating one
 * lazily if a caller needs an id while inside the app.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  return getSessionId() ?? startSession();
}

/** Wipes every trace of the current anonymous session from the browser. */
export async function endSession(): Promise<void> {
  if (typeof window === "undefined") return;

  // localStorage: remove app-owned keys (including the session id itself)
  try {
    const keys = Object.keys(localStorage);
    keys.forEach((k) => {
      if (k === KEY || APP_STORAGE_PREFIXES.some((p) => k.toLowerCase().startsWith(p))) {
        localStorage.removeItem(k);
      }
    });
  } catch {
    /* storage unavailable */
  }

  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }

  // IndexedDB (cleared for completeness)
  try {
    const idb = indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> };
    if (typeof idb.databases === "function") {
      const dbs = await idb.databases();
      await Promise.all(
        dbs
          .map((d) => d.name)
          .filter((n): n is string => Boolean(n))
          .map(
            (name) =>
              new Promise<void>((resolve) => {
                const req = indexedDB.deleteDatabase(name);
                req.onsuccess = req.onerror = req.onblocked = () => resolve();
              }),
          ),
      );
    }
  } catch {
    /* ignore */
  }

  // Cached API responses
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  } catch {
    /* ignore */
  }
}

/** @deprecated use endSession + startSession */
export function resetDeviceId(): string {
  return startSession();
}
