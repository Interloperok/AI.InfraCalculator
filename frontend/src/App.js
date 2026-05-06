import React, { useState, useCallback, useEffect, useRef } from "react";
// react-joyride 3.x exports `Joyride` as a named export rather than default.
import { Joyride, STATUS } from "react-joyride";
import Calculator from "./features/calculator/Calculator";
import { GITHUB_URL } from "./config";
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col">
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

      {/* Main content */}
      <div className="container mx-auto px-4 py-8 flex-1">
        <header className="mb-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 mb-4 header-icon">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
              />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-gray-800 mb-2">AI Infrastructure Calculator</h1>
          <p className="text-lg text-gray-500 mb-4">
            Find out how many servers and GPUs you need for your AI models
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2 sm:gap-3 max-w-xs sm:max-w-none mx-auto">
            {/* 1 — Take a Tour (per-mode tour: LLM by default, VLM in VLM mode) */}
            <button
              onClick={() => {
                const calcMode = getStoredCalculatorMode();
                setTourMode(calcMode);
                setTourStepIndex(0);
                setRunTour(true);
                if (isMobileTour) {
                  document
                    .querySelector(".swipe-panels")
                    ?.scrollTo({ left: 0, behavior: "smooth" });
                }
              }}
              className="tour-btn-pulse inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-indigo-50 text-indigo-600 text-sm font-medium rounded-lg border border-indigo-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all duration-200 whitespace-nowrap"
            >
              <svg
                className="w-4 h-4 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
              <span>Take a Tour</span>
            </button>
            {/* 2 — Star on GitHub */}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-tour="github-btn"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200 group whitespace-nowrap"
            >
              <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.604-3.369-1.341-3.369-1.341-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"
                />
              </svg>
              <svg
                className="w-4 h-4 text-amber-400 group-hover:scale-125 transition-transform duration-200 shrink-0"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span>Star on GitHub</span>
            </a>
            {/* 3 — Documentation: on mobile → external link, on desktop → drawer */}
            {isMobile ? (
              <a
                href={GOOGLE_DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-tour="docs-btn"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-emerald-50 text-emerald-600 text-sm font-medium rounded-lg border border-emerald-200 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all duration-200 whitespace-nowrap"
              >
                <svg
                  className="w-4 h-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
                <span>Documentation</span>
              </a>
            ) : (
              <button
                onClick={() => setDocsOpen(true)}
                data-tour="docs-btn"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-emerald-50 text-emerald-600 text-sm font-medium rounded-lg border border-emerald-200 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all duration-200 whitespace-nowrap"
              >
                <svg
                  className="w-4 h-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
                <span>Documentation</span>
              </button>
            )}
          </div>
        </header>

        <div className="max-w-7xl mx-auto">
          <Calculator />
        </div>
      </div>

      {/* Docs Drawer — no overlay, rest of page stays interactive */}
      {docsOpen && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          {/* Panel — only this receives clicks */}
          <div
            className="absolute right-0 top-0 h-full bg-white shadow-2xl flex flex-col docs-drawer pointer-events-auto"
            style={{ width: Math.min(drawerWidth, window.innerWidth * 0.92) }}
          >
            {/* Drag handle — left edge */}
            <div
              onMouseDown={handleDragStart}
              className="absolute left-0 top-0 h-full w-2 cursor-col-resize z-10 group"
              title="Drag to resize"
            >
              <div className="absolute left-0 top-0 h-full w-1 bg-transparent group-hover:bg-indigo-400/50 transition-colors" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-emerald-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
                <h2 className="text-lg font-semibold text-gray-800">Documentation</h2>
              </div>
              <div className="flex items-center gap-2">
                {/* Open in Google Docs */}
                <a
                  href={GOOGLE_DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                  title="Open in Google Docs"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                  <span>Open in Google Docs</span>
                </a>
                {/* Close */}
                <button
                  onClick={() => setDocsOpen(false)}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  title="Close (Esc)"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white/60 backdrop-blur-sm mt-12">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
            {/* Left side */}
            <div className="flex items-center gap-2">
              <span>&copy; {currentYear} AI Infrastructure Calculator</span>
              <span className="text-gray-300">|</span>
              <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 text-xs font-mono rounded">
                v{APP_VERSION}
              </span>
              <span className="text-gray-300">|</span>
              <span>{buildDate}</span>
            </div>

            {/* Center */}
            <div className="flex items-center gap-1 text-gray-400">
              <span>Built with</span>
              <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                  clipRule="evenodd"
                />
              </svg>
              <span>using React & Tailwind</span>
            </div>

            {/* Right side — GitHub link */}
            <div className="flex items-center gap-3">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors"
                title="View on GitHub"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.604-3.369-1.341-3.369-1.341-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"
                  />
                </svg>
                <span className="text-sm">GitHub</span>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
