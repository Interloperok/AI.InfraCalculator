import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Joyride, { STATUS } from "react-joyride";
import {
  BookOpen,
  Compass,
  Cpu,
  Github,
  Star,
} from "lucide-react";
import Calculator from "./features/calculator/Calculator";
import { GITHUB_URL } from "./config";
import LanguageToggle from "./components/LanguageToggle";
import ThemeToggle from "./components/ThemeToggle";
import { useT } from "./contexts/I18nContext";
import "./App.css";

const APP_VERSION = "1.3.0";
// Methodology docx is bundled into the frontend image; served from the SPA
// root so the app stays usable in air-gapped / offline environments.
const METHODOLOGY_DOCX_URL = "/llm-methodology.docx";

const DOCS_STEP_INDEX = 1;
const PRESETS_STEP_INDEX = 2;
const CALCULATE_STEP_INDEX = 7;
const AUTO_OPTIMIZE_STEP_INDEX = 14;

// Tour step definitions — content is resolved via t(contentKey) inside the
// component so the tour follows the active language.
const TOUR_DEFS = [
  { target: '[data-tour="github-btn"]', contentKey: "tour.llm.github", disableBeacon: true },
  { target: '[data-tour="docs-btn"]', contentKey: "tour.llm.docs", disableOverlay: true },
  { target: '[data-tour="presets"]', contentKey: "tour.llm.presets" },
  { target: '[data-tour="basic-tab"]', contentKey: "tour.llm.basicTab" },
  { target: '[data-tour="advanced-tab"]', contentKey: "tour.llm.advancedTab" },
  { target: '[data-tour="model-search"]', contentKey: "tour.llm.modelSearch" },
  { target: '[data-tour="gpu-search"]', contentKey: "tour.llm.gpuSearch" },
  { target: '[data-tour="sla-targets"]', contentKey: "tour.llm.slaTargets" },
  { target: '[data-tour="calculate-btn"]', contentKey: "tour.llm.calculate" },
  { target: '[data-tour="cost-estimate"]', contentKey: "tour.llm.costEstimate" },
  { target: '[data-tour="session-cards"]', contentKey: "tour.llm.sessionCards" },
  { target: '[data-tour="result-cards"]', contentKey: "tour.llm.resultCards" },
  { target: '[data-tour="donut-chart"]', contentKey: "tour.llm.donutChart" },
  { target: '[data-tour="detail-toggle"]', contentKey: "tour.llm.detailToggle" },
  { target: '[data-tour="download-report"]', contentKey: "tour.llm.downloadReport" },
  { target: '[data-tour="auto-optimize"]', contentKey: "tour.llm.autoOptimize" },
  { target: '[data-tour="optimize-mode"]', contentKey: "tour.llm.optimizeMode" },
  { target: '[data-tour="optimize-results"]', contentKey: "tour.llm.optimizeResults" },
];

const TOUR_DEFS_MOBILE = [
  {
    target: '[data-tour="github-btn"]',
    contentKey: "tour.llmMobile.github",
    disableBeacon: true,
    placement: "bottom",
  },
  {
    target: '[data-tour="docs-btn"]',
    contentKey: "tour.llmMobile.docs",
    placement: "bottom",
  },
  {
    target: '[data-tour="presets"]',
    contentKey: "tour.llmMobile.presets",
    placement: "bottom",
  },
  {
    target: '[data-tour="model-search"]',
    contentKey: "tour.llmMobile.modelSearch",
    placement: "bottom",
  },
  {
    target: '[data-tour="gpu-search"]',
    contentKey: "tour.llmMobile.gpuSearch",
    placement: "top",
  },
  {
    target: '[data-tour="calculate-btn"]',
    contentKey: "tour.llmMobile.calculate",
    placement: "top",
  },
];

const M_PRESETS_STEP = 2;

const TOUR_DEFS_VLM = [
  { target: '[data-tour="github-btn"]', contentKey: "tour.vlm.github", disableBeacon: true },
  { target: '[data-tour="docs-btn"]', contentKey: "tour.vlm.docs", disableOverlay: true },
  { target: '[data-tour="mode-switcher"]', contentKey: "tour.vlm.modeSwitcher" },
  { target: '[data-tour="vlm-presets"]', contentKey: "tour.vlm.presets" },
  { target: '[data-tour="vlm-workload"]', contentKey: "tour.vlm.workload" },
  { target: '[data-tour="vlm-hardware"]', contentKey: "tour.vlm.hardware" },
  { target: '[data-tour="vlm-calculate-btn"]', contentKey: "tour.vlm.calculate" },
  { target: '[data-tour="vlm-result-cards"]', contentKey: "tour.vlm.results" },
];

