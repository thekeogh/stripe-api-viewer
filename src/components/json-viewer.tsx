"use client";

import { useRef, useState } from "react";
import { convertToJson } from "@/lib/convert-json";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import {
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  Search,
  WrapText,
  Map,
  WandSparkles,
} from "lucide-react";

loader.config({ paths: { vs: "/monaco" } });

type Props = {
  value: string;
  minimap: boolean;
  wordWrap: boolean;
  fullscreen: boolean;
  copied: boolean;
  editable?: boolean;
  locked?: boolean;
  onChange?: (value: string) => void;
  onNotice?: (message: string) => void;
  onToggle: (key: "minimap" | "wordWrap" | "fullscreen") => void;
  onCopy: () => void;
  onDownload: () => void;
};

export default function JsonViewer(props: Props) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [conversionError, setConversionError] = useState<{
    source: string;
    message: string;
  } | null>(null);
  const onMount: OnMount = (instance, monaco) => {
    editorRef.current = instance;
    setEditorReady(true);
    monaco.editor.defineTheme("stripe-night", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "string.key.json", foreground: "B7A5FF" },
        { token: "string.value.json", foreground: "A5D6B4" },
        { token: "number", foreground: "F1BD84" },
        { token: "keyword", foreground: "8FBEF5" },
      ],
      colors: {
        "editor.background": "#171923",
        "editor.foreground": "#D9DCE8",
        "editorLineNumber.foreground": "#555A70",
        "editorLineNumber.activeForeground": "#B7A5FF",
        "editor.lineHighlightBackground": "#1E2130",
        "editor.selectionBackground": "#635BFF40",
        "editorIndentGuide.background1": "#2A2D3D",
        "editorWidget.background": "#242738",
        "editorWidget.border": "#373B51",
        "editorGutter.background": "#171923",
        "minimap.background": "#171923",
      },
    });
    monaco.editor.setTheme("stripe-night");
    void document.fonts.ready.then(() => monaco.editor.remeasureFonts());
  };

  function action(id: string) {
    void editorRef.current?.getAction(id)?.run();
  }

  function convert() {
    const instance = editorRef.current;
    const model = instance?.getModel();
    if (!props.editable || props.locked || !instance || !model) return;
    const original = model.getValue();
    try {
      const result = convertToJson(original);
      setConversionError(null);
      if (result !== original) {
        instance.pushUndoStop();
        instance.executeEdits("convert-to-json", [
          { range: model.getFullModelRange(), text: result },
        ]);
        instance.pushUndoStop();
      }
      instance.focus();
      props.onNotice?.(
        result === original
          ? "Already clean JSON."
          : "Converted to JSON. Use ⌘/Ctrl+Z in the editor to undo.",
      );
    } catch (error) {
      setConversionError({
        source: original,
        message:
          error instanceof Error
            ? error.message
            : "Could not convert this object. Your text has not changed.",
      });
    }
  }

  return (
    <>
      <div className="editor-toolbar">
        <div className="file-tab">
          <span className="json-symbol">{"{ }"}</span>{" "}
          {props.editable ? "request.json" : "response.json"}{" "}
          <span className="tab-dot" />
        </div>
        <div className="editor-actions">
          {props.editable && (
            <button
              type="button"
              className="editor-convert"
              disabled={props.locked || !props.value.trim() || !editorReady}
              onClick={convert}
              title="Quote keys and expressions, remove trailing commas, and format JSON. Never executes code."
            >
              <WandSparkles size={14} /> Convert to JSON
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            title="Find in JSON (⌘/Ctrl+F)"
            aria-label="Find in JSON"
            disabled={!props.value}
            onClick={() => action("actions.find")}
          >
            <Search size={15} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Fold all"
            aria-label="Fold all"
            disabled={!props.value}
            onClick={() => action("editor.foldAll")}
          >
            <ChevronsDownUp size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Unfold all"
            aria-label="Unfold all"
            disabled={!props.value}
            onClick={() => action("editor.unfoldAll")}
          >
            <ChevronsUpDown size={16} />
          </button>
          <span className="toolbar-divider" />
          <button
            type="button"
            className={`icon-button ${props.wordWrap ? "active" : ""}`}
            title="Word wrap"
            aria-label="Word wrap"
            aria-pressed={props.wordWrap}
            onClick={() => props.onToggle("wordWrap")}
          >
            <WrapText size={16} />
          </button>
          <button
            type="button"
            className={`icon-button ${props.minimap ? "active" : ""}`}
            title="Minimap"
            aria-label="Minimap"
            aria-pressed={props.minimap}
            onClick={() => props.onToggle("minimap")}
          >
            <Map size={15} />
          </button>
          <span className="toolbar-divider" />
          <button
            type="button"
            className="icon-button"
            title={props.copied ? "Copied!" : "Copy JSON"}
            aria-label={props.copied ? "Copied JSON" : "Copy JSON"}
            disabled={!props.value}
            onClick={props.onCopy}
          >
            {props.copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
          <button
            type="button"
            className="icon-button"
            title="Download JSON"
            aria-label="Download JSON"
            disabled={!props.value}
            onClick={props.onDownload}
          >
            <Download size={16} />
          </button>
          {!props.editable && (
            <button
              type="button"
              className="icon-button"
              title={props.fullscreen ? "Exit expanded view" : "Expand viewer"}
              aria-label={
                props.fullscreen ? "Exit expanded view" : "Expand viewer"
              }
              aria-pressed={props.fullscreen}
              onClick={() => props.onToggle("fullscreen")}
            >
              {props.fullscreen ? (
                <Minimize2 size={16} />
              ) : (
                <Maximize2 size={16} />
              )}
            </button>
          )}
        </div>
      </div>
      {props.editable && conversionError?.source === props.value && (
        <div className="editor-conversion-error" role="alert">
          {conversionError.message} Your text has not changed.
        </div>
      )}
      <div className="editor-content">
        {props.value || props.editable ? (
          <Editor
            height="100%"
            language="json"
            value={props.value}
            theme="vs-dark"
            onMount={onMount}
            onChange={(value) => props.onChange?.(value ?? "")}
            loading={<div className="editor-loading">Opening JSON viewer…</div>}
            options={{
              readOnly: !props.editable || props.locked,
              domReadOnly: !props.editable || props.locked,
              automaticLayout: true,
              fontFamily: '"Ubuntu Sans Mono", monospace',
              fontSize: 13,
              lineHeight: 23,
              padding: { top: 20, bottom: 20 },
              minimap: {
                enabled: props.minimap,
                renderCharacters: false,
                maxColumn: 80,
              },
              wordWrap: props.wordWrap ? "on" : "off",
              folding: true,
              showFoldingControls: "always",
              foldingStrategy: "auto",
              lineNumbersMinChars: 4,
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              contextmenu: true,
              renderLineHighlight: "line",
              bracketPairColorization: { enabled: true },
              guides: { bracketPairs: true, indentation: true },
              stickyScroll: { enabled: true },
              links: true,
              tabSize: 2,
              occurrencesHighlight: "singleFile",
              renderValidationDecorations: props.editable ? "on" : "off",
              ariaLabel: props.editable
                ? "Stripe request JSON body"
                : "Read-only Stripe JSON response",
            }}
          />
        ) : (
          <div className="empty-response">
            <div className="empty-art">
              <span>{"{"}</span>
              <i />
              <i />
              <i />
              <span>{"}"}</span>
            </div>
            <h3>Your data, in full detail.</h3>
            <p>
              Choose a resource and send a request.
              <br />
              The raw JSON will feel right at home here.
            </p>
            <div className="empty-features">
              <span>Syntax highlighting</span>
              <span>Code folding</span>
              <span>Search</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
