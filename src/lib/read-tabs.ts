import {
  type Method,
  type StripeRequest,
  type StripeResponse,
  resources,
  methodsFor,
} from "./stripe";
import { restoreExpansions } from "./expansions";
import { assertAppNotResetting } from "./reset-state";

export type ReadDraft = {
  objectId: string;
  query: string;
  limit: string;
  cursor: string;
  expand: string[];
};
export type ReadForm = {
  resource: string;
  methods: Record<string, Method | "">;
  drafts: Record<string, ReadDraft>;
  expandOpen: boolean;
  minimap: boolean;
  wordWrap: boolean;
  fullscreen: boolean;
};
export const emptyReadForm = (): ReadForm => ({
  resource: "",
  methods: {},
  drafts: {},
  expandOpen: false,
  minimap: true,
  wordWrap: false,
  fullscreen: false,
});
export function readFormFrom(settings: ReadForm): ReadForm {
  const {
    resource,
    methods,
    drafts,
    expandOpen,
    minimap,
    wordWrap,
    fullscreen,
  } = settings;
  return {
    resource,
    methods,
    drafts,
    expandOpen,
    minimap,
    wordWrap,
    fullscreen,
  };
}
export type ReadTab = {
  id: string;
  form: ReadForm;
  response: StripeResponse | null;
  request: Omit<StripeRequest, "apiKey"> | null;
  keyFingerprint: string;
  error: string;
  busy: boolean;
};
export type ReadTabsSnapshot = { tabs: ReadTab[]; activeId: string };
export function newReadTab(
  form = emptyReadForm(),
  id = crypto.randomUUID(),
): ReadTab {
  return {
    id,
    form,
    response: null,
    request: null,
    keyFingerprint: "",
    error: "",
    busy: false,
  };
}
export function readTabLabel(tab: ReadTab): string {
  const resource = resources.find((item) => item.id === tab.form.resource);
  if (!resource) return "New request";
  const method = tab.form.methods[resource.id];
  const draft = tab.form.drafts[`${resource.id}:${method}`];
  if (method === "retrieve")
    return `${resource.singular}${draft?.objectId.trim() ? ` · ${draft.objectId.trim()}` : ""}`;
  return `${resource.label}${method ? ` · ${method === "search" ? "Search" : "List"}` : ""}`;
}
export async function keyFingerprint(key: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key.trim()),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export const READ_TABS_DATABASE = "stripe-api-viewer-read-tabs";
let database: Promise<IDBDatabase> | undefined;
async function openDatabase(): Promise<IDBDatabase> {
  assertAppNotResetting();
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open(READ_TABS_DATABASE, 1);
      let abandoned = false;
      request.onupgradeneeded = () => {
        request.result.createObjectStore("tabs", { keyPath: "id" });
        request.result.createObjectStore("responses", { keyPath: "id" });
        request.result.createObjectStore("meta");
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
        reject(request.error || new Error("Could not open read tabs."));
      request.onblocked = () => {
        abandoned = true;
        reject(new Error("Close other copies of this app to load read tabs."));
      };
    });
    void database.catch(() => {
      database = undefined;
    });
  }
  return database;
}
export async function closeReadTabsForReset() {
  const current = database;
  database = undefined;
  if (current) (await current.catch(() => null))?.close();
}
async function transaction<T>(
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction, done: (value: T) => void) => void,
): Promise<T> {
  const db = await openDatabase();
  assertAppNotResetting();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["tabs", "responses", "meta"], mode);
    let result: T;
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () =>
      reject(tx.error || new Error("Read tabs could not be saved."));
    try {
      work(tx, (value) => {
        result = value;
      });
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}

export async function loadReadTabs(): Promise<ReadTabsSnapshot | null> {
  const data = await transaction<{
    tabs: Omit<ReadTab, "response">[];
    responses: { id: string; response: StripeResponse }[];
    meta?: { activeId: string; order: string[] };
  }>("readonly", (tx, done) => {
    const result = { tabs: [], responses: [] } as {
      tabs: Omit<ReadTab, "response">[];
      responses: { id: string; response: StripeResponse }[];
      meta?: { activeId: string; order: string[] };
    };
    done(result);
    tx.objectStore("tabs").getAll().onsuccess = (event) => {
      result.tabs = (event.target as IDBRequest).result;
    };
    tx.objectStore("responses").getAll().onsuccess = (event) => {
      result.responses = (event.target as IDBRequest).result;
    };
    tx.objectStore("meta").get("workspace").onsuccess = (event) => {
      result.meta = (event.target as IDBRequest).result;
    };
  });
  if (!data.tabs.length) return null;
  const responses = new Map(
    data.responses.map((entry) => [entry.id, entry.response]),
  );
  const order = data.meta?.order ?? data.tabs.map((tab) => tab.id);
  const tabs = data.tabs
    .map((tab) => {
      if (!tab.id || !tab.form || !tab.form.drafts || !tab.form.methods)
        throw new Error(
          "Saved read tabs could not be read. Reset the app only if you want to discard them.",
        );
      const form = { ...emptyReadForm(), ...tab.form };
      if (!resources.some((resource) => resource.id === form.resource))
        form.resource = "";
      for (const resource of resources) {
        if (!methodsFor(resource).includes(form.methods[resource.id] as Method))
          delete form.methods[resource.id];
      }
      for (const draft of Object.values(form.drafts))
        draft.expand = restoreExpansions(draft.expand, undefined);
      return {
        ...tab,
        form,
        response: responses.get(tab.id) ?? null,
        busy: false,
        error: tab.busy
          ? "The previous request was interrupted. Send again when ready."
          : tab.error,
      };
    })
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return {
    tabs,
    activeId: tabs.some((tab) => tab.id === data.meta?.activeId)
      ? data.meta!.activeId
      : tabs[0].id,
  };
}

export async function saveReadTabs(
  snapshot: ReadTabsSnapshot,
  previous: ReadTabsSnapshot | null,
): Promise<void> {
  await transaction<void>("readwrite", (tx) => {
    const ids = new Set(snapshot.tabs.map((tab) => tab.id));
    for (const old of previous?.tabs ?? []) {
      if (!ids.has(old.id)) {
        tx.objectStore("tabs").delete(old.id);
        tx.objectStore("responses").delete(old.id);
      }
    }
    for (const tab of snapshot.tabs) {
      const old = previous?.tabs.find((entry) => entry.id === tab.id);
      if (old === tab) continue;
      // Explicit allowlist: never persist API keys or arbitrary runtime state.
      const request = tab.request && {
        resource: tab.request.resource,
        method: tab.request.method,
        objectId: tab.request.objectId,
        query: tab.request.query,
        limit: tab.request.limit,
        cursor: tab.request.cursor,
        expand: tab.request.expand,
        account: tab.request.account,
        apiVersion: tab.request.apiVersion,
      };
      tx.objectStore("tabs").put({
        id: tab.id,
        form: readFormFrom(tab.form),
        request,
        keyFingerprint: tab.keyFingerprint,
        error: tab.error,
        busy: tab.busy,
      });
      // Large response bodies are not copied again for form edits or tab switches.
      if (!old || old.response !== tab.response) {
        if (tab.response)
          tx.objectStore("responses").put({
            id: tab.id,
            response: tab.response,
          });
        else tx.objectStore("responses").delete(tab.id);
      }
    }
    tx.objectStore("meta").put(
      {
        activeId: snapshot.activeId,
        order: snapshot.tabs.map((tab) => tab.id),
      },
      "workspace",
    );
  });
}
