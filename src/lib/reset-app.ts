import { closeWriteHistoryForReset } from "./write-history";

export const RESET_KEY = "stripe-api-viewer:reset-in-progress";

// All targets are restricted by the browser to this app's origin (including port).
// The caller must unmount the workspace first so autosave cannot restore old data.
export async function resetAppStorage(onBlocked: () => void): Promise<void> {
  localStorage.setItem(RESET_KEY, crypto.randomUUID());
  await closeWriteHistoryForReset();
  const names = new Set(["stripe-api-viewer-history"]);
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
  // Last: other tabs use this event as the signal that the wipe is complete.
  localStorage.clear();
}
