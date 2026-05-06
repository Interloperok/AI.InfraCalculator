import React from "react";
import { Moon, Sun, Monitor } from "lucide-react";

import { useTheme } from "../contexts/ThemeContext";
import { useT } from "../contexts/I18nContext";

/**
 * Three-position theme toggle: light / dark / system.
 *
 * Uses a segmented-pill UI rather than a dropdown so the active state is
 * always visible at a glance. Each segment is a real button with
 * `aria-pressed` for assistive tech.
 */
const ThemeToggle = ({ className = "" }) => {
  const { theme, setTheme } = useTheme();
  const t = useT();

  const options = [
    { value: "light", label: t("app.theme.light"), icon: Sun },
    { value: "dark", label: t("app.theme.dark"), icon: Moon },
    { value: "system", label: t("app.theme.system"), icon: Monitor },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={t("app.theme.label")}
      className={`inline-flex items-center rounded-full border border-border bg-surface p-0.5 shadow-sm ${className}`}
    >
      {options.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-150 ease-out-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              active
                ? "bg-accent text-accent-fg shadow-sm"
                : "text-muted hover:text-fg"
            }`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
        );
      })}
    </div>
  );
};

export default ThemeToggle;