const TOUR_DEFS_VLM_MOBILE = [
  {
    target: '[data-tour="github-btn"]',
    contentKey: "tour.vlmMobile.github",
    disableBeacon: true,
    placement: "bottom",
  },
  {
    target: '[data-tour="mode-switcher"]',
    contentKey: "tour.vlmMobile.modeSwitcher",
    placement: "bottom",
  },
  {
    target: '[data-tour="vlm-presets"]',
    contentKey: "tour.vlmMobile.presets",
    placement: "bottom",
  },
  {
    target: '[data-tour="vlm-calculate-btn"]',
    contentKey: "tour.vlmMobile.calculate",
    placement: "top",
  },
];

const TOUR_DEFS_OCR = [
  { target: '[data-tour="github-btn"]', contentKey: "tour.ocr.github", disableBeacon: true },
  { target: '[data-tour="docs-btn"]', contentKey: "tour.ocr.docs", disableOverlay: true },
  { target: '[data-tour="mode-switcher"]', contentKey: "tour.ocr.modeSwitcher" },
  { target: '[data-tour="ocr-presets"]', contentKey: "tour.ocr.presets" },
  { target: '[data-tour="ocr-workload"]', contentKey: "tour.ocr.workload" },
  { target: '[data-tour="ocr-pipeline"]', contentKey: "tour.ocr.pipeline" },
  { target: '[data-tour="ocr-hardware"]', contentKey: "tour.ocr.hardware" },
  { target: '[data-tour="ocr-calculate-btn"]', contentKey: "tour.ocr.calculate" },
  { target: '[data-tour="ocr-result-cards"]', contentKey: "tour.ocr.results" },
];

const TOUR_DEFS_OCR_MOBILE = [
  {
    target: '[data-tour="github-btn"]',
    contentKey: "tour.ocrMobile.github",
    disableBeacon: true,
    placement: "bottom",
  },
  {
    target: '[data-tour="mode-switcher"]',
    contentKey: "tour.ocrMobile.modeSwitcher",
    placement: "bottom",
  },
  {
    target: '[data-tour="ocr-presets"]',
    contentKey: "tour.ocrMobile.presets",
    placement: "bottom",
  },
  {
    target: '[data-tour="ocr-pipeline"]',
    contentKey: "tour.ocrMobile.pipeline",
    placement: "bottom",
  },
  {
    target: '[data-tour="ocr-calculate-btn"]',
    contentKey: "tour.ocrMobile.calculate",
    placement: "top",
  },
];

const TOUR_MODES = ["llm", "vlm", "ocr"];
const getStoredCalculatorMode = () => {
  if (typeof window === "undefined") return "llm";
  const saved = localStorage.getItem("calculatorMode");
  return TOUR_MODES.includes(saved) ? saved : "llm";
};

const TOUR_STYLES = {
  options: {
    primaryColor: "#6366f1",
    zIndex: 10000,
    arrowColor: "#fff",
    backgroundColor: "#fff",
    textColor: "#374151",
    overlayColor: "rgba(0, 0, 0, 0.45)",
  },
  buttonNext: {
    backgroundColor: "#6366f1",
    borderRadius: "8px",
    fontSize: "13px",
    padding: "8px 16px",
  },
  buttonBack: {
    color: "#6366f1",
    fontSize: "13px",
    marginRight: 8,
  },
  buttonSkip: {
    color: "#9ca3af",
    fontSize: "13px",
  },
  tooltip: {
    borderRadius: "12px",
    padding: "20px",
  },
  tooltipTitle: {
    fontSize: "15px",
    fontWeight: 600,
  },
  tooltipContent: {
    fontSize: "14px",
    lineHeight: "1.5",
    padding: "8px 0",
  },
};

