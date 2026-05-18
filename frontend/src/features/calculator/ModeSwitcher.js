import React from "react";
import { MessageSquare, Image as ImageIcon, FileText } from "lucide-react";
import { useT } from "../../contexts/I18nContext";

export const CALCULATOR_MODES = [
  {
    id: "llm",
    label: "LLM",
    subtitle: "Chat & completion",
    description:
      "Standard LLM serving (vLLM, SGLang, TGI). Sizing driven by concurrent user sessions.",
  },
  {
    id: "vlm",
    label: "OCR (VLM)",
    subtitle: "Image → structured JSON",
    description: "Single-pass vision-language model. Sizing driven by pages/sec and per-page SLA.",
    beta: true,
  },
  {
    id: "ocr",
    label: "OCR + LLM",
    subtitle: "Two-pass extraction",
    description:
      "OCR (GPU or CPU) followed by LLM extraction. Two-pool sizing with SLA budget split.",
    beta: true,
  },
];

const MODE_ICONS = {
  llm: MessageSquare,
  vlm: ImageIcon,
  ocr: FileText,
};

const MODE_I18N = {
  llm: { label: "mode.llm", subtitle: "mode.llm.subtitle" },
  vlm: { label: "mode.vlm", subtitle: "mode.vlm.subtitle" },
  ocr: { label: "mode.ocr", subtitle: "mode.ocr.subtitle" },
};

const CONFIG_HEADING_ID = "calculator-config-heading";

const ModeSwitcher = ({ mode, onChange, headerEnd = null }) => {
  const t = useT();
  return (
    <div className="mb-4" data-tour="mode-switcher">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2
          id={CONFIG_HEADING_ID}
          className="text-lg sm:text-2xl font-semibold text-fg min-w-0 truncate"
        >
          {t("form.title")}
        </h2>
        {headerEnd ? <div className="shrink-0">{headerEnd}</div> : null}
      </div>
      <div
        role="group"
        aria-labelledby={CONFIG_HEADING_ID}
        className="grid grid-cols-3 gap-1.5 rounded-xl border border-border bg-surface p-1 shadow-card"
      >
        {CALCULATOR_MODES.map((m) => {
          const active = mode === m.id;
          const Icon = MODE_ICONS[m.id];
          const keys = MODE_I18N[m.id];
          const label = t(keys.label, m.label);
          const subtitle = t(keys.subtitle, m.subtitle);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              title={m.description}
              aria-label={m.label}
              aria-pressed={active}
              className={`group relative flex items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-all duration-150 ease-out-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface ${
                active
                  ? "bg-accent text-accent-fg shadow-sm"
                  : "bg-transparent text-fg hover:bg-elevated"
              }`}
            >
              <span
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors ${
                  active
                    ? "bg-white/15 text-accent-fg"
                    : "bg-accent-soft text-accent group-hover:bg-accent/10"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold leading-tight">{label}</span>
                  {m.beta && (
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider px-1 py-px rounded ${
                        active
                          ? "bg-white/20 text-accent-fg"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
                      }`}
                    >
                      beta
                    </span>
                  )}
                </span>
                <span
                  className={`block text-[11px] leading-snug ${
                    active ? "opacity-80" : "text-muted"
                  }`}
                >
                  {subtitle}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ModeSwitcher;
