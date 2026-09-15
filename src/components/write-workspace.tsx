"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Terminal,
} from "lucide-react";
import type { StripeResponse } from "@/lib/stripe";
import {
  exampleBody,
  isDestructive,
  keyMode,
  prepareWrite,
  writeActions,
  writeEndpoint,
  writeFingerprintSource,
  writeLabels,
  writeResources,
  type ConnectionSettings,
  type WriteAction,
  type WriteInput,
} from "@/lib/stripe-writes";
import WriteConfirmation, { type PendingWrite } from "./write-confirmation";
import WriteHistory from "./write-history";
import {
  saveWriteHistory,
  finishWriteHistory,
  loadWriteHistory,
  type HistoryRecord,
} from "@/lib/write-history";
import { assertAppNotResetting, isAppResetting } from "@/lib/reset-state";

const JsonViewer = dynamic(() => import("./json-viewer"), { ssr: false });
const STORAGE_KEY = "stripe-api-viewer:writes:v1";
type Draft = { objectId: string; body: string };
type Attempt = { fingerprint: string; key: string; created: number };
type WriteSettings = {
  resource: string;
  actions: Record<string, WriteAction>;
  drafts: Record<string, Draft>;
  attempts: Record<string, Attempt>;
  split: number;
  minimap: boolean;
  wordWrap: boolean;
  fullscreen: boolean;
  selectedHistoryId: string;
  historyCollapsed: string[];
};
const defaults: WriteSettings = {
  resource: "products",
  actions: { products: "create" },
  drafts: {},
  attempts: {},
  split: 42,
  minimap: true,
  wordWrap: false,
  fullscreen: false,
  selectedHistoryId: "",
  historyCollapsed: [],
};
export type WriteStatus = {
  busy: boolean;
  response: StripeResponse | null;
  error: string;
  request: ConnectionSettings | null;
  storageWarning?: string;
};
export const emptyWriteStatus: WriteStatus = {
  busy: false,
  response: null,
  error: "",
  request: null,
};

function restore(raw: string): WriteSettings {
  const saved = JSON.parse(raw);
  const result = {
    ...defaults,
    actions: { ...defaults.actions },
    drafts: {},
    attempts: {},
  } as WriteSettings;
  if (!saved || typeof saved !== "object") return result;
  if (typeof saved.selectedHistoryId === "string")
    result.selectedHistoryId = saved.selectedHistoryId;
  if (Array.isArray(saved.historyCollapsed))
    result.historyCollapsed = saved.historyCollapsed.filter((id: unknown) =>
      writeResources.some((resource) => resource.id === id),
    );
  if (writeResources.some((r) => r.id === saved.resource))
    result.resource = saved.resource;
  for (const resource of writeResources) {
    if (writeActions(resource.id).includes(saved.actions?.[resource.id]))
      result.actions[resource.id] = saved.actions[resource.id];
    for (const action of writeActions(resource.id)) {
      const id = `${resource.id}:${action}`;
      const draft = saved.drafts?.[id];
      if (
        typeof draft?.objectId === "string" &&
        typeof draft?.body === "string"
      )
        result.drafts[id] = draft;
      const attempt = saved.attempts?.[id];
      if (
        typeof attempt?.fingerprint === "string" &&
        typeof attempt?.key === "string" &&
        typeof attempt?.created === "number"
      )
        result.attempts[id] = attempt;
    }
  }
  for (const key of ["minimap", "wordWrap", "fullscreen"] as const)
    if (typeof saved[key] === "boolean") result[key] = saved[key];
  if (typeof saved.split === "number" && Number.isFinite(saved.split))
    result.split = Math.max(20, Math.min(75, saved.split));
  return result;
}

