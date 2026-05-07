import React, { useState, useCallback, useEffect, useRef } from "react";
// react-joyride 3.x exports `Joyride` as a named export rather than default.
import { Joyride, STATUS } from "react-joyride";
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
const GOOGLE_DOCS_URL =
  "https://docs.google.com/document/d/1_H4QWAda19SFJbaHD4oHycYAh5TdECCr/edit?usp=sharing&ouid=114772934094426194553&rtpof=true&sd=true";

const DOCS_STEP_INDEX = 1;
const PRESETS_STEP_INDEX = 2;
const CALCULATE_STEP_INDEX = 7;
const AUTO_OPTIMIZE_STEP_INDEX = 14;

const TOUR_STEPS = [
  {
    target: '[data-tour="github-btn"]',
    content: "Visit us on GitHub — star the repo to stay updated and learn more about the project.",
    disableBeacon: true,
  },
  {
    target: '[data-tour="docs-btn"]',
    content:
      "Here is the methodology documentation — browse it in a side panel without leaving the calculator.",
    disableOverlay: true,
  },
  {
    target: '[data-tour="presets"]',
    content:
      "Start quickly by picking a preset configuration with pre-filled model, GPU, and load parameters.",
  },
  {
    target: '[data-tour="basic-tab"]',
    content:
      "Basic settings cover users, model selection, and hardware — enough for a quick estimate.",
  },
  {
    target: '[data-tour="advanced-tab"]',
    content:
      "Fine-tune token budgets, KV-cache, tensor parallelism, compute efficiency, and SLA parameters here.",
  },
  {
    target: '[data-tour="model-search"]',
    content:
      "Search Hugging Face to find your AI model. Architecture parameters like size and layers are filled automatically.",
  },
  {
    target: '[data-tour="gpu-search"]',
    content:
      "Pick a GPU from the built-in catalog or upload your own. Memory and TFLOPS specs are filled in for you.",
  },
  {
    target: '[data-tour="sla-targets"]',
    content:
      "Set TTFT and end-to-end latency targets (default 1s and 2s). The calculator validates your configuration against these SLA limits.",
  },
  {
    target: '[data-tour="calculate-btn"]',
    content:
      "Hit Calculate to run the sizing engine, or Find Best Configs in auto mode to compare multiple options.",
  },
  {
    target: '[data-tour="cost-estimate"]',
    content:
      "Estimated GPU hardware cost based on current market prices for the selected configuration.",
  },
  {
    target: '[data-tour="session-cards"]',
    content:
      "Total concurrent sessions the infrastructure supports and the token length of each session context.",
  },
  {
    target: '[data-tour="result-cards"]',
    content:
      "Key results at a glance: total servers and GPUs (so you can match against existing capacity), sessions per server, and throughput capacity.",
  },
  {
    target: '[data-tour="donut-chart"]',
    content:
      "Visual breakdown of GPU memory per model instance — model weights vs. available KV-cache space.",
  },
  {
    target: '[data-tour="detail-toggle"]',
    content: "Switch between Memory Path and Compute Path to see the full calculation details.",
  },
  {
    target: '[data-tour="download-report"]',
    content:
      "Download a detailed Excel report with all inputs, intermediate values, and final results.",
  },
  {
    target: '[data-tour="auto-optimize"]',
    content:
      "Toggle Auto-Optimize to let the engine search across GPUs, quantization levels, and TP degrees to find the best hardware configuration automatically.",
  },
  {
    target: '[data-tour="optimize-mode"]',
    content:
      "Choose an optimization strategy: minimize servers, minimize cost, find the best balance, or maximize throughput.",
  },
  {
    target: '[data-tour="optimize-results"]',
    content:
      "After running the optimizer, results appear in this side panel. Click to expand it and compare configurations side by side.",
  },
];

const TOUR_STEPS_MOBILE = [
  {
    target: '[data-tour="github-btn"]',
    content: "Visit us on GitHub — star the repo to stay updated.",
    disableBeacon: true,
    placement: "bottom",
  },
  {
    target: '[data-tour="docs-btn"]',
    content: "Tap to open the methodology documentation in a new tab.",
    placement: "bottom",
  },
  {
    target: '[data-tour="presets"]',
    content: "Pick a preset to quickly fill in model, GPU, and load parameters.",
    placement: "bottom",
  },
  {
    target: '[data-tour="model-search"]',
    content: "Search Hugging Face for your AI model — parameters are filled automatically.",
    placement: "bottom",
  },
  {
    target: '[data-tour="gpu-search"]',
    content: "Choose a GPU from the catalog. Memory and TFLOPS are filled in for you.",
    placement: "top",
  },
  {
    target: '[data-tour="calculate-btn"]',
    content: "Tap Calculate to run the sizing engine and see your results.",
    placement: "top",
  },
];

const M_PRESETS_STEP = 2;

// ── VLM tour (per-mode tour requested in P12c) ──
const TOUR_STEPS_VLM = [
  {
    target: '[data-tour="github-btn"]',
    content: "Visit us on GitHub — star the repo to stay updated and learn more about the project.",
    disableBeacon: true,
  },
  {
    target: '[data-tour="docs-btn"]',
    content: "Methodology documentation. Appendix И covers VLM single-pass online sizing.",
    disableOverlay: true,
  },
  {
    target: '[data-tour="mode-switcher"]',
    content:
      "You're in VLM mode — single-pass image-to-JSON sizing. Switch to LLM or OCR+LLM here when needed.",
  },
  {
    target: '[data-tour="vlm-presets"]',
    content:
      "Pick a preset to populate workload, image profile, model, and hardware in one click.",
  },
  {
    target: '[data-tour="vlm-workload"]',
    content:
      "VLM is sized in pages/sec, not user sessions. Set average pages/sec, peak concurrency, and the per-page SLA target.",
  },
  {
    target: '[data-tour="vlm-hardware"]',
    content:
      "Pick a GPU and tensor parallelism degree. VLMs are typically run at TP=1 unless the model is very large.",
  },
  {
    target: '[data-tour="vlm-calculate-btn"]',
    content: "Click to run the sizing engine and get servers + GPUs needed for your workload.",
  },
  {
    target: '[data-tour="vlm-result-cards"]',
    content:
      "Three headline cards: infrastructure (servers + GPUs), SLA pass/fail, and per-instance prefill/decode throughput.",
  },
];

