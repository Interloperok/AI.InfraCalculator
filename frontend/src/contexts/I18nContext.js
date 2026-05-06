import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import en from "../i18n/en";
import ru from "../i18n/ru";

const LOCALE_STORAGE_KEY = "ai-calc:locale";
const VALID_LOCALES = ["en", "ru"];

const dictionaries = { en, ru };

// Default context falls back to the English dictionary directly so that
// components rendered outside an explicit <I18nProvider> (e.g. unit tests
// that don't wrap the tree) still display real labels rather than raw keys.
const I18nContext = createContext({
  locale: "en",
  t: (key, fallback) => en[key] ?? fallback ?? key,
  setLocale: () => {},
  available: VALID_LOCALES,
});

const detect = () => {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (VALID_LOCALES.includes(stored)) return stored;
  } catch {
    /* ignore */
  }
  const nav = (navigator.language || "en").toLowerCase();
  if (nav.startsWith("ru")) return "ru";
  return "en";
};

export const I18nProvider = ({ children }) => {
  const [locale, setLocaleState] = useState(() => detect());

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next) => {
    if (!VALID_LOCALES.includes(next)) return;
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key, fallback) => {
      const dict = dictionaries[locale] || en;
      const value = dict[key];
      if (typeof value === "string") return value;
      // Fall back to English then to the key itself so missing entries
      // never crash; surfaces show the key for easy debugging.
      if (locale !== "en" && typeof en[key] === "string") return en[key];
      return fallback ?? key;
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, t, setLocale, available: VALID_LOCALES }),
    [locale, t, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => useContext(I18nContext);

export const useT = () => useContext(I18nContext).t;