export default function WriteWorkspace({
  active,
  connection,
  connectionPanel,
  onMissingKey,
  onStatus,
  historyOpen,
  onCloseHistory,
  onRestoreConnection,
}: {
  active: boolean;
  connection: ConnectionSettings;
  connectionPanel: ReactNode;
  onMissingKey: () => void;
  onStatus: (status: WriteStatus) => void;
  historyOpen: boolean;
  onCloseHistory: () => void;
  onRestoreConnection: (
    connection: Pick<ConnectionSettings, "account" | "apiVersion">,
  ) => void;
}) {
  const [settings, setSettings] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [status, setStatus] = useState<WriteStatus>(emptyWriteStatus);
  const [pending, setPending] = useState<PendingWrite | null>(null);
  const [copied, setCopied] = useState<"body" | "response" | null>(null);
  const [notice, setNotice] = useState("");
  const [historyWarning, setHistoryWarning] = useState("");
  const [restoringHistory, setRestoringHistory] = useState(false);
  const lock = useRef(false);
  const executing = useRef(false);
  const storageReadFailed = useRef(false);
  const operationStarted = useRef(Date.now());
  const restoring = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const editors = useRef<HTMLDivElement>(null);
  const responsePanel = useRef<HTMLElement>(null);
  const busy = status.busy;
  const resource = writeResources.find((r) => r.id === settings.resource)!;
  const action = settings.actions[resource.id] ?? writeActions(resource.id)[0];
  const draftKey = `${resource.id}:${action}`;
  const draft = settings.drafts[draftKey] ?? {
    objectId: "",
    body: "",
  };
  const attempt = settings.attempts[draftKey];
  let mode: "test" | "live" | null = null;
  try {
    mode = keyMode(connection.apiKey);
  } catch {
    /* Invalid keys never enable writes. */
  }
  let path = `/v1/${resource.id}${action !== "create" ? "/{id}" : ""}`;
  let httpMethod =
    action === "delete" ||
    (action === "cancel" && resource.id === "subscriptions")
      ? "DELETE"
      : "POST";
  try {
    const endpoint = writeEndpoint(resource.id, action, draft.objectId);
    path = endpoint.path;
    httpMethod = endpoint.method;
  } catch {
    /* The ID is checked on submission. */
  }
  const label = `${writeLabels[action]} ${mode === "live" ? "live " : ""}${resource.singular.toLowerCase()}`;
  const response = status.response;
  let responseJson = response?.body || "";
  try {
    if (responseJson)
      responseJson = JSON.stringify(JSON.parse(responseJson), null, 2);
  } catch {
    /* Keep non-JSON errors readable. */
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setSettings(restore(saved));
    } catch {
      storageReadFailed.current = true;
      setStorageError(
        "Saved write settings could not be read. Check browser storage before continuing.",
      );
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready || storageReadFailed.current || isAppResetting()) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setStorageError("");
    } catch {
      setStorageError(
        "Write settings cannot be saved. Writes are paused to preserve operation keys.",
      );
    }
  }, [settings, ready]);
  useEffect(() => {
    onStatus({
      ...status,
      busy: status.busy || restoringHistory,
      storageWarning: storageError,
    });
  }, [status, storageError, restoringHistory, onStatus]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!active) return;
      if (
        event.target instanceof Element &&
        event.target.closest("#write-history")
      )
        return;
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (!pending && !lock.current && !restoring.current)
          form.current?.requestSubmit();
      }
      if (event.key === "Escape" && !pending)
        setSettings((s) => ({ ...s, fullscreen: false }));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, pending]);
  useEffect(() => {
    if (settings.fullscreen && active) responsePanel.current?.focus();
  }, [settings.fullscreen, active]);
  useEffect(() => {
    if (!copied && !notice) return;
    const timer = setTimeout(() => {
      setCopied(null);
      setNotice("");
    }, 3500);
    return () => clearTimeout(timer);
  }, [copied, notice]);

  function updateDraft(key: keyof Draft, value: string) {
    setSettings((s) => ({
      ...s,
      selectedHistoryId: "",
      drafts: { ...s.drafts, [draftKey]: { ...draft, [key]: value } },
    }));
  }
  async function execute(
    input: WriteInput,
    token?: string,
    acknowledgement = "",
  ) {
    if (executing.current) return;
    executing.current = true;
    setPending(null);
    setStatus({ busy: true, response: null, error: "", request: input });
    setHistoryWarning("");
    let history: HistoryRecord | undefined;
    let failureStatus: number | undefined;
    try {
      // Save the attempt before dispatch. Cancelled dialogs never reach here.
      history = await saveWriteHistory(input, operationStarted.current);
      assertAppNotResetting();
      setSettings((current) => ({
        ...current,
        selectedHistoryId: history!.id,
      }));
      const result = await fetch("/api/stripe/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          ...input,
          phase: "execute",
          approvalToken: token,
          acknowledgement,
          confirmed: Boolean(token),
        }),
      });
      if (!result.ok) failureStatus = result.status;
      const payload = await result.json();
      if (!result.ok)
        throw new Error(payload.error || "The write could not be completed.");
      setStatus({ busy: false, response: payload, error: "", request: input });
      await finishWriteHistory(history.id, {
        outcome:
          payload.status >= 200 && payload.status < 300 ? "success" : "error",
        status: payload.status,
        requestId: payload.requestId,
      }).catch(() =>
        setHistoryWarning(
          "The write finished, but its history result could not be updated. The saved request is still available.",
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Request failed.";
      setStatus({
        busy: false,
        response: null,
        error: history
          ? `${message} No automatic retry was made.`
          : `Request not sent: write history could not be saved. ${message}`,
        request: input,
      });
      if (history)
        await finishWriteHistory(history.id, {
          outcome: failureStatus && failureStatus < 500 ? "error" : "unknown",
          status: failureStatus,
          error: message,
        }).catch(() =>
          setHistoryWarning(
            "The request is saved, but its result could not be recorded. Check Stripe before retrying.",
          ),
        );
    } finally {
      lock.current = false;
      executing.current = false;
    }
  }

  async function submit() {
    if (
      !ready ||
      !active ||
      lock.current ||
      pending ||
      storageError ||
      restoring.current
    )
      return;
    lock.current = true;
    setStatus((s) => ({ ...s, busy: true, error: "" }));
    try {
      if (!connection.apiKey.trim()) {
        onMissingKey();
        throw new Error("Add your Stripe API key in Connection first.");
      }
      const base = {
        ...connection,
        resource: resource.id,
        action,
        objectId: draft.objectId,
        body: draft.body,
      };
      // Validate before generating or changing the saved operation key.
      prepareWrite({ ...base, idempotencyKey: "preview_operation_key" });
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(writeFingerprintSource(base)),
      );
      const fingerprint = Array.from(new Uint8Array(hash), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const previous = settings.attempts[draftKey];
      if (
        previous?.fingerprint === fingerprint &&
        Date.now() - previous.created > 23 * 60 * 60_000
      )
        throw new Error(
          "This operation key is over 23 hours old. Check Stripe for the previous result, then choose New operation if you intend another write.",
        );
      const nextAttempt =
        previous?.fingerprint === fingerprint
          ? previous
          : { fingerprint, key: crypto.randomUUID(), created: Date.now() };
      const input: WriteInput = { ...base, idempotencyKey: nextAttempt.key };
      operationStarted.current = nextAttempt.created;
      const prepared = prepareWrite(input);
      const nextSettings = {
        ...settings,
        attempts: { ...settings.attempts, [draftKey]: nextAttempt },
      };
      // Persist before touching Stripe, including when a page is refreshed mid-request.
      assertAppNotResetting();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSettings));
      setSettings(nextSettings);
      if (!prepared.needsConfirmation) {
        await execute(input);
        return;
      }
      setStatus((s) => ({ ...s, busy: true }));
      const result = await fetch("/api/stripe/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ ...input, phase: "prepare" }),
      });
      const payload = await result.json();
      if (!result.ok)
        throw new Error(payload.error || "Could not prepare the confirmation.");
      setPending({ input, token: payload.approvalToken });
      setStatus((s) => ({ ...s, busy: false }));
      // Keep the lock until the dialog is either confirmed or dismissed.
    } catch (error) {
      lock.current = false;
      setStatus((s) => ({
        ...s,
        busy: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not prepare the write.",
      }));
    }
  }
  async function copy(value: string, target: "body" | "response") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(target);
    } catch {
      setNotice("Clipboard unavailable. Use Download instead.");
    }
  }
  function download(value: string, target: string) {
    const url = URL.createObjectURL(
      new Blob([value], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `stripe-${resource.id.replaceAll("/", "-")}-${target}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function toggle(key: "minimap" | "wordWrap" | "fullscreen") {
    setSettings((s) => ({ ...s, [key]: !s[key] }));
  }
  function split(value: number) {
    setSettings((s) => ({ ...s, split: Math.max(20, Math.min(75, value)) }));
  }

  async function restoreHistory(id: string) {
    if (lock.current || pending || restoring.current) return;
    restoring.current = true;
    setRestoringHistory(true);
    try {
      const { record, request } = await loadWriteHistory(id);
      if (!writeActions(record.resource).includes(record.action))
        throw new Error("This saved write action is no longer supported.");
      const key = `${record.resource}:${record.action}`;
      setSettings((current) => ({
        ...current,
        resource: record.resource,
        actions: { ...current.actions, [record.resource]: record.action },
        drafts: {
          ...current.drafts,
          [key]: { objectId: record.objectId, body: request.body },
        },
        attempts: { ...current.attempts, [key]: request.operation },
        selectedHistoryId: id,
        fullscreen: false,
      }));
      onRestoreConnection({
        account: request.account,
        apiVersion: request.apiVersion,
      });
      setStatus(emptyWriteStatus);
      setNotice(
        `Loaded “${record.name}”. Nothing sent.${mode !== record.mode ? ` Originally ${record.mode} mode; your current API key is unchanged.` : ""}`,
      );
    } catch (error) {
      setHistoryWarning(
        error instanceof Error ? error.message : "Could not load this request.",
      );
    } finally {
      restoring.current = false;
      setRestoringHistory(false);
    }
  }

  return (
    <div
      className={`workspace write-workspace ${historyOpen ? "history-open" : ""}`}
      id="writes-panel"
      role="tabpanel"
      aria-labelledby="writes-tab"
      hidden={!active}
    >
      <aside className="request-panel">
        <div className="panel-heading">
          <Pencil size={17} />
          <h2>Write builder</h2>
          <span className="write-badge">WRITES</span>
        </div>
        <form
          ref={form}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <fieldset
            disabled={!ready || busy || Boolean(pending) || restoringHistory}
          >
            {connectionPanel}
            <section className="form-section endpoint-section">
              <div className="section-label">
                <span>02</span> WRITE ACTION
              </div>
              <label htmlFor="write-resource">Resource</label>
              <div className="select-wrap">
                <select
                  id="write-resource"
                  value={resource.id}
                  onChange={(event) =>
                    setSettings((s) => ({
                      ...s,
                      selectedHistoryId: "",
                      resource: event.target.value,
                    }))
                  }
                >
                  {writeResources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </div>
              <label htmlFor="write-action">Action</label>
              <div className="select-wrap">
                <select
                  id="write-action"
                  value={action}
                  onChange={(event) =>
                    setSettings((s) => ({
                      ...s,
                      selectedHistoryId: "",
                      actions: {
                        ...s.actions,
                        [resource.id]: event.target.value as WriteAction,
                      },
                    }))
                  }
                >
                  {writeActions(resource.id).map((a) => (
                    <option key={a} value={a}>
                      {writeLabels[a]}
                      {a === "delete" && resource.id === "invoices"
                        ? " draft"
                        : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </div>
              {action !== "create" && (
                <>
                  <label htmlFor="write-id">
                    {resource.singular} ID <span>REQUIRED</span>
                  </label>
                  <input
                    id="write-id"
                    value={draft.objectId}
                    onChange={(event) =>
                      updateDraft("objectId", event.target.value)
                    }
                    placeholder={`Enter the ${resource.singular} ID`}
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                </>
              )}
              <a
                className="endpoint-docs"
                href={`https://docs.stripe.com/api/${resource.id}/${action}`}
                target="_blank"
                rel="noreferrer"
              >
                View endpoint reference <ArrowUpRight size={12} />
              </a>
              {resource.id === "products" && action === "create" && (
                <p className="field-hint">
                  A name is enough. Leave out default_price_data to create a
                  product with no price.
                </p>
              )}
            </section>
            <div className="submit-section">
              <div className="request-preview">
                <span className={`http-method ${httpMethod.toLowerCase()}`}>
                  {httpMethod}
                </span>
                <code title={path}>{path}</code>
              </div>
              <button
                type="submit"
                className={`send-button write-send ${mode === "live" || isDestructive(action) ? "danger-send" : ""}`}
                disabled={Boolean(storageError)}
              >
                <span>
                  {busy ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <ArrowRight size={16} />
                  )}
                  {busy ? "Working…" : label}
                </span>
              </button>
              <p className="field-hint">
                {mode === "live"
                  ? "Live writes always require review and typed confirmation."
                  : isDestructive(action)
                    ? "You’ll confirm this destructive action before it runs."
                    : "Test creates and updates run immediately."}
              </p>
            </div>
            <section className="operation-section">
              <div className="operation-heading">
                <span>Operation key</span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setSettings((s) => {
                      const attempts = { ...s.attempts };
                      delete attempts[draftKey];
                      return { ...s, attempts, selectedHistoryId: "" };
                    });
                    setNotice(
                      "New operation ready. The next send can create another object.",
                    );
                  }}
                >
                  <RotateCcw size={12} /> New operation
                </button>
              </div>
              <code>{attempt?.key || "Generated when you send"}</code>
              <p className="field-hint">
                Unchanged POST requests reuse this key. Choose New operation
                only when you intend another write. DELETE requests are not
                deduplicated by Stripe.
              </p>
            </section>
          </fieldset>
        </form>
        {status.error && (
          <div className="form-error" role="alert">
            {status.error}
          </div>
        )}
        {storageError && (
          <div className="storage-warning" role="alert">
            {storageError}
          </div>
        )}
        {historyWarning && (
          <div className="storage-warning" role="alert">
            {historyWarning}
            <button
              type="button"
              className="text-button"
              onClick={() => setHistoryWarning("")}
            >
              Dismiss
            </button>
          </div>
        )}
      </aside>
      <div className="write-main">
        <div
          className={`write-mode-banner ${mode === "live" ? "is-live" : ""}`}
        >
          <AlertTriangle size={15} />
          <span>
            {mode === "live"
              ? "LIVE MODE — These requests change real Stripe data."
              : mode === "test"
                ? "TEST MODE — Creates and updates run immediately. Deletes and cancellations require confirmation."
                : "Add a valid test or live key before making writes."}
          </span>
        </div>
        <div
          ref={editors}
          className="write-editors"
          style={{
            gridTemplateRows: `minmax(0, ${settings.split}fr) 8px minmax(0, ${100 - settings.split}fr)`,
          }}
        >
          <section
            className="write-request-panel"
            aria-label="Write request body"
          >
            <div className="response-heading">
              <div className="response-title">
                <Pencil size={16} />
                <h2>Request body</h2>
              </div>
              {!draft.body && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy || Boolean(pending) || restoringHistory}
                  onClick={() =>
                    updateDraft("body", exampleBody(resource.id, action))
                  }
                >
                  Load example
                </button>
              )}
              <span className="json-badge">
                {busy || pending ? "LOCKED" : "EDITABLE JSON"}
              </span>
            </div>
            <JsonViewer
              editable
              locked={busy || Boolean(pending) || restoringHistory}
              value={draft.body}
              onChange={(value) => updateDraft("body", value)}
              minimap={settings.minimap}
              wordWrap={settings.wordWrap}
              fullscreen={false}
              copied={copied === "body"}
              onToggle={toggle}
              onCopy={() => void copy(draft.body, "body")}
              onDownload={() => download(draft.body, "request")}
            />
          </section>
          <div
            className="editor-splitter"
            role="separator"
            tabIndex={0}
            aria-label="Resize request and response panes"
            aria-orientation="horizontal"
            aria-valuemin={20}
            aria-valuemax={75}
            aria-valuenow={Math.round(settings.split)}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                split(settings.split + (event.key === "ArrowUp" ? -5 : 5));
              }
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId))
                return;
              const bounds = editors.current!.getBoundingClientRect();
              split(((event.clientY - bounds.top) / bounds.height) * 100);
            }}
            onPointerUp={(event) => {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
          />
          <section
            ref={responsePanel}
            tabIndex={-1}
            className={`response-panel ${settings.fullscreen ? "expanded" : ""}`}
            aria-label="Write response"
          >
            <div className="response-heading">
              <div className="response-title">
                <Terminal size={16} />
                <h2>Response</h2>
                <span
                  className={`response-state ${response ? (response.status < 300 ? "success" : "failed") : ""}`}
                >
                  {busy
                    ? "Request in progress"
                    : response
                      ? `${response.status} ${response.statusText}`
                      : "Awaiting write"}
                </span>
              </div>
              <span className="json-badge">READ ONLY</span>
            </div>
            <JsonViewer
              value={responseJson}
              minimap={settings.minimap}
              wordWrap={settings.wordWrap}
              fullscreen={settings.fullscreen}
              copied={copied === "response"}
              onToggle={toggle}
              onCopy={() => void copy(responseJson, "response")}
              onDownload={() => download(responseJson, "response")}
            />
            <div className="editor-status">
              <span>
                {response
                  ? `${response.duration} ms · ${(new Blob([response.body]).size / 1024).toFixed(1)} KB`
                  : "No writes run automatically"}
              </span>
              <span>Read-only response · UTF-8</span>
            </div>
            {response && (
              <div className="response-details">
                <div>
                  <code>{response.path}</code>
                  {response.requestId && (
                    <span>Request ID: {response.requestId}</span>
                  )}
                  {response.apiVersion && (
                    <span>API version: {response.apiVersion}</span>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
      <WriteHistory
        open={historyOpen}
        active={active}
        selectedId={settings.selectedHistoryId}
        collapsed={settings.historyCollapsed}
        disabled={busy || Boolean(pending) || restoringHistory}
        onClose={onCloseHistory}
        onSelect={(id) => void restoreHistory(id)}
        onDeleted={(id) => {
          setSettings((current) => ({
            ...current,
            selectedHistoryId:
              id === null || current.selectedHistoryId === id
                ? ""
                : current.selectedHistoryId,
          }));
          setNotice(
            id === null
              ? "All saved write history deleted."
              : "Saved request deleted.",
          );
        }}
        onToggleGroup={(resource) =>
          setSettings((current) => ({
            ...current,
            historyCollapsed: current.historyCollapsed.includes(resource)
              ? current.historyCollapsed.filter((id) => id !== resource)
              : [...current.historyCollapsed, resource],
          }))
        }
      />
      {pending && (
        <WriteConfirmation
          pending={pending}
          onCancel={() => {
            setPending(null);
            lock.current = false;
          }}
          onConfirm={(acknowledgement) => {
            if (!lock.current) return;
            const snapshot = pending;
            setPending(null);
            void execute(snapshot.input, snapshot.token, acknowledgement);
          }}
        />
      )}
      {(notice || copied) && (
        <div className="toast" role="status">
          {copied ? "JSON copied to clipboard" : notice}
        </div>
      )}
    </div>
  );
}
