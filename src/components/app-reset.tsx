"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, RotateCcw } from "lucide-react";
import StripeViewer from "./stripe-viewer";
import { RESET_KEY, resetAppStorage } from "@/lib/reset-app";
import { closeWriteHistoryForReset } from "@/lib/write-history";
import { closeReadTabsForReset } from "@/lib/read-tabs";

export default function AppReset() {
  const [phase, setPhase] = useState<
    "ready" | "resetting" | "paused" | "error"
  >("ready");
  const [message, setMessage] = useState("");
  const stopped = useRef(false);
  const running = useRef(false);

  useEffect(() => {
    function pause() {
      stopped.current = true;
      void closeWriteHistoryForReset();
      void closeReadTabsForReset();
      setPhase("paused");
      setMessage(
        "A reset was started in another tab or interrupted. Close other copies of this app before finishing the reset here.",
      );
    }
    const listener = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      if (event.key === RESET_KEY && event.newValue) pause();
      if (event.key === null && stopped.current) {
        sessionStorage.clear();
        window.location.replace("/");
      }
    };
    try {
      if (localStorage.getItem(RESET_KEY)) pause();
    } catch {
      /* Reset reports storage failures explicitly. */
    }
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);

  useEffect(() => {
    if (phase !== "resetting" || running.current) return;
    running.current = true;
    stopped.current = true;
    void resetAppStorage(() =>
      setMessage(
        "Close other tabs or windows using this app. Waiting for their database connections to close…",
      ),
    )
      .then(() => window.location.replace("/"))
      .catch((error) => {
        running.current = false;
        setPhase("error");
        setMessage(
          `Reset did not finish. Some data may already have been removed. ${error instanceof Error ? error.message : "Browser storage is unavailable."}`,
        );
      });
  }, [phase]);

  if (phase === "ready")
    return <StripeViewer onReset={() => setPhase("resetting")} />;
  return (
    <main className="reset-screen">
      <section role={phase === "error" ? "alert" : "status"}>
        {phase === "resetting" ? (
          <LoaderCircle size={32} className="spin" />
        ) : (
          <RotateCcw size={32} />
        )}
        <h1>
          {phase === "resetting"
            ? "Resetting everything…"
            : phase === "error"
              ? "Reset needs attention"
              : "Workspace paused"}
        </h1>
        <p>
          {message ||
            "Removing saved data from this browser. The app will reload when finished."}
        </p>
        {phase !== "resetting" && (
          <button
            type="button"
            className="reset-everything-button"
            onClick={() => {
              setMessage("");
              setPhase("resetting");
            }}
          >
            {phase === "error" ? "Retry reset" : "Finish reset"}
          </button>
        )}
      </section>
    </main>
  );
}
