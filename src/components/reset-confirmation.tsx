"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ResetConfirmation({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [confirmation, setConfirmation] = useState("");
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    cancel.current?.focus();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="write-confirmation live-confirmation reset-confirmation"
      aria-labelledby="reset-title"
      aria-describedby="reset-description"
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="reset-warning-label">
        <AlertTriangle size={18} /> FULL LOCAL RESET
      </div>
      <h2 id="reset-title">Start completely fresh?</h2>
      <div id="reset-description">
        <p>
          This permanently deletes your API key, connection settings, all read
          and write drafts, request bodies, responses, write history, legacy
          operation keys, and remembered UI preferences.
        </p>
        <p>
          Local storage, session storage, IndexedDB databases, and app caches at
          this address will be cleared. Other open copies of this app will be
          paused. The app then reloads with its defaults.
        </p>
        <p>
          <strong>This cannot be undone.</strong> Nothing in Stripe is deleted
          or reversed, including requests already sent.
        </p>
      </div>
      <label htmlFor="reset-confirmation">
        Type <code>RESET</code> to confirm
      </label>
      <input
        id="reset-confirmation"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <div className="confirm-actions">
        <button
          ref={cancel}
          type="button"
          className="secondary-button"
          onClick={onCancel}
        >
          Keep my data
        </button>
        <button
          type="button"
          className="reset-everything-button"
          disabled={confirmation !== "RESET"}
          onClick={onConfirm}
        >
          <RotateCcw size={16} /> Reset everything
        </button>
      </div>
    </dialog>
  );
}
