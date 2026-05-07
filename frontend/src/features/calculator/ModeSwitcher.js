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
    description:
      "Single-pass vision-language model. Sizing driven by pages/sec and per-page SLA.",
  },
  {
    id: "ocr",
    label: "OCR + LLM",
    subtitle: "Two-pass extraction",
    description:
      "OCR (GPU or CPU) followed by LLM extraction. Two-pool sizing with SLA budget split.",
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

const ModeSwitcher = ({ mode, onChange }) => {
  const t = useT();
  return (
    <div className="mb-4" data-tour="mode-switcher">
      <p className="text-xs font-medium uppercase tracking-wider text-muted mb-2">
        {t("mode.label")}
      </p>
      <div
        aria-label={t("mode.label")}
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
                <span className="block text-sm font-semibold leading-tight">
                  {label}
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
