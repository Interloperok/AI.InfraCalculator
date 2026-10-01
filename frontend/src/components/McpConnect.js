import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Check, Code, Copy, ExternalLink, Plug, X } from "lucide-react";

import { DOCS_MCP_URL, DOCS_URL, resolveMcpUrl, resolveSwaggerUrl } from "../config";
import { useT } from "../contexts/I18nContext";

export { resolveMcpUrl };

const SERVER_NAME = "ai-infra-calculator";

const TOOLS = [
  ["size_llm", "app.mcp.tool.sizeLlm"],
  ["build_report", "app.mcp.tool.report"],
  ["size_vlm", "app.mcp.tool.sizeVlm"],
  ["size_ocr", "app.mcp.tool.sizeOcr"],
  ["compare_scenarios", "app.mcp.tool.compare"],
  ["auto_optimize", "app.mcp.tool.optimize"],
  ["list_gpus", "app.mcp.tool.catalogs"],
];

const DOCS_SERVER_NAME = "ai-infra-docs";

function clientConfig(tab, calculatorUrl) {
  const calculator =
    tab === "local"
      ? {
          command: "uv",
          args: ["run", "--directory", "backend", "python", "-m", "mcp_server"],
        }
      : { url: calculatorUrl };
  return JSON.stringify(
    {
      mcpServers: {
        [SERVER_NAME]: calculator,
        [DOCS_SERVER_NAME]: { url: DOCS_MCP_URL },
      },
    },
    null,
    2,
  );
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

const TABS = [
  { id: "cursor", labelKey: "app.mcp.cursor", hintKey: "app.mcp.hint.cursor" },
  { id: "claude", labelKey: "app.mcp.claude", hintKey: "app.mcp.hint.claude" },
  { id: "local", labelKey: "app.mcp.local", hintKey: "app.mcp.hint.local" },
];

function McpDialog({ onClose }) {
  const t = useT();
  const mcpUrl = useMemo(() => resolveMcpUrl(), []);
  const swaggerUrl = useMemo(() => resolveSwaggerUrl(), []);
  const [tab, setTab] = useState("cursor");
  const [copied, setCopied] = useState("");

  const snippet = clientConfig(tab, mcpUrl);
  const hint = TABS.find((item) => item.id === tab)?.hintKey;

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const copy = async (id, text) => {
    try {
      await copyText(text);
      setCopied(id);
      window.setTimeout(() => setCopied((current) => (current === id ? "" : current)), 1600);
    } catch {
      setCopied("");
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label={t("app.mcp.close")}
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcp-dialog-title"
        className="relative z-10 flex max-h-[min(90dvh,720px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-white text-fg shadow-elevated dark:bg-surface"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-white">
                <Plug className="h-3.5 w-3.5" strokeWidth={2.25} />
              </span>
              <h2 id="mcp-dialog-title" className="text-base font-semibold">
                {t("app.mcp.title")}
              </h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t("app.mcp.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted hover:bg-elevated hover:text-fg"
            aria-label={t("app.mcp.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <EndpointRow
            label={t("app.mcp.endpoint")}
            url={mcpUrl}
            testId="mcp-endpoint"
            copied={copied === "url"}
            copyLabel={copied === "url" ? t("app.mcp.copied") : t("app.mcp.copy")}
            onCopy={() => copy("url", mcpUrl)}
          />
          <EndpointRow
            label={t("app.mcp.docs")}
            hint={t("app.mcp.docsHint")}
            url={DOCS_MCP_URL}
            testId="docs-mcp-endpoint"
            copied={copied === "docs"}
            copyLabel={copied === "docs" ? t("app.mcp.copied") : t("app.mcp.copy")}
            onCopy={() => copy("docs", DOCS_MCP_URL)}
            href={DOCS_URL}
            hrefLabel={t("app.docs")}
          />

          <div>
            <div role="tablist" aria-label={t("app.mcp.title")} className="flex gap-1">
              {TABS.map((item) => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(item.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      active ? "bg-violet-600 text-white" : "bg-elevated text-muted hover:text-fg"
                    }`}
                  >
                    {t(item.labelKey)}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">{hint ? t(hint) : ""}</p>
            <div className="relative mt-2">
              <pre className="overflow-x-auto rounded-lg bg-gray-950 p-3 pr-24 font-mono text-[11px] leading-relaxed text-gray-100">
                {snippet}
              </pre>
              <div className="absolute right-2 top-2">
                <CopyButton
                  label={copied === "config" ? t("app.mcp.copied") : t("app.mcp.copy")}
                  copied={copied === "config"}
                  onClick={() => copy("config", snippet)}
                />
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
              {t("app.mcp.tools")}
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {TOOLS.map(([name, labelKey]) => (
                <li
                  key={name}
                  className="rounded-full border border-border bg-elevated px-2.5 py-1 text-[11px] text-muted"
                >
                  <span className="font-mono text-fg">{name}</span>
                  <span className="mx-1 text-subtle">·</span>
                  {t(labelKey)}
                </li>
              ))}
            </ul>
          </div>

          <a
            href={swaggerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200"
          >
            <Code className="h-3.5 w-3.5" strokeWidth={2.25} />
            {t("app.mcp.swagger")}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function EndpointRow({ label, hint, url, testId, copied, copyLabel, onCopy, href, hrefLabel }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-300"
          >
            <BookOpen className="h-3 w-3" />
            {hrefLabel}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
      {hint ? <p className="mb-1.5 text-[11px] leading-relaxed text-muted">{hint}</p> : null}
      <div className="flex items-center gap-2">
        <code
          data-testid={testId}
          className="min-w-0 flex-1 truncate rounded-lg bg-gray-950 px-3 py-2 font-mono text-xs text-gray-100"
        >
          {url}
        </code>
        <CopyButton tone="surface" label={copyLabel} copied={copied} onClick={onCopy} />
      </div>
    </div>
  );
}

function CopyButton({ label, copied, onClick, tone = "overlay" }) {
  const toneClass =
    tone === "surface"
      ? "border-border bg-elevated text-fg hover:bg-white dark:hover:bg-elevated"
      : "border-white/10 bg-white/10 text-white hover:bg-white/20";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${toneClass}`}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {label}
    </button>
  );
}

export default function McpConnectButton() {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("app.mcp.open")}
        aria-label={t("app.mcp")}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-medium text-violet-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-border-strong dark:bg-surface dark:text-violet-300 dark:hover:border-violet-400/60 dark:hover:bg-violet-500/10"
      >
        <Plug className="h-3.5 w-3.5" strokeWidth={2.25} />
        <span className="hidden sm:inline">{t("app.mcp")}</span>
      </button>
      {open ? <McpDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}
