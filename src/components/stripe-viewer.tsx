"use client";

import dynamic from "next/dynamic";
import WriteWorkspace, { emptyWriteStatus } from "./write-workspace";
import ResetConfirmation from "./reset-confirmation";
import { isAppResetting } from "@/lib/reset-state";
import ExpandOptions from "./expand-options";
import { restoreExpansions } from "@/lib/expansions";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Code2,
  Database,
  Eye,
  EyeOff,
  History,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  X,
} from "lucide-react";
import {
  buildStripePath,
  methodLabels,
  methodsFor,
  resources,
  type Method,
  type RequestFields,
  type StripeRequest,
  type StripeResponse,
} from "@/lib/stripe";

const JsonViewer = dynamic(() => import("./json-viewer"), {
  ssr: false,
  loading: () => <div className="editor-loading">Loading viewer…</div>,
});
const STORAGE_KEY = "stripe-api-viewer:v1";
const emptyDraft = {
  objectId: "",
  query: "",
  limit: "10",
  cursor: "",
  expand: [] as string[],
};
type Draft = typeof emptyDraft;
type Settings = {
  workspace: "reads" | "writes";
  apiKey: string;
  account: string;
  apiVersion: string;
  resource: string;
  methods: Record<string, Method | "">;
  drafts: Record<string, Draft>;
  connectionExpanded: boolean;
  advanced: boolean;
  expandOpen: boolean;
  minimap: boolean;
  wordWrap: boolean;
  fullscreen: boolean;
  historyOpen: boolean;
};
const defaults: Settings = {
  workspace: "reads",
  apiKey: "",
  account: "",
  apiVersion: "",
  resource: "",
  methods: {},
  drafts: {},
  connectionExpanded: true,
  advanced: false,
  expandOpen: false,
  minimap: true,
  wordWrap: false,
  fullscreen: false,
  historyOpen: false,
};

function readSettings(raw: string): Settings {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") return defaults;
  const data = parsed as Record<string, unknown>;
  const settings = { ...defaults, methods: {}, drafts: {} } as Settings;
  for (const key of ["apiKey", "account", "apiVersion", "resource"] as const) {
    if (typeof data[key] === "string") settings[key] = data[key];
  }
  for (const key of [
    "connectionExpanded",
    "advanced",
    "expandOpen",
    "minimap",
    "wordWrap",
    "fullscreen",
    "historyOpen",
  ] as const) {
    if (typeof data[key] === "boolean") settings[key] = data[key];
  }
  if (typeof data.connectionExpanded !== "boolean") {
    settings.connectionExpanded = !settings.apiKey.trim();
  }
  if (data.workspace === "reads" || data.workspace === "writes")
    settings.workspace = data.workspace;
  if (!resources.some((r) => r.id === settings.resource))
    settings.resource = "";
  for (const resource of resources) {
    const method = (data.methods as Record<string, unknown> | undefined)?.[
      resource.id
    ];
    if (
      typeof method === "string" &&
      methodsFor(resource).includes(method as Method)
    )
      settings.methods[resource.id] = method as Method;
    for (const method of methodsFor(resource)) {
      const key = `${resource.id}:${method}`;
      const saved = (data.drafts as Record<string, unknown> | undefined)?.[key];
      if (saved && typeof saved === "object") {
        const draft = { ...emptyDraft };
        for (const field of ["objectId", "query", "limit", "cursor"] as const) {
          const value = (saved as Record<string, unknown>)[field];
          if (typeof value === "string") draft[field] = value;
        }
        const oldDraft = saved as Record<string, unknown>;
        draft.expand = restoreExpansions(oldDraft.expand, oldDraft.parameters);
        settings.drafts[key] = draft;
      }
    }
  }
  return settings;
}

