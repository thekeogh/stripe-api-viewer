import { closeWriteHistoryForReset } from "./write-history";
import { closeReadTabsForReset, READ_TABS_DATABASE } from "./read-tabs";

export const RESET_KEY = "stripe-api-viewer:reset-in-progress";
const SETTINGS_KEY = "stripe-api-viewer:v1";

export function resetKeepsApiKey(marker: string): boolean {
  try {
    const saved = JSON.parse(marker);
    return typeof saved?.keepApiKey === "boolean" ? saved.keepApiKey : true;
  } catch {
    return true;
  }
}

// All targets are restricted by the browser to this app's origin (including port).
// The caller must unmount the workspace first so autosave cannot restore old data.
export async function resetAppStorage(
  onBlocked: () => void,
  keepApiKey = true,
): Promise<void> {
  // Read before deleting anything. If saved settings cannot be parsed, fail
  // rather than silently losing a key the user asked us to keep.
  let apiKey = "";
  if (keepApiKey) {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    if (typeof saved?.apiKey === "string") apiKey = saved.apiKey;
  }
  localStorage.setItem(
    RESET_KEY,
    JSON.stringify({ id: crypto.randomUUID(), keepApiKey }),
  );
  await closeWriteHistoryForReset();
  await closeReadTabsForReset();
  const names = new Set(["stripe-api-viewer-history", READ_TABS_DATABASE]);
  if (typeof indexedDB.databases === "function") {
    for (const database of await indexedDB.databases()) {
      if (database.name) names.add(database.name);
    }
  }
  await Promise.all(
    [...names].map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () =>
            reject(
              request.error ||
                new Error("Could not delete browser history storage."),
            );
          // Keep waiting: the browser completes deletion once other connections close.
          request.onblocked = onBlocked;
        }),
    ),
  );
  if (typeof caches !== "undefined") {
    for (const name of await caches.keys()) {
      if (!(await caches.delete(name)))
        throw new Error(
          "Could not clear a browser cache. Try resetting again.",
        );
    }
  }
  sessionStorage.clear();
  // Keep only the key, never the rest of the connection or UI settings.
  // Write it before deleting other keys so a failed write cannot lose it.
  if (keepApiKey && apiKey)
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ apiKey }));
  const keys = Array.from({ length: localStorage.length }, (_, index) =>
    localStorage.key(index),
  );
  for (const key of keys) {
    if (
      key !== null &&
      key !== RESET_KEY &&
      !(keepApiKey && apiKey && key === SETTINGS_KEY)
    )
      localStorage.removeItem(key);
  }
  // Notify other tabs only after retained settings are safely in place.
  // On failure this marker remains, including the user's choice for retry.
  localStorage.removeItem(RESET_KEY);
}