const TOUR_STEPS_VLM_MOBILE = [
  {
    target: '[data-tour="github-btn"]',
    content: "Star the repo on GitHub.",
    disableBeacon: true,
    placement: "bottom",
  },
  {
    target: '[data-tour="mode-switcher"]',
    content: "Switch between LLM, VLM, and OCR+LLM modes here.",
    placement: "bottom",
  },
  {
    target: '[data-tour="vlm-presets"]',
    content: "Tap a preset to fill all fields.",
    placement: "bottom",
  },
  {
    target: '[data-tour="vlm-calculate-btn"]',
    content: "Tap Calculate to run the sizing engine.",
    placement: "top",
  },
];

// ── OCR + LLM tour ──
const TOUR_STEPS_OCR = [
  {
    target: '[data-tour="github-btn"]',
    content: "Visit us on GitHub — star the repo to stay updated and learn more about the project.",
    disableBeacon: true,
  },
  {
    target: '[data-tour="docs-btn"]',
    content:
      "Methodology documentation. Appendix И.4.2 covers OCR+LLM two-pass online sizing with two-pool deployments.",
    disableOverlay: true,
  },
  {
    target: '[data-tour="mode-switcher"]',
    content:
      "You're in OCR + LLM mode — two-pass extraction. Switch between LLM, VLM, and OCR+LLM here.",
  },
  {
    target: '[data-tour="ocr-presets"]',
    content:
      "Pick a preset to populate workload, OCR pipeline, text profile, model, and hardware.",
  },
  {
    target: '[data-tour="ocr-workload"]',
    content:
      "Same workload semantics as VLM: pages/sec, peak concurrency, per-page SLA. The SLA budget is split between OCR and LLM stages.",
  },
  {
    target: '[data-tour="ocr-pipeline"]',
    content:
      "Pick OCR-on-GPU (PaddleOCR/EasyOCR) for high-volume cases, or OCR-on-CPU (Tesseract) when the GPU pool should hold only the LLM. The choice changes how the SLA budget is split.",
  },
  {
    target: '[data-tour="ocr-hardware"]',
    content: "Pick a GPU and tensor parallelism degree for the LLM stage.",
  },
  {
    target: '[data-tour="ocr-calculate-btn"]',
    content: "Run sizing — backend returns separate GPU pools for OCR and LLM stages.",
  },
  {
    target: '[data-tour="ocr-result-cards"]',
    content:
      "Three cards: total infrastructure with the OCR+LLM pool split below, SLA pass/fail with t_OCR breakdown, and LLM-stage throughput.",
  },
];

const TOUR_STEPS_OCR_MOBILE = [
  {
    target: '[data-tour="github-btn"]',
    content: "Star the repo on GitHub.",
    disableBeacon: true,
    placement: "bottom",
  },
  {
    target: '[data-tour="mode-switcher"]',
    content: "Switch between LLM, VLM, and OCR+LLM modes here.",
    placement: "bottom",
  },
  {
    target: '[data-tour="ocr-presets"]',
    content: "Tap a preset to fill all fields.",
    placement: "bottom",
  },
  {
    target: '[data-tour="ocr-pipeline"]',
    content: "Choose OCR on GPU or CPU.",
    placement: "bottom",
  },
  {
    target: '[data-tour="ocr-calculate-btn"]',
    content: "Tap Calculate.",
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

  return (
    <div className="min-h-screen bg-bg text-fg flex flex-col">
      <Joyride
        steps={(() => {
          if (tourMode === "vlm")
            return isMobileTour ? TOUR_STEPS_VLM_MOBILE : TOUR_STEPS_VLM;
          if (tourMode === "ocr")
            return isMobileTour ? TOUR_STEPS_OCR_MOBILE : TOUR_STEPS_OCR;
          return isMobileTour ? TOUR_STEPS_MOBILE : TOUR_STEPS;
        })()}
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
          back: "Back",
          close: "Close",
          last: "Finish",
          next: "Next",
          skip: "Skip tour",
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
                  href={GOOGLE_DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
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
                  href={GOOGLE_DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted hover:text-accent hover:bg-accent-soft rounded-md transition-colors"
                  title="Open in Google Docs"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                  <span>Open in Google Docs</span>
                </a>
                <button
                  onClick={() => setDocsOpen(false)}
                  className="p-1.5 rounded-md text-muted hover:text-fg hover:bg-elevated transition-colors"
                  title="Close (Esc)"
                  aria-label="Close"
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
            {/* Iframe */}
            <div className="relative flex-1">
              <iframe
                src="https://docs.google.com/document/d/1_H4QWAda19SFJbaHD4oHycYAh5TdECCr/preview?usp=sharing&ouid=114772934094426194553&rtpof=true&sd=true"
                //src="https://docs.google.com/document/d/e/2PACX-1vRKlgJr0CsZhTEObcFnpBxWlAmHA1hscr0w6GDSnbcJRW-eCqhwkQOuP9pecS735w/pub?embedded=true"
                title="Documentation"
                className="absolute inset-0 w-full h-full border-0"
              />
              {/* Transparent overlay during resize to prevent iframe from stealing events */}
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
