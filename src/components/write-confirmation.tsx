"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import {
  prepareWrite,
  writeLabels,
  type WriteInput,
} from "@/lib/stripe-writes";
import { resources } from "@/lib/stripe";

export type PendingWrite = { input: WriteInput; token: string };

export default function WriteConfirmation({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: PendingWrite;
  onCancel: () => void;
  onConfirm: (acknowledgement: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [acknowledgement, setAcknowledgement] = useState("");
  const [understood, setUnderstood] = useState(false);
  const prepared = prepareWrite(pending.input);
  const resource = resources.find((r) => r.id === pending.input.resource)!;
  const label = `${writeLabels[pending.input.action]} ${prepared.mode === "live" ? "live " : ""}${resource.singular.toLowerCase()}`;

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    cancel.current?.focus();
    return () => element.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className={`write-confirmation ${prepared.mode === "live" ? "live-confirmation" : ""}`}
      aria-labelledby="write-confirm-title"
      aria-describedby="write-confirm-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="confirm-header">
        <span className="confirm-mode">
          <AlertTriangle size={16} />
          {prepared.mode === "live"
            ? "LIVE MODE · REAL DATA"
            : "TEST MODE · DESTRUCTIVE ACTION"}
        </span>
        <button
          type="button"
          className="confirm-close"
          aria-label="Cancel write"
          onClick={onCancel}
        >
          <X size={18} />
        </button>
      </div>
      <h2 id="write-confirm-title">{label}?</h2>
      <p id="write-confirm-description">
        {prepared.mode === "live"
          ? "This changes your live Stripe account and may affect customers or move real money. Review the exact request before continuing."
          : "This will delete or cancel the selected test object. This action may be irreversible."}
      </p>
      <dl className="confirm-summary">
        <dt>Endpoint</dt>
        <dd>
          <code>
            {prepared.method} {prepared.path}
          </code>
        </dd>
        <dt>Target</dt>
        <dd>
          {pending.input.action === "create"
            ? `New ${resource.singular.toLowerCase()}`
            : pending.input.objectId.trim()}
        </dd>
        <dt>Account</dt>
        <dd>
          {pending.input.account.trim() || "Account belonging to the API key"}
        </dd>
        <dt>API key</dt>
        <dd>
          ••••{pending.input.apiKey.trim().slice(-4)} ({prepared.mode})
        </dd>
        <dt>API version</dt>
        <dd>{pending.input.apiVersion.trim() || "Account default"}</dd>
      </dl>
      <div className="confirm-body-label">Exact request body</div>
      <pre className="confirm-body">{prepared.body}</pre>
      {prepared.requiredText && (
        <>
          <label htmlFor="write-acknowledgement">
            Type <code>{prepared.requiredText}</code> to confirm
          </label>
          <input
            id="write-acknowledgement"
            value={acknowledgement}
            onChange={(event) => setAcknowledgement(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </>
      )}
      <label className="confirm-checkbox">
        <input
          type="checkbox"
          checked={understood}
          onChange={(event) => setUnderstood(event.target.checked)}
        />
        I have reviewed this request and want to {label.toLowerCase()}.
      </label>
      <div className="confirm-actions">
        <button
          ref={cancel}
          type="button"
          className="secondary-button"
          onClick={onCancel}
        >
          Go back
        </button>
        <button
          type="button"
          className="danger-button"
          disabled={!understood || acknowledgement !== prepared.requiredText}
          onClick={() => onConfirm(acknowledgement)}
        >
          {label}
        </button>
      </div>
    </dialog>
  );
}
