"use client";

import { useEffect, useRef } from "react";
import { ArrowUpRight, ChevronDown, ListPlus, Plus, X } from "lucide-react";
import { expansionError } from "@/lib/expansions";
import type { Method } from "@/lib/stripe";

export default function ExpandOptions({
  values,
  open,
  method,
  onChange,
  onToggle,
}: {
  values: string[];
  open: boolean;
  method: Method;
  onChange: (values: string[]) => void;
  onToggle: () => void;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const focusNext = useRef<number | null>(null);
  const rows = values.length ? values : [""];
  const count = new Set(values.map((value) => value.trim()).filter(Boolean))
    .size;

  useEffect(() => {
    if (focusNext.current !== null) {
      inputs.current[focusNext.current]?.focus();
      focusNext.current = null;
    }
  }, [values]);

  function add() {
    const empty = rows.findIndex((value) => !value.trim());
    if (empty !== -1) {
      inputs.current[empty]?.focus();
      return;
    }
    focusNext.current = rows.length;
    onChange([...rows, ""]);
  }

  function remove(index: number) {
    const next = rows.filter((_, row) => row !== index);
    focusNext.current = Math.max(0, Math.min(index, next.length - 1));
    onChange(next.length ? next : [""]);
  }

  return (
    <section className="expand-section">
      <button
        type="button"
        className="advanced-toggle expand-toggle"
        aria-expanded={open}
        aria-controls="expand-fields"
        onClick={onToggle}
      >
        <ListPlus size={16} /> Expand options
        <span className="expand-count">{count || "Optional"}</span>
        <ChevronDown size={14} className={open ? "rotated" : ""} />
      </button>
      {open && (
        <div id="expand-fields" className="expand-fields">
          <p id="expand-help" className="field-hint">
            One expansion path per row. Press Enter to add another.
            {method !== "retrieve" && (
              <>
                {" "}
                For list/search results, start with <code>data.</code>
              </>
            )}
          </p>
          <div className="expand-rows">
            {rows.map((value, index) => {
              const error = expansionError(value);
              return (
                <div key={index}>
                  <div className="expand-row">
                    <input
                      ref={(element) => {
                        inputs.current[index] = element;
                      }}
                      value={value}
                      aria-label={`Expansion path ${index + 1}`}
                      aria-invalid={Boolean(error)}
                      aria-describedby={`expand-help${error ? ` expand-error-${index}` : ""}`}
                      placeholder={
                        method === "retrieve"
                          ? "e.g. customer"
                          : "e.g. data.customer"
                      }
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) =>
                        onChange(
                          rows.map((path, row) =>
                            row === index ? event.target.value : path,
                          ),
                        )
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          !event.metaKey &&
                          !event.ctrlKey &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault();
                          event.stopPropagation();
                          if (index < rows.length - 1)
                            inputs.current[index + 1]?.focus();
                          else add();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="expand-remove"
                      aria-label={`Remove expansion ${index + 1}`}
                      title="Remove expansion"
                      onClick={() => remove(index)}
                    >
                      <X size={15} />
                    </button>
                  </div>
                  {error && (
                    <p id={`expand-error-${index}`} className="expand-error">
                      {error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" className="expand-add" onClick={add}>
            <Plus size={14} /> Add expansion
          </button>
          <p className="field-hint">
            Blank rows are ignored. Only fields marked expandable in Stripe can
            be expanded.
          </p>
          <a
            className="endpoint-docs"
            href="https://docs.stripe.com/expand"
            target="_blank"
            rel="noreferrer"
          >
            About expansions <ArrowUpRight size={12} />
          </a>
        </div>
      )}
    </section>
  );
}
