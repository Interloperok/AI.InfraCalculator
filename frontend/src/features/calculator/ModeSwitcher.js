import React from "react";

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
    label: "VLM",
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

const ModeSwitcher = ({ mode, onChange }) => {
  return (
    <div className="mb-4" data-tour="mode-switcher">
      <label className="block text-sm font-medium text-gray-600 mb-2">
        Calculator Mode
      </label>
      <div className="grid grid-cols-3 gap-2">
        {CALCULATOR_MODES.map((m) => {
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              title={m.description}
              aria-pressed={active}
              className={`text-left p-3 rounded-lg border-2 transition-all ${
                active
                  ? "bg-indigo-600 border-indigo-600 text-white shadow-md"
                  : "bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50"
              }`}
            >
              <p className="text-sm font-semibold leading-tight">{m.label}</p>
              <p
                className={`text-xs mt-0.5 ${
                  active ? "opacity-80" : "text-gray-500"
                }`}
              >
                {m.subtitle}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ModeSwitcher;
