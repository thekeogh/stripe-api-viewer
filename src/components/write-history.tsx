"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  History,
  LoaderCircle,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import {
  HISTORY_CHANGED,
  clearWriteHistory,
  deleteWriteHistory,
  historyCounts,
  historyPage,
  renameWriteHistory,
  type HistoryRecord,
} from "@/lib/write-history";
import { writeLabels, writeResources } from "@/lib/stripe-writes";

export default function WriteHistory({
  open,
  active,
  selectedId,
  collapsed,
  disabled,
  onClose,
  onToggleGroup,
  onSelect,
  onDeleted,
}: {
  open: boolean;
  active: boolean;
  selectedId: string;
  collapsed: string[];
  disabled: boolean;
  onClose: () => void;
  onToggleGroup: (resource: string) => void;
  onSelect: (id: string) => void;
  onDeleted: (id: string | null) => void;
}) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [records, setRecords] = useState<Record<string, HistoryRecord[]>>({});
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<
    HistoryRecord | "all" | null
  >(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(HISTORY_CHANGED, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(HISTORY_CHANGED, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    if (!active || !open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const counts = await historyCounts();
        const entries = await Promise.all(
          writeResources
            .filter(
              (resource) =>
                counts[resource.id] && !collapsed.includes(resource.id),
            )
            .map(
              async (resource) =>
                [
                  resource.id,
                  await historyPage(resource.id, limits[resource.id] ?? 20),
                ] as const,
            ),
        );
        if (!cancelled) {
          setCounts(counts);
          setRecords(Object.fromEntries(entries));
        }
      } catch (error) {
        if (!cancelled)
          setError(
            error instanceof Error
              ? error.message
              : "History could not be loaded.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, open, revision, limits, collapsed]);

  async function rename() {
    if (!editing || saving) return;
    setSaving(true);
    try {
      await renameWriteHistory(editing, name);
      setEditing(null);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not rename this request.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside
      id="write-history"
      className="history-container"
      aria-label="Write request history"
      aria-hidden={!open || !active}
      inert={!open || !active}
    >
      <div className="history-rail">
        <div className="history-heading">
          <History size={17} />
          <h2>Write history</h2>
          <span className="history-total">{total}</span>
          <button
            ref={closeButton}
            type="button"
            className="history-icon"
            onClick={onClose}
            aria-label="Close write history"
          >
            <X size={17} />
          </button>
        </div>
        <p className="history-intro">
          Your requests, ready to revisit.
          <br />
          Select one to load it. Nothing is sent.
        </p>
        <div className="history-tools">
          <button
            type="button"
            className="history-delete-all"
            disabled={disabled || saving || loading || !total}
            onClick={() => setPendingDelete("all")}
          >
            <Trash2 size={13} /> Delete all
          </button>
        </div>
        <div className="history-scroll" aria-busy={loading}>
          {error && (
            <div className="history-error" role="alert">
              {error}
              <button
                type="button"
                onClick={() => setRevision((value) => value + 1)}
              >
                Try again
              </button>
            </div>
          )}
          {!total && !error && (
            <div className="history-empty">
              {loading ? (
                <>
                  <LoaderCircle size={22} className="spin" />
                  <span>Loading history…</span>
                </>
              ) : (
                <>
                  <History size={30} />
                  <h3>A useful trail of requests.</h3>
                  <p>
                    Send your first write and it will appear here, grouped by
                    resource.
                  </p>
                </>
              )}
            </div>
          )}
          {writeResources
            .filter((resource) => counts[resource.id])
            .map((resource) => {
              const expanded = !collapsed.includes(resource.id);
              const groupId = `history-group-${resource.id.replaceAll("/", "-")}`;
              return (
                <section key={resource.id} className="history-group">
                  <button
                    type="button"
                    className="history-group-toggle"
                    aria-expanded={expanded}
                    aria-controls={groupId}
                    onClick={() => onToggleGroup(resource.id)}
                  >
                    <ChevronDown
                      size={14}
                      className={expanded ? "" : "history-group-closed"}
                    />
                    <span>{resource.label}</span>
                    <span className="history-group-count">
                      {counts[resource.id]}
                    </span>
                  </button>
                  {expanded && (
                    <div id={groupId} className="history-records">
                      {(records[resource.id] ?? []).map((record) => (
                        <article
                          key={record.id}
                          className={`history-card ${selectedId === record.id ? "selected" : ""}`}
                        >
                          {editing === record.id ? (
                            <form
                              className="history-rename"
                              onSubmit={(event) => {
                                event.preventDefault();
                                void rename();
                              }}
                              onKeyDown={(event) => {
                                event.stopPropagation();
                                if (event.key === "Escape" && !saving)
                                  setEditing(null);
                              }}
                            >
                              <label htmlFor={`rename-${record.id}`}>
                                Request name
                              </label>
                              <input
                                id={`rename-${record.id}`}
                                value={name}
                                onChange={(event) =>
                                  setName(event.target.value)
                                }
                                maxLength={160}
                                required
                                autoFocus
                                disabled={saving}
                              />
                              <div>
                                <button
                                  type="button"
                                  onClick={() => setEditing(null)}
                                  disabled={saving}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  disabled={saving || !name.trim()}
                                >
                                  <Check size={13} />
                                  {saving ? "Saving…" : "Save"}
                                </button>
                              </div>
                            </form>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="history-load"
                                disabled={disabled}
                                aria-pressed={selectedId === record.id}
                                onClick={() => onSelect(record.id)}
                                title={`Load ${record.name}`}
                              >
                                <span className="history-record-name">
                                  {record.name}
                                </span>
                                <span className="history-record-meta">
                                  <span
                                    className={`history-action ${record.action}`}
                                  >
                                    {writeLabels[record.action]}
                                  </span>
                                  <span
                                    className={`history-mode ${record.mode}`}
                                  >
                                    {record.mode}
                                  </span>
                                  <span
                                    className={`history-outcome ${record.outcome}`}
                                    title={
                                      record.error ||
                                      (record.outcome === "pending"
                                        ? "No final result recorded. Check Stripe before retrying."
                                        : record.requestId || "")
                                    }
                                  >
                                    {record.status ??
                                      (record.outcome === "pending" ||
                                      record.outcome === "unknown"
                                        ? "Unverified"
                                        : "Failed")}
                                  </span>
                                </span>
                                <time
                                  dateTime={new Date(
                                    record.createdAt,
                                  ).toISOString()}
                                  title={new Date(
                                    record.createdAt,
                                  ).toLocaleString()}
                                >
                                  {new Date(record.createdAt).toLocaleString(
                                    undefined,
                                    {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      second: "2-digit",
                                    },
                                  )}
                                </time>
                              </button>
                              <div className="history-record-actions">
                                <button
                                  type="button"
                                  className="history-icon"
                                  title="Rename request"
                                  aria-label={`Rename ${record.name}`}
                                  disabled={disabled || saving}
                                  onClick={() => {
                                    setEditing(record.id);
                                    setName(record.name);
                                  }}
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="history-icon history-delete-button"
                                  title="Delete saved request"
                                  aria-label={`Delete saved request: ${record.name}`}
                                  disabled={disabled || saving}
                                  onClick={() => setPendingDelete(record)}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </>
                          )}
                        </article>
                      ))}
                      {(records[resource.id]?.length ?? 0) <
                        counts[resource.id] && (
                        <button
                          type="button"
                          className="history-load-more"
                          disabled={loading}
                          onClick={() =>
                            setLimits((current) => ({
                              ...current,
                              [resource.id]: (current[resource.id] ?? 20) + 20,
                            }))
                          }
                        >
                          {loading ? "Loading…" : "Load older requests"}
                        </button>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
        </div>
        <div className="history-footnote">
          Saved on this device · API keys are not copied
        </div>
      </div>
      {pendingDelete && (
        <HistoryDeleteConfirmation
          target={pendingDelete}
          disabled={disabled}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            const id = pendingDelete === "all" ? null : pendingDelete.id;
            if (id === null) await clearWriteHistory();
            else await deleteWriteHistory(id);
            if (id === null || editing === id) setEditing(null);
            if (id === null) setLimits({});
            onDeleted(id);
            setPendingDelete(null);
            requestAnimationFrame(() => closeButton.current?.focus());
          }}
        />
      )}
    </aside>
  );
}

function HistoryDeleteConfirmation({
  target,
  disabled,
  onCancel,
  onConfirm,
}: {
  target: HistoryRecord | "all";
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const lock = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    cancel.current?.focus();
    return () => element.close();
  }, []);

  async function confirm() {
    if (lock.current || disabled) return;
    lock.current = true;
    setDeleting(true);
    setError("");
    try {
      await onConfirm();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "History could not be deleted.",
      );
      lock.current = false;
      setDeleting(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="write-confirmation history-delete-confirmation"
      aria-labelledby="history-delete-title"
      aria-describedby="history-delete-description"
      aria-busy={deleting}
      onCancel={(event) => {
        event.preventDefault();
        if (!lock.current) onCancel();
      }}
    >
      <div className="history-delete-label">
        <Trash2 size={16} /> SAVED HISTORY ONLY
      </div>
      <h2 id="history-delete-title">
        {target === "all"
          ? "Delete all write history?"
          : "Delete saved request?"}
      </h2>
      <p id="history-delete-description">
        {target === "all"
          ? "All saved requests and their bodies will be permanently removed from this browser, including entries in collapsed groups and older pages."
          : "This saved request and its body will be permanently removed from this browser."}{" "}
        This cannot be undone. Nothing in Stripe will be changed. Your current
        form and connection settings will stay as they are.
      </p>
      {target !== "all" && (
        <div className="history-delete-name">{target.name}</div>
      )}
      {error && (
        <div className="history-error" role="alert">
          {error}
        </div>
      )}
      <div className="confirm-actions">
        <button
          ref={cancel}
          type="button"
          className="secondary-button"
          disabled={deleting}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="danger-button"
          disabled={deleting || disabled}
          onClick={() => void confirm()}
        >
          {deleting
            ? "Deleting…"
            : target === "all"
              ? "Delete all history"
              : "Delete saved request"}
        </button>
      </div>
    </dialog>
  );
}