const TOUR_STYLES_MOBILE = {
  options: {
    primaryColor: "#6366f1",
    zIndex: 10000,
    arrowColor: "#fff",
    backgroundColor: "#fff",
    textColor: "#374151",
    overlayColor: "rgba(0, 0, 0, 0.5)",
  },
  buttonNext: {
    backgroundColor: "#6366f1",
    borderRadius: "8px",
    fontSize: "14px",
    padding: "10px 20px",
  },
  buttonBack: {
    color: "#6366f1",
    fontSize: "14px",
    marginRight: 8,
  },
  buttonSkip: {
    color: "#9ca3af",
    fontSize: "14px",
  },
  tooltip: {
    borderRadius: "12px",
    padding: "14px",
    maxWidth: "290px",
  },
  tooltipTitle: {
    fontSize: "14px",
    fontWeight: 600,
  },
  tooltipContent: {
    fontSize: "13px",
    lineHeight: "1.45",
    padding: "6px 0",
  },
};

function App() {
  const t = useT();
  const [runTour, setRunTour] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  // Tour mode is set when the tour starts, based on the active calculator mode
  const [tourMode, setTourMode] = useState("llm");
  const [docsOpen, setDocsOpen] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(820);
  const [isResizing, setIsResizing] = useState(false);
  const [docsHtml, setDocsHtml] = useState(null);
  const [docsLoadError, setDocsLoadError] = useState(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 640,
  );
  const [isMobileTour, setIsMobileTour] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 1024,
  );
  const dragging = useRef(false);
  const tourAutoOn = useRef(false);
  const isMobileTourRef = useRef(typeof window !== "undefined" && window.innerWidth < 1024);

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 640);
      const narrow = window.innerWidth < 1024;
      setIsMobileTour(narrow);
      isMobileTourRef.current = narrow;
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const toggleAutoOptimize = useCallback((delay = 400) => {
    setTimeout(() => {
      const container = document.querySelector('[data-tour="auto-optimize"]');
      container?.querySelector("button")?.click();
    }, delay);
  }, []);

  const cleanupTourAuto = useCallback(() => {
    if (tourAutoOn.current) {
      toggleAutoOptimize(100);
      tourAutoOn.current = false;
    }
  }, [toggleAutoOptimize]);

  const handleTourCallback = useCallback(
    (data) => {
      const { status, type, action, index } = data;
      const mobile = isMobileTourRef.current;

      const restoreSwipe = () => {
        const el = document.querySelector(".swipe-panels");
        if (el) {
          el.style.overflow = "";
          el.style.overflowX = "";
          el.style.overflowY = "";
          el.style.position = "";
        }
      };

      if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
        setRunTour(false);
        if (!mobile) setDocsOpen(false);
        cleanupTourAuto();
        restoreSwipe();
        return;
      }

      if (type === "step:after") {
        if (action === "close") {
          setRunTour(false);
          if (!mobile) setDocsOpen(false);
          cleanupTourAuto();
          restoreSwipe();
          return;
        }

        const nextIndex = action === "prev" ? index - 1 : index + 1;

        // VLM and OCR tours: just walk through anchors with the docs-drawer step.
        if (tourMode === "vlm" || tourMode === "ocr") {
          if (!mobile) {
            if (index === DOCS_STEP_INDEX) setDocsOpen(false);
            if (nextIndex === DOCS_STEP_INDEX) setDocsOpen(true);
          }
          setTourStepIndex(nextIndex);
          return;
        }

        // LLM tour: includes auto-click choreography for presets / calculate / auto-optimize.
        if (mobile) {
          if (nextIndex === M_PRESETS_STEP) {
            setTimeout(() => {
              document.querySelector('[data-tour="presets"]')?.querySelector("button")?.click();
            }, 400);
          }
        } else {
          if (index === DOCS_STEP_INDEX) setDocsOpen(false);
          if (nextIndex === DOCS_STEP_INDEX) setDocsOpen(true);

          if (nextIndex === PRESETS_STEP_INDEX) {
            setTimeout(() => {
              const container = document.querySelector('[data-tour="presets"]');
              container?.querySelector("button")?.click();
            }, 400);
          }

          if (nextIndex === CALCULATE_STEP_INDEX) {
            setTimeout(() => {
              document.querySelector('[data-tour="calculate-btn"]')?.click();
            }, 400);
          }

          if (nextIndex === AUTO_OPTIMIZE_STEP_INDEX && !tourAutoOn.current) {
            toggleAutoOptimize(400);
            tourAutoOn.current = true;
          }
          if (index === AUTO_OPTIMIZE_STEP_INDEX && action === "prev") {
            cleanupTourAuto();
          }
        }

        setTourStepIndex(nextIndex);
      }
    },
    [cleanupTourAuto, toggleAutoOptimize, tourMode],
  );

  // Close docs drawer on Escape key
  useEffect(() => {
    if (!docsOpen) return;
    const handleKey = (e) => {
      if (e.key === "Escape") setDocsOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [docsOpen]);

  // Lazy-load the methodology docx and convert to HTML via mammoth on first
  // open. Fully offline: the docx is bundled into the frontend at
  // /llm-methodology.docx; mammoth runs entirely in the browser.
  useEffect(() => {
    if (!docsOpen || docsHtml || docsLoadError) return;
    let cancelled = false;
    setDocsLoading(true);
    (async () => {
      try {
        const resp = await fetch(METHODOLOGY_DOCX_URL);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
        const arrayBuffer = await resp.arrayBuffer();
        const mammothMod = await import("mammoth/mammoth.browser");
        const mammoth = mammothMod.default ?? mammothMod;
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelled) setDocsHtml(result.value);
      } catch (e) {
        if (!cancelled) setDocsLoadError(e.message || String(e));
      } finally {
        if (!cancelled) setDocsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docsOpen, docsHtml, docsLoadError]);

  // Drawer resize via drag
  const handleDragStart = useCallback(
    (e) => {
      e.preventDefault();
      dragging.current = true;
      setIsResizing(true);
      const startX = e.clientX;
      const startW = drawerWidth;
      const onMove = (ev) => {
        if (!dragging.current) return;
        const delta = startX - ev.clientX;
        const newW = Math.min(Math.max(startW + delta, 400), window.innerWidth * 0.92);
        setDrawerWidth(newW);
      };
      const onUp = () => {
        dragging.current = false;
        setIsResizing(false);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [drawerWidth],
  );

  const currentYear = new Date().getFullYear();
  const buildDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const startTour = () => {
    const calcMode = getStoredCalculatorMode();
    setTourMode(calcMode);
    setTourStepIndex(0);
    setRunTour(true);
    if (isMobileTour) {
      document
        .querySelector(".swipe-panels")
        ?.scrollTo({ left: 0, behavior: "smooth" });
    }
  };

  // Resolve tour step content via the active language. Recomputes when the
  // mode (LLM/VLM/OCR), viewport (mobile vs desktop), or t() identity changes.
  const tourSteps = useMemo(() => {
    let defs;
    if (tourMode === "vlm") defs = isMobileTour ? TOUR_DEFS_VLM_MOBILE : TOUR_DEFS_VLM;
    else if (tourMode === "ocr") defs = isMobileTour ? TOUR_DEFS_OCR_MOBILE : TOUR_DEFS_OCR;
    else defs = isMobileTour ? TOUR_DEFS_MOBILE : TOUR_DEFS;
    return defs.map(({ contentKey, ...rest }) => ({ ...rest, content: t(contentKey) }));
  }, [tourMode, isMobileTour, t]);

  return (
    <div className="min-h-screen bg-bg text-fg flex flex-col">
      <Joyride
        steps={tourSteps}
        run={runTour}
        stepIndex={tourStepIndex}
        continuous
        showSkipButton
        showProgress
        scrollToFirstStep
        disableOverlayClose
        disableScrollParentFix
        callback={handleTourCallback}
        styles={isMobileTour ? TOUR_STYLES_MOBILE : TOUR_STYLES}
        locale={{
          back: t("tour.locale.back"),
          close: t("tour.locale.close"),
          last: t("tour.locale.last"),
          next: t("tour.locale.next"),
          nextLabelWithProgress: t("tour.locale.nextProgress"),
          skip: t("tour.locale.skip"),
        }}
      />

      {/* Sticky top bar — modern compact layout, brand + mode toggles + theme/lang */}
      <header className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-bg/75 bg-bg border-b border-border">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex h-14 items-center justify-between gap-3">
            {/* Brand */}
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-fg shadow-sm">
                <Cpu className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <h1 className="text-sm font-semibold leading-tight text-fg truncate">
                  {t("app.title")}
                </h1>
                <p className="text-[11px] leading-tight text-muted truncate hidden sm:block">
                  {t("app.subtitle")}
                </p>
              </div>
            </div>

            {/* Action group */}
            <div className="flex items-center gap-1.5 sm:gap-2.5">
              <button
                onClick={startTour}
                title={t("app.tour.start")}
                className="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border border-border bg-surface text-muted hover:text-fg hover:border-border-strong text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Compass className="h-3.5 w-3.5" strokeWidth={2.25} />
                <span>{t("app.tour.start")}</span>
              </button>

              {isMobile ? (
                <a
                  href={METHODOLOGY_DOCX_URL}
                  download="llm-methodology.docx"
                  data-tour="docs-btn"
                  title={t("app.docs")}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-muted hover:text-fg hover:border-border-strong transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <BookOpen className="h-3.5 w-3.5" strokeWidth={2.25} />
                </a>
              ) : (
                <button
                  onClick={() => setDocsOpen(true)}
                  data-tour="docs-btn"
                  title={t("app.docs")}
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border border-border bg-surface text-muted hover:text-fg hover:border-border-strong text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <BookOpen className="h-3.5 w-3.5" strokeWidth={2.25} />
                  <span>{t("app.docs")}</span>
                </button>
              )}

              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-tour="github-btn"
                title={t("app.github")}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border border-border bg-surface text-muted hover:text-fg hover:border-border-strong text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent group"
              >
                <Github className="h-3.5 w-3.5" strokeWidth={2.25} />
                <span className="hidden sm:inline">{t("app.github")}</span>
                <Star className="h-3 w-3 text-warning fill-warning opacity-70 group-hover:opacity-100 transition-opacity hidden sm:inline" />
              </a>

              <span className="hidden sm:block h-6 w-px bg-border" aria-hidden />

              <LanguageToggle />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-10 flex-1">
        <div className="max-w-7xl mx-auto">
          <Calculator />
        </div>
      </div>

      {/* Docs Drawer — no overlay, rest of page stays interactive */}
      {docsOpen && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          {/* Panel — only this receives clicks */}
          <div
            className="absolute right-0 top-0 h-full bg-surface text-fg shadow-elevated flex flex-col docs-drawer pointer-events-auto"
            style={{ width: Math.min(drawerWidth, window.innerWidth * 0.92) }}
          >
            {/* Drag handle — left edge */}
            <div
              onMouseDown={handleDragStart}
              className="absolute left-0 top-0 h-full w-2 cursor-col-resize z-10 group"
              title="Drag to resize"
            >
              <div className="absolute left-0 top-0 h-full w-1 bg-transparent group-hover:bg-accent/50 transition-colors" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-accent" strokeWidth={2.25} />
                <h2 className="text-base font-semibold text-fg">{t("app.docs")}</h2>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={METHODOLOGY_DOCX_URL}
                  download="llm-methodology.docx"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted hover:text-accent hover:bg-accent-soft rounded-md transition-colors"
                  title={t("app.docs.download")}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4"
                    />
                  </svg>
                  <span>{t("app.docs.download")}</span>
                </a>
                <button
                  onClick={() => setDocsOpen(false)}
                  className="p-1.5 rounded-md text-muted hover:text-fg hover:bg-elevated transition-colors"
                  title={t("app.docs.close")}
                  aria-label={t("app.docs.close")}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
            {/* Rendered docx */}
            <div className="relative flex-1 overflow-y-auto">
              {docsLoadError ? (
                <div className="px-6 py-8 text-sm text-danger">
                  {t("app.docs.error")}: {docsLoadError}
                </div>
              ) : docsLoading || !docsHtml ? (
                <div className="px-6 py-8 text-sm text-muted">{t("app.docs.loading")}</div>
              ) : (
                <div
                  className="docs-rendered px-6 py-6 text-fg"
                  dangerouslySetInnerHTML={{ __html: docsHtml }}
                />
              )}
              {/* Transparent overlay during resize to prevent inner content from stealing events */}
              {isResizing && <div className="absolute inset-0" />}
            </div>
          </div>
        </div>
      )}

      {/* Footer — minimal, semantic tokens */}
      <footer className="border-t border-border bg-bg/60 backdrop-blur-sm mt-12">
        <div className="container mx-auto px-4 sm:px-6 py-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted">
            <div className="flex items-center gap-2">
              <span>&copy; {currentYear} {t("app.title")}</span>
              <span className="text-subtle">·</span>
              <span className="px-1.5 py-0.5 bg-elevated text-muted text-[11px] font-mono rounded">
                v{APP_VERSION}
              </span>
              <span className="text-subtle hidden sm:inline">·</span>
              <span className="hidden sm:inline">{buildDate}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-subtle">{t("app.footer.builtWith")}</span>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-fg transition-colors"
                title={t("app.github")}
              >
                <Github className="h-3.5 w-3.5" strokeWidth={2.25} />
                <span>{t("app.github")}</span>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