function formatBody(body: string) {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

export default function StripeViewer({ onReset }: { onReset: () => void }) {
  const [resetOpen, setResetOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaults);
  const [ready, setReady] = useState(false);
  const [writeStatus, setWriteStatus] = useState(emptyWriteStatus);
  const [storageWarning, setStorageWarning] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [response, setResponse] = useState<StripeResponse | null>(null);
  const [lastRequest, setLastRequest] = useState<StripeRequest | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const responseRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setSettings(readSettings(saved));
    } catch {
      setStorageWarning(
        "Browser storage is unavailable or could not be read. Settings may not persist.",
      );
    }
    setReady(true);
    return () => controller.current?.abort();
  }, []);

  useEffect(() => {
    if (!ready || isAppResetting()) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      setStorageWarning(
        "Browser storage is unavailable. Your changes cannot be saved.",
      );
    }
  }, [settings, ready]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        settings.workspace === "reads" &&
        (event.metaKey || event.ctrlKey) &&
        event.key === "Enter"
      ) {
        event.preventDefault();
        formRef.current?.requestSubmit();
      }
      if (event.key === "Escape")
        setSettings((current) => ({ ...current, fullscreen: false }));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settings.workspace]);

  useEffect(() => {
    if (settings.fullscreen) responseRef.current?.focus();
  }, [settings.fullscreen]);

  useEffect(() => {
    if (!copied && !notice) return;
    const timeout = setTimeout(() => {
      setCopied(false);
      setNotice("");
    }, 3000);
    return () => clearTimeout(timeout);
  }, [copied, notice]);

  const resource = resources.find((item) => item.id === settings.resource);
  const method = settings.methods[settings.resource] || "";
  const draftKey = `${settings.resource}:${method}`;
  const draft = settings.drafts[draftKey] ?? emptyDraft;
  const fields: RequestFields = {
    resource: settings.resource,
    method,
    ...draft,
  };
  const currentRequest: StripeRequest = {
    ...fields,
    apiKey: settings.apiKey,
    account: settings.account,
    apiVersion: settings.apiVersion,
  };
  let preview = resource ? `/v1/${resource.id}` : "/v1/…";
  let validation = "";
  try {
    preview = buildStripePath(fields);
  } catch (error) {
    validation = error instanceof Error ? error.message : "Check your request.";
    if (method === "retrieve" && resource && !resource.singleton)
      preview += `/{${resource.singular.toLowerCase().replaceAll(" ", "_")}_id}`;
    if (method === "search") preview += "/search";
  }

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setError("");
  }
  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setSettings((current) => ({
      ...current,
      drafts: {
        ...current.drafts,
        [draftKey]: {
          ...(current.drafts[draftKey] ?? emptyDraft),
          [key]: value,
        },
      },
    }));
    setError("");
  }

  const runRequest = useCallback(async (input: StripeRequest) => {
    if (controller.current || isAppResetting()) return;
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError("");
    setResponse(null);
    setLastRequest(input);
    try {
      const result = await fetch("/api/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: active.signal,
        cache: "no-store",
      });
      const payload = await result.json();
      if (!result.ok)
        throw new Error(payload.error || "The request could not be completed.");
      setResponse(payload as StripeResponse);
    } catch (error) {
      if (active.signal.aborted) setError("Request cancelled.");
      else
        setError(
          error instanceof Error
            ? error.message
            : "Something went wrong. Try again.",
        );
    } finally {
      controller.current = null;
      setBusy(false);
    }
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !ready || settings.workspace !== "reads") return;
    if (!settings.apiKey.trim()) {
      update("connectionExpanded", true);
      setError("Paste your Stripe API key to get started.");
      return;
    }
    if (validation) {
      setError(validation);
      return;
    }
    void runRequest(currentRequest);
  }

  const json = response ? formatBody(response.body) : "";
  let nextCursor = "";
  let objectCount: number | null = null;
  try {
    const parsed = JSON.parse(response?.body || "null");
    if (Array.isArray(parsed?.data)) {
      objectCount = parsed.data.length;
      if (parsed.has_more) {
        const cursor =
          lastRequest?.method === "search"
            ? parsed.next_page
            : parsed.data.at(-1)?.id;
        if (typeof cursor === "string") nextCursor = cursor;
      }
    }
  } catch {
    /* Non-JSON upstream errors remain readable. */
  }
  const requestUnchanged =
    lastRequest &&
    JSON.stringify(lastRequest) === JSON.stringify(currentRequest);
  const isSuccess = response && response.status >= 200 && response.status < 300;
  const statusResponse =
    settings.workspace === "writes" ? writeStatus.response : response;
  const statusRequest =
    settings.workspace === "writes" ? writeStatus.request : lastRequest;
  const statusBusy = settings.workspace === "writes" ? writeStatus.busy : busy;
  const statusError =
    settings.workspace === "writes" ? writeStatus.error : error;
  const statusSuccess =
    statusResponse &&
    statusResponse.status >= 200 &&
    statusResponse.status < 300;
  const activeStorageWarning =
    storageWarning ||
    (settings.workspace === "writes" ? writeStatus.storageWarning : "");
  const sameConnection =
    statusRequest &&
    statusRequest.apiKey.trim() === settings.apiKey.trim() &&
    statusRequest.account.trim() === settings.account.trim() &&
    statusRequest.apiVersion.trim() === settings.apiVersion.trim();
  let connection = settings.apiKey.trim()
    ? {
        label: "Not verified",
        tone: "neutral",
        detail: "Send a request to verify this connection.",
      }
    : {
        label: "Disconnected",
        tone: "danger",
        detail: "Add a Stripe API key in Connection to get started.",
      };
  if (!ready) {
    connection = {
      label: "Loading",
      tone: "neutral",
      detail: "Restoring your saved connection settings.",
    };
  } else if (statusBusy) {
    connection = {
      label: "Connecting",
      tone: "pending",
      detail: "Waiting for Stripe to respond.",
    };
  } else if (sameConnection && statusResponse) {
    if (statusSuccess)
      connection = {
        label: "Connected",
        tone: "success",
        detail: "Your latest request succeeded with these connection settings.",
      };
    else if (statusResponse.status === 401)
      connection = {
        label: "Disconnected",
        tone: "danger",
        detail: "Stripe rejected the API key. Check your connection settings.",
      };
    else if (statusResponse.status === 403)
      connection = {
        label: "Access denied",
        tone: "warning",
        detail: "This key does not have permission for the requested resource.",
      };
    else
      connection = {
        label: "Request failed",
        tone: "warning",
        detail: "Stripe returned an error. See the response for details.",
      };
  } else if (sameConnection && statusError) {
    connection = {
      label: "Request failed",
      tone: "danger",
      detail: statusError,
    };
  }
  const mode = /^(sk|rk)_live_/.test(settings.apiKey.trim())
    ? "Live mode"
    : /^(sk|rk)_test_/.test(settings.apiKey.trim())
      ? "Test mode"
      : null;
  const docsUrl = resource
    ? `https://docs.stripe.com/api/${resource.id}${method ? `/${method}` : ""}`
    : "https://docs.stripe.com/api";

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
    } catch {
      setNotice("Copy unavailable. Use the download button to save your JSON.");
    }
  }
  function downloadJson() {
    if (!response) return;
    const url = URL.createObjectURL(
      new Blob([json], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `stripe-${lastRequest?.resource.replaceAll("/", "-") || "response"}-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function nextPage() {
    if (!lastRequest || !nextCursor || !requestUnchanged || busy) return;
    updateDraft("cursor", nextCursor);
    void runRequest({ ...lastRequest, cursor: nextCursor });
  }

  const connectionPanel = (
    <section className="connection-section">
      <button
        type="button"
        className="section-label connection-toggle"
        aria-expanded={settings.connectionExpanded}
        aria-controls="connection-options"
        onClick={() => {
          update("connectionExpanded", !settings.connectionExpanded);
          setShowKey(false);
        }}
      >
        <span>01</span> CONNECTION{" "}
        <ChevronDown
          size={15}
          className={settings.connectionExpanded ? "rotated" : ""}
        />
      </button>
      {settings.connectionExpanded && (
        <div id="connection-options">
          <div className="connection-fields">
            <label htmlFor="api-key">
              Secret API key <KeyRound size={13} />
            </label>
            <div className="password-field">
              <input
                id="api-key"
                type={showKey ? "text" : "password"}
                value={settings.apiKey}
                onChange={(e) => update("apiKey", e.target.value)}
                placeholder="sk_test_… or sk_live_…"
                autoComplete="off"
                spellCheck={false}
                required
              />
              <button
                type="button"
                className="reveal-button"
                aria-label={showKey ? "Hide API key" : "Show API key"}
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="key-note">
              <LockKeyhole size={12} />
              <span>Saved in this browser, including your key.</span>
              {settings.apiKey && (
                <button
                  type="button"
                  onClick={() => {
                    update("apiKey", "");
                    setShowKey(false);
                  }}
                  className="text-button"
                >
                  Forget
                </button>
              )}
            </div>
          </div>
          <section className="advanced-section">
            <button
              type="button"
              className="advanced-toggle"
              aria-expanded={settings.advanced}
              aria-controls="advanced-options"
              onClick={() => update("advanced", !settings.advanced)}
            >
              <SlidersHorizontal size={14} /> More options{" "}
              <ChevronDown
                size={14}
                className={settings.advanced ? "rotated" : ""}
              />
            </button>
            {settings.advanced && (
              <div id="advanced-options" className="advanced-fields">
                {settings.workspace === "reads" &&
                  method &&
                  method !== "retrieve" && (
                    <>
                      <label htmlFor="cursor">
                        {method === "search" ? "Page token" : "Starting after"}
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => updateDraft("cursor", "")}
                        >
                          Reset
                        </button>
                      </label>
                      <input
                        id="cursor"
                        value={draft.cursor}
                        onChange={(e) => updateDraft("cursor", e.target.value)}
                        placeholder={
                          method === "search"
                            ? "Optional next_page token"
                            : "Optional previous object ID"
                        }
                        spellCheck={false}
                      />
                    </>
                  )}
                <label htmlFor="account">
                  Connected account <span>OPTIONAL</span>
                </label>
                <input
                  id="account"
                  value={settings.account}
                  onChange={(e) => update("account", e.target.value)}
                  placeholder="acct_…"
                  spellCheck={false}
                />
                <label htmlFor="api-version">
                  API version <span>OPTIONAL</span>
                </label>
                <input
                  id="api-version"
                  value={settings.apiVersion}
                  onChange={(e) => update("apiVersion", e.target.value)}
                  placeholder="Your account’s default version"
                  spellCheck={false}
                />
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
  function switchWorkspace(workspace: "reads" | "writes") {
    if (busy || writeStatus.busy || !ready) return;
    setSettings((current) => ({ ...current, workspace, fullscreen: false }));
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="/" className="brand" aria-label="Stripe API Viewer home">
          <span className="brand-mark">
            <Code2 size={23} strokeWidth={2.3} />
          </span>
          <span>
            Stripe <strong>API Viewer</strong>
          </span>
          <span className="personal-tag">PERSONAL TOOL</span>
        </a>
        <nav
          className="workspace-tabs"
          role="tablist"
          aria-label="API workspace"
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const next = settings.workspace === "reads" ? "writes" : "reads";
            switchWorkspace(next);
            document.getElementById(next + "-tab")?.focus();
          }}
        >
          <button
            id="reads-tab"
            type="button"
            role="tab"
            aria-controls="reads-panel"
            aria-selected={settings.workspace === "reads"}
            tabIndex={settings.workspace === "reads" ? 0 : -1}
            disabled={!ready || busy || writeStatus.busy}
            onClick={() => switchWorkspace("reads")}
          >
            Reads
          </button>
          <button
            id="writes-tab"
            type="button"
            role="tab"
            aria-controls="writes-panel"
            aria-selected={settings.workspace === "writes"}
            tabIndex={settings.workspace === "writes" ? 0 : -1}
            disabled={!ready || busy || writeStatus.busy}
            onClick={() => switchWorkspace("writes")}
          >
            Writes
          </button>
        </nav>
        <div className="topbar-right">
          <button
            type="button"
            className="reset-everything-button"
            disabled={!ready || busy || writeStatus.busy}
            title="Permanently erase all local app data and start fresh"
            onClick={() => setResetOpen(true)}
          >
            <RotateCcw size={16} /> Reset everything
          </button>
          {settings.workspace === "writes" && (
            <button
              id="write-history-toggle"
              type="button"
              className="history-toggle"
              aria-label="Write history"
              aria-expanded={settings.historyOpen}
              aria-controls="write-history"
              disabled={!ready}
              onClick={() => update("historyOpen", !settings.historyOpen)}
            >
              <History size={16} />
              <span>History</span>
            </button>
          )}
          <span className="readonly-pill">
            <ShieldCheck size={14} />{" "}
            {settings.workspace === "reads"
              ? "Read-only requests"
              : "Protected write actions"}
          </span>
          <a
            href="https://docs.stripe.com/api"
            target="_blank"
            rel="noreferrer"
            className="docs-link"
          >
            Stripe docs <ArrowUpRight size={15} />
          </a>
        </div>
      </header>

      <main className="main">
        <h1 className="sr-only">Stripe API Viewer</h1>
        <div
          className="workspace"
          id="reads-panel"
          role="tabpanel"
          aria-labelledby="reads-tab"
          hidden={settings.workspace !== "reads"}
        >
          <aside className="request-panel">
            <div className="panel-heading">
              <span className="heading-icon">
                <SlidersHorizontal size={17} />
              </span>
              <h2>Request builder</h2>
              <span className="get-badge">GET ONLY</span>
            </div>
            <form ref={formRef} onSubmit={submit}>
              <fieldset disabled={!ready || busy}>
                {settings.workspace === "reads" && connectionPanel}

                <section className="form-section endpoint-section">
                  <div className="section-label">
                    <span>02</span> ENDPOINT <Database size={14} />
                  </div>
                  <label htmlFor="resource">Resource</label>
                  <div className="select-wrap">
                    <select
                      id="resource"
                      value={settings.resource}
                      onChange={(e) => update("resource", e.target.value)}
                      required
                    >
                      <option value="" disabled>
                        Select a resource
                      </option>
                      {["Billing", "Catalog", "Payments", "Account"].map(
                        (group) => (
                          <optgroup key={group} label={group}>
                            {resources
                              .filter((r) => r.group === group)
                              .map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.label}
                                </option>
                              ))}
                          </optgroup>
                        ),
                      )}
                    </select>
                    <ChevronDown size={15} />
                  </div>
                  <label htmlFor="method">
                    Method <span>READ ONLY</span>
                  </label>
                  <div className="select-wrap">
                    <select
                      id="method"
                      value={method}
                      disabled={!resource}
                      onChange={(e) =>
                        update("methods", {
                          ...settings.methods,
                          [settings.resource]: e.target.value as Method,
                        })
                      }
                      required
                    >
                      <option value="" disabled>
                        {resource
                          ? "Select a method"
                          : "Choose a resource first"}
                      </option>
                      {resource &&
                        methodsFor(resource).map((m) => (
                          <option key={m} value={m}>
                            {methodLabels[m]}
                          </option>
                        ))}
                    </select>
                    <ChevronDown size={15} />
                  </div>

                  {resource && method === "retrieve" && !resource.singleton && (
                    <div className="dynamic-field">
                      <label htmlFor="object-id">
                        {resource.singular} ID <span>REQUIRED</span>
                      </label>
                      <input
                        id="object-id"
                        placeholder={`Enter the ${resource.singular} ID`}
                        value={draft.objectId}
                        onChange={(e) =>
                          updateDraft("objectId", e.target.value)
                        }
                        autoComplete="off"
                        spellCheck={false}
                        required
                      />
                      <p className="field-hint">
                        {resource.prefix
                          ? `Usually starts with ${resource.prefix}`
                          : "The unique ID of the coupon in Stripe."}
                      </p>
                    </div>
                  )}
                  {method === "search" && (
                    <div className="dynamic-field">
                      <label htmlFor="query">
                        Search query <span>REQUIRED</span>
                      </label>
                      <input
                        id="query"
                        placeholder={
                          settings.resource === "customers"
                            ? "email:'jane@example.com'"
                            : "metadata['order_id']:'123'"
                        }
                        value={draft.query}
                        onChange={(e) => updateDraft("query", e.target.value)}
                        spellCheck={false}
                        required
                      />
                      <p className="field-hint">
                        Use{" "}
                        <a
                          href="https://docs.stripe.com/search#search-query-language"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Stripe’s search syntax <ArrowUpRight size={10} />
                        </a>
                        . Recent changes may take a moment to appear.
                      </p>
                    </div>
                  )}
                  {(method === "list" || method === "search") && (
                    <div className="limit-row">
                      <label htmlFor="limit">
                        Results per page<span>Between 1 and 100</span>
                      </label>
                      <input
                        id="limit"
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        value={draft.limit}
                        onChange={(e) => updateDraft("limit", e.target.value)}
                        required
                      />
                    </div>
                  )}
                  {resource && method && (
                    <a
                      className="endpoint-docs"
                      href={docsUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View endpoint reference <ArrowUpRight size={12} />
                    </a>
                  )}
                </section>

                {resource && method && (
                  <ExpandOptions
                    key={draftKey}
                    values={draft.expand}
                    open={settings.expandOpen}
                    method={method}
                    onChange={(values) => updateDraft("expand", values)}
                    onToggle={() => update("expandOpen", !settings.expandOpen)}
                  />
                )}

                <div className="submit-section">
                  <div className="request-preview">
                    <span className="get-label">GET</span>
                    <code title={preview}>{preview}</code>
                  </div>
                  <button
                    type="submit"
                    className="send-button"
                    disabled={!resource || !method}
                  >
                    <span>
                      {busy ? (
                        <LoaderCircle size={17} className="spin" />
                      ) : (
                        <ArrowRight size={17} />
                      )}
                      {busy ? "Sending request…" : "Send request"}
                    </span>
                    <kbd>⌘ / Ctrl ↵</kbd>
                  </button>
                  <p className="safe-note">
                    <ShieldCheck size={12} /> Explore freely. Your Stripe data
                    stays untouched.
                  </p>
                </div>
              </fieldset>
              {busy && (
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() => controller.current?.abort()}
                >
                  Cancel request
                </button>
              )}
            </form>
            {error && (
              <div role="alert" className="form-error">
                <span>{error}</span>
                <button
                  type="button"
                  aria-label="Dismiss error"
                  onClick={() => setError("")}
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {storageWarning && (
              <div role="alert" className="storage-warning">
                {storageWarning}
              </div>
            )}
          </aside>

          <section
            ref={responseRef}
            tabIndex={-1}
            aria-label="API response"
            className={`response-panel ${settings.fullscreen ? "expanded" : ""}`}
          >
            <div className="response-heading">
              <div className="response-title">
                <Terminal size={17} />
                <h2>Response</h2>
                {busy ? (
                  <span className="response-state">
                    <LoaderCircle size={12} className="spin" /> Request in
                    progress
                  </span>
                ) : response ? (
                  <span
                    className={`response-state ${isSuccess ? "success" : "failed"}`}
                  >
                    <i />
                    {response.status}{" "}
                    {response.statusText || (isSuccess ? "OK" : "Error")}
                  </span>
                ) : (
                  <span className="response-state">
                    <i /> Awaiting request
                  </span>
                )}
              </div>
              <span className="json-badge">JSON</span>
            </div>
            <JsonViewer
              value={json}
              minimap={settings.minimap}
              wordWrap={settings.wordWrap}
              fullscreen={settings.fullscreen}
              copied={copied}
              onToggle={(key) => update(key, !settings[key])}
              onCopy={copyJson}
              onDownload={downloadJson}
            />
            {busy && (
              <div className="request-progress">
                <LoaderCircle className="spin" size={18} />
                <span>Fetching your Stripe data…</span>
              </div>
            )}
            <div className="editor-status">
              <div>
                <span className="status-dot" />
                {response ? (
                  <>
                    <span>{response.duration.toLocaleString()} ms</span>
                    <span className="status-separator">·</span>
                    <span>
                      {(new Blob([response.body]).size / 1024).toFixed(1)} KB
                    </span>
                    {objectCount !== null && (
                      <>
                        <span className="status-separator">·</span>
                        <span>{objectCount} objects</span>
                      </>
                    )}
                  </>
                ) : (
                  <span>Ready when you are</span>
                )}
              </div>
              <span>
                <LockKeyhole size={11} /> Read only{" "}
                <span className="status-separator">·</span> UTF-8
              </span>
            </div>
            {response && (
              <div className="response-details">
                <div>
                  <code title={response.path}>GET {response.path}</code>
                  {response.requestId && (
                    <span>Request ID: {response.requestId}</span>
                  )}
                  {response.apiVersion && (
                    <span>API version: {response.apiVersion}</span>
                  )}
                </div>
                {nextCursor && (
                  <button
                    type="button"
                    className="next-page"
                    disabled={!requestUnchanged || busy || !isSuccess}
                    onClick={nextPage}
                    title={
                      !requestUnchanged
                        ? "Send the changed request before loading another page"
                        : "Fetch the next page"
                    }
                  >
                    Next page <ArrowRight size={13} />
                  </button>
                )}
                {draft.cursor && method !== "retrieve" && (
                  <button
                    type="button"
                    className="first-page"
                    disabled={busy}
                    onClick={() => {
                      updateDraft("cursor", "");
                      void runRequest({ ...currentRequest, cursor: "" });
                    }}
                  >
                    <RotateCcw size={12} /> First page
                  </button>
                )}
              </div>
            )}
            <div className="sr-only" role="status" aria-live="polite">
              {busy
                ? "Sending request to Stripe."
                : response
                  ? `Response received: ${response.status}. ${objectCount !== null ? `${objectCount} objects.` : ""}`
                  : "Ready for a request."}
            </div>
          </section>
        </div>
        <WriteWorkspace
          active={settings.workspace === "writes"}
          connection={{
            apiKey: settings.apiKey,
            account: settings.account,
            apiVersion: settings.apiVersion,
          }}
          connectionPanel={
            settings.workspace === "writes" ? connectionPanel : null
          }
          onMissingKey={() => update("connectionExpanded", true)}
          onStatus={setWriteStatus}
          historyOpen={settings.historyOpen}
          onCloseHistory={() => {
            update("historyOpen", false);
            document.getElementById("write-history-toggle")?.focus();
          }}
          onRestoreConnection={(connection) =>
            setSettings((current) => ({ ...current, ...connection }))
          }
        />
      </main>
      <footer className="footer" aria-label="Workspace status">
        <div className="statusbar-group">
          <span
            className={`statusbar-label ${connection.tone}`}
            title={connection.detail}
            role="status"
          >
            {statusBusy ? (
              <LoaderCircle size={12} className="spin" />
            ) : (
              <span className="statusbar-dot" />
            )}
            {connection.label}
          </span>
          {mode && (
            <span
              className={`statusbar-label statusbar-badge ${mode === "Test mode" ? "warning" : "live"}`}
              title="Mode indicated by your current API key"
            >
              <span className="statusbar-dot" />
              {mode}
            </span>
          )}
          <span className="statusbar-divider" />
          <span className="statusbar-label muted">
            <ShieldCheck size={12} />{" "}
            {settings.workspace === "reads" ? "Read only" : "Writes enabled"}
          </span>
          {settings.account.trim() && (
            <span
              className="statusbar-label statusbar-account"
              title={`Connected account: ${settings.account.trim()}`}
            >
              <Database size={12} />
              {settings.account.trim()}
            </span>
          )}
        </div>
        <div className="statusbar-group">
          {statusResponse && (
            <span
              className={`statusbar-label ${statusSuccess ? "success" : "danger"}`}
              title={`Last response: ${statusResponse.status} ${statusResponse.statusText}`}
            >
              Last request: {statusResponse.status}
              <span className="statusbar-meta">
                {statusResponse.duration.toLocaleString()} ms
              </span>
            </span>
          )}
          <span
            className={`statusbar-label ${activeStorageWarning ? "warning" : "muted"}`}
            title={
              activeStorageWarning ||
              "Form values and preferences are saved in this browser"
            }
          >
            {activeStorageWarning ? (
              <CircleHelp size={12} />
            ) : (
              <Check size={12} />
            )}
            {activeStorageWarning
              ? "Settings not saved"
              : ready
                ? "Settings saved"
                : "Loading settings"}
          </span>
        </div>
      </footer>
      {resetOpen && (
        <ResetConfirmation
          onCancel={() => setResetOpen(false)}
          onConfirm={onReset}
        />
      )}
      {(copied || notice) && (
        <div className="toast" role="status">
          {copied && <Check size={15} />}
          {copied ? "JSON copied to clipboard" : notice}
        </div>
      )}
    </div>
  );
}
