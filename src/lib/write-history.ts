import {
  keyMode,
  writeFingerprintSource,
  writeLabels,
  writeResources,
  type WriteAction,
  type WriteInput,
} from "./stripe-writes";
import { assertAppNotResetting, pauseAppForReset } from "./reset-state";

export const HISTORY_CHANGED = "stripe-write-history-changed";
export type HistoryRecord = {
  id: string;
  name: string;
  resource: string;
  action: WriteAction;
  objectId: string;
  mode: "test" | "live";
  createdAt: number;
  outcome: "pending" | "success" | "error" | "unknown";
  status?: number;
  requestId?: string | null;
  error?: string;
};
export type HistoryRequest = {
  id: string;
  body: string;
  account: string;
  apiVersion: string;
  operation: { fingerprint: string; key: string; created: number };
};
export type HistoryEntry = { record: HistoryRecord; request: HistoryRequest };
let database: Promise<IDBDatabase> | undefined;

export async function closeWriteHistoryForReset(): Promise<void> {
  pauseAppForReset();
  const current = database;
  database = undefined;
  if (current) (await current.catch(() => null))?.close();
}

function openDatabase(): Promise<IDBDatabase> {
  assertAppNotResetting();
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open("stripe-api-viewer-history", 1);
    let abandoned = false;
    request.onupgradeneeded = () => {
      const records = request.result.createObjectStore("records", {
        keyPath: "id",
      });
      records.createIndex("resource", "resource");
      records.createIndex("resourceDate", ["resource", "createdAt", "id"]);
      request.result.createObjectStore("requests", { keyPath: "id" });
    };
    request.onsuccess = () => {
      if (abandoned) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => {
        request.result.close();
        database = undefined;
      };
      resolve(request.result);
    };
    request.onerror = () =>
      reject(request.error || new Error("Could not open write history."));
    request.onblocked = () => {
      abandoned = true;
      reject(
        new Error("Close other copies of this app to upgrade write history."),
      );
    };
  });
  void database.catch(() => {
    database = undefined;
  });
  return database;
}

async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction, result: (value: T) => void) => void,
): Promise<T> {
  const db = await openDatabase();
  assertAppNotResetting();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let value: T;
    tx.oncomplete = () => resolve(value);
    tx.onabort = () =>
      reject(tx.error || new Error("Write history could not be saved."));
    tx.onerror = () =>
      reject(tx.error || new Error("Write history is unavailable."));
    try {
      work(tx, (result) => {
        value = result;
      });
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}

function notify() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(HISTORY_CHANGED));
}

export async function saveWriteHistory(
  input: WriteInput,
  operationCreated: number,
): Promise<HistoryRecord> {
  const { idempotencyKey, ...base } = input;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(writeFingerprintSource(base)),
  );
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const resource = writeResources.find((r) => r.id === input.resource)!;
  const body = JSON.parse(input.body);
  const description =
    input.action === "create"
      ? [body.name, body.email, body.description].find(
          (value) => typeof value === "string" && value.trim(),
        )
      : input.objectId.trim();
  const record: HistoryRecord = {
    id: crypto.randomUUID(),
    name: `${writeLabels[input.action]} ${resource.singular.toLowerCase()}${description ? ` · ${description}` : ""}`.slice(
      0,
      160,
    ),
    resource: input.resource,
    action: input.action,
    objectId: input.objectId,
    mode: keyMode(input.apiKey),
    createdAt: Date.now(),
    outcome: "pending",
  };
  // Credentials and confirmation tokens are deliberately not copied into history.
  const savedRequest: HistoryRequest = {
    id: record.id,
    body: input.body,
    account: input.account,
    apiVersion: input.apiVersion,
    operation: { fingerprint, key: idempotencyKey, created: operationCreated },
  };
  await transaction<void>(["records", "requests"], "readwrite", (tx) => {
    tx.objectStore("records").add(record);
    tx.objectStore("requests").add(savedRequest);
  });
  notify();
  return record;
}

async function updateRecord(
  id: string,
  change: Partial<HistoryRecord>,
): Promise<void> {
  await transaction<void>(["records"], "readwrite", (tx) => {
    const store = tx.objectStore("records");
    const request = store.get(id);
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, ...change });
    };
  });
  notify();
}

export async function finishWriteHistory(
  id: string,
  result: Pick<HistoryRecord, "outcome" | "status" | "requestId" | "error">,
): Promise<void> {
  await updateRecord(id, result);
}

export async function renameWriteHistory(
  id: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 160)
    throw new Error("Use a name between 1 and 160 characters.");
  await updateRecord(id, { name: trimmed });
}

export async function loadWriteHistory(id: string): Promise<HistoryEntry> {
  const entry = await transaction<Partial<HistoryEntry>>(
    ["records", "requests"],
    "readonly",
    (tx, done) => {
      const result: Partial<HistoryEntry> = {};
      done(result);
      tx.objectStore("records").get(id).onsuccess = (event) => {
        result.record = (event.target as IDBRequest).result;
      };
      tx.objectStore("requests").get(id).onsuccess = (event) => {
        result.request = (event.target as IDBRequest).result;
      };
    },
  );
  if (!entry.record || !entry.request)
    throw new Error("This history entry is no longer available.");
  return entry as HistoryEntry;
}

export async function deleteWriteHistory(id: string): Promise<void> {
  await transaction<void>(["records", "requests"], "readwrite", (tx) => {
    tx.objectStore("records").delete(id);
    tx.objectStore("requests").delete(id);
  });
  notify();
}

export async function clearWriteHistory(): Promise<void> {
  await transaction<void>(["records", "requests"], "readwrite", (tx) => {
    tx.objectStore("records").clear();
    tx.objectStore("requests").clear();
  });
  notify();
}

export async function historyCounts(): Promise<Record<string, number>> {
  return transaction(["records"], "readonly", (tx, done) => {
    const counts: Record<string, number> = {};
    done(counts);
    for (const resource of writeResources) {
      const request = tx
        .objectStore("records")
        .index("resource")
        .count(resource.id);
      request.onsuccess = () => {
        counts[resource.id] = request.result;
      };
    }
  });
}

export async function historyPage(
  resource: string,
  limit = 20,
): Promise<HistoryRecord[]> {
  return transaction(["records"], "readonly", (tx, done) => {
    const records: HistoryRecord[] = [];
    done(records);
    const range = IDBKeyRange.bound(
      [resource, 0, ""],
      [resource, Number.MAX_SAFE_INTEGER, "\uffff"],
    );
    const request = tx
      .objectStore("records")
      .index("resourceDate")
      .openCursor(range, "prev");
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || records.length >= limit) return;
      records.push(cursor.value);
      if (records.length < limit) cursor.continue();
    };
  });
}
