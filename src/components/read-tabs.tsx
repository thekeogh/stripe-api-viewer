"use client";

import { useEffect, useRef } from "react";
import { FileJson, LoaderCircle, Plus, X } from "lucide-react";
import { readTabLabel, type ReadTab } from "@/lib/read-tabs";

export default function ReadTabs({
  tabs,
  activeId,
  disabled,
  onSelect,
  onAdd,
  onClose,
}: {
  tabs: ReadTab[];
  activeId: string;
  disabled: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onClose: (id: string) => void;
}) {
  const selected = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    selected.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);
  return (
    <div className="read-tabs-bar">
      <div
        className="read-tabs"
        role="tablist"
        aria-label="Saved read requests"
      >
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            className={`read-tab ${tab.id === activeId ? "active" : ""}`}
          >
            <button
              ref={tab.id === activeId ? selected : undefined}
              type="button"
              role="tab"
              id={`read-tab-${tab.id}`}
              aria-controls="read-response-panel"
              aria-selected={tab.id === activeId}
              tabIndex={tab.id === activeId ? 0 : -1}
              className="read-tab-select"
              title={readTabLabel(tab)}
              disabled={disabled}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => {
                let next = index;
                if (event.key === "ArrowRight")
                  next = (index + 1) % tabs.length;
                else if (event.key === "ArrowLeft")
                  next = (index - 1 + tabs.length) % tabs.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = tabs.length - 1;
                else if (event.key === "Delete") {
                  event.preventDefault();
                  onClose(tab.id);
                  return;
                } else return;
                event.preventDefault();
                onSelect(tabs[next].id);
                document.getElementById(`read-tab-${tabs[next].id}`)?.focus();
              }}
            >
              {tab.busy ? (
                <LoaderCircle size={13} className="spin" />
              ) : (
                <FileJson size={13} />
              )}
              <span>{readTabLabel(tab)}</span>
              {tab.response && (
                <i
                  className={tab.response.status < 300 ? "success" : "error"}
                />
              )}
            </button>
            <button
              type="button"
              className="read-tab-close"
              disabled={disabled}
              title="Close tab and delete its saved request and response"
              aria-label={`Close ${readTabLabel(tab)} and delete saved tab`}
              onClick={() => onClose(tab.id)}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="read-tab-add"
        disabled={disabled}
        onClick={onAdd}
        title="New blank read tab"
        aria-label="Add read tab"
      >
        <Plus size={18} />
      </button>
    </div>
  );
}
