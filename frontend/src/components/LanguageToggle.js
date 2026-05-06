import React from "react";

import { useI18n } from "../contexts/I18nContext";

/**
 * Two-position language toggle (en / ru). Mirrors the visual language of
 * ThemeToggle so the header has consistent shape.
 */
const LanguageToggle = ({ className = "" }) => {
  const { locale, setLocale, available } = useI18n();

  return (
    <div
      role="radiogroup"
      aria-label="Language"
      className={`inline-flex items-center rounded-full border border-border bg-surface p-0.5 shadow-sm ${className}`}
    >
      {available.map((value) => {
        const active = locale === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setLocale(value)}
            className={`flex h-7 min-w-[2rem] items-center justify-center rounded-full px-2 text-[11px] font-semibold uppercase tracking-wider transition-colors duration-150 ease-out-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              active
                ? "bg-accent text-accent-fg shadow-sm"
                : "text-muted hover:text-fg"
            }`}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
};

export default LanguageToggle;
