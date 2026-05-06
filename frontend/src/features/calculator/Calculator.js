import React, { useState, useCallback, useRef, useEffect } from "react";
import CalculatorForm from "./CalculatorForm";
import ResultsDisplay from "./ResultsDisplay";
import ModeSwitcher from "./ModeSwitcher";
import VLMCalculatorForm from "./VLMCalculatorForm";
import VLMResultsDisplay from "./VLMResultsDisplay";
import OCRCalculatorForm from "./OCRCalculatorForm";
import OCRResultsDisplay from "./OCRResultsDisplay";
import OptimizeResultsTable from "../optimization/OptimizeResultsTable";
import GpuFilterModal from "../gpu/GpuFilterModal";
import {
  calculateServerRequirements,
  calculateVLMSizing,
  calculateOCRSizing,
  autoOptimize,
} from "../../services/api";

const VALID_MODES = ["llm", "vlm", "ocr"];

const Calculator = () => {
  // ── Calculator mode (LLM by default; VLM/OCR placeholders until P12c/d) ──
  const [mode, setMode] = useState(() => {
    const saved = typeof window !== "undefined" && localStorage.getItem("calculatorMode");
    return saved && VALID_MODES.includes(saved) ? saved : "llm";
  });

  // ── Standard calculator state ──
  const [results, setResults] = useState(null);
  const [inputData, setInputData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── Auto-optimize state ──
  const [autoMode, setAutoMode] = useState(false);
  const [optimizeMode, setOptimizeMode] = useState("balanced");
  const [optimizeResults, setOptimizeResults] = useState(null);
  const [optimizeStats, setOptimizeStats] = useState(null);
  const [optimizeError, setOptimizeError] = useState(null);
  const [selectedConfigIdx, setSelectedConfigIdx] = useState(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [gpuFilter, setGpuFilter] = useState([]);
  const [gpuModalOpen, setGpuModalOpen] = useState(false);
  const [gpuModalMode, setGpuModalMode] = useState("filter"); // 'filter' | 'picker'
  const [gpuPickerInitialId, setGpuPickerInitialId] = useState(null);
  const [gpuPickerResult, setGpuPickerResult] = useState(null); // { id, ... } or null when applied from picker

  // ── Custom GPU catalog state (persisted in localStorage) ──
  const [customCatalog, setCustomCatalog] = useState(() => {
    try {
      const saved = localStorage.getItem("customGpuCatalog");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [customCatalogName, setCustomCatalogName] = useState(
    () => localStorage.getItem("customGpuCatalogName") || "",
  );
  const [useCustomCatalog, setUseCustomCatalog] = useState(
    () => localStorage.getItem("useCustomCatalog") === "true",
  );

  // ── Drawer state ──
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(520);
  const [isResizing, setIsResizing] = useState(false);
  const dragging = useRef(false);
  const [swipeIndex, setSwipeIndex] = useState(0);
  const swipeRef = useRef(null);

  // ── Applied config for syncing table selection back to form ──
  const [appliedConfig, setAppliedConfig] = useState(null);

  // Persist custom catalog to localStorage
  useEffect(() => {
    if (customCatalog) {
      localStorage.setItem("customGpuCatalog", JSON.stringify(customCatalog));
    } else {
      localStorage.removeItem("customGpuCatalog");
    }
  }, [customCatalog]);

  useEffect(() => {
    localStorage.setItem("customGpuCatalogName", customCatalogName);
  }, [customCatalogName]);

  useEffect(() => {
    localStorage.setItem("useCustomCatalog", String(useCustomCatalog));
  }, [useCustomCatalog]);

  // Persist calculator mode
  useEffect(() => {
    localStorage.setItem("calculatorMode", mode);
  }, [mode]);

  const handleModeChange = useCallback(
    (newMode) => {
      if (newMode === mode || !VALID_MODES.includes(newMode)) return;
      setMode(newMode);
      // Clear any results/state from the previous mode so the user starts fresh
      setResults(null);
      setInputData(null);
      setError(null);
      setOptimizeResults(null);
      setOptimizeError(null);
      setOptimizeStats(null);
      setSelectedConfigIdx(null);
      setAppliedConfig(null);
      setGpuModalOpen(false);
      setGpuPickerResult(null);
      // Auto-Optimize is LLM-only; force off when leaving LLM mode
      if (newMode !== "llm") {
        setAutoMode(false);
      }
    },
    [mode],
  );

  // Custom catalog handlers
  const handleCustomCatalogUpload = useCallback((catalog, fileName) => {
    setCustomCatalog(catalog);
    setCustomCatalogName(fileName);
    setUseCustomCatalog(true);
    // Reset GPU filter since catalog changed
    setGpuFilter([]);
  }, []);

  const handleCustomCatalogToggle = useCallback((useCustom) => {
    setUseCustomCatalog(useCustom);
    // Reset GPU filter when switching catalogs
    setGpuFilter([]);
  }, []);

  // Auto-open drawer when results arrive
  useEffect(() => {
    if (optimizeResults && optimizeResults.length > 0) {
      setDrawerOpen(true);
    }
  }, [optimizeResults]);

  // Close drawer on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const handleKey = (e) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [drawerOpen]);

  useEffect(() => {
    const el = swipeRef.current;
    if (!el) return;

    const updateIndex = () => {
      const width = el.clientWidth;
      const scrollLeft = el.scrollLeft;
      setSwipeIndex(width > 0 ? Math.round(scrollLeft / width) : 0);
    };

    updateIndex();
    el.addEventListener("scroll", updateIndex);
    window.addEventListener("resize", updateIndex);

    return () => {
      el.removeEventListener("scroll", updateIndex);
      window.removeEventListener("resize", updateIndex);
    };
  }, []);

  useEffect(() => {
    const el = swipeRef.current;
    if (!el) return;

    const t1 = setTimeout(() => {
      if (el.scrollWidth <= el.clientWidth) return;
      el.style.scrollSnapType = "none";
      el.scrollTo({ left: 60, behavior: "smooth" });
    }, 1000);
    const t2 = setTimeout(() => {
      if (el.scrollWidth <= el.clientWidth) return;
      el.scrollTo({ left: 0, behavior: "smooth" });
    }, 1700);
    const t3 = setTimeout(() => {
      el.style.scrollSnapType = "";
    }, 2200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  // ── Drawer resize drag ──
  const handleDragStart = useCallback(
    (e) => {
      e.preventDefault();
      dragging.current = true;
      setIsResizing(true);
      const startX = e.clientX;
      const startW = drawerWidth;

      const onMove = (ev) => {
        if (!dragging.current) return;
        const delta = ev.clientX - startX;
        const newW = Math.min(Math.max(startW + delta, 360), window.innerWidth * 0.65);
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

  // ── Standard calculate handler ──
  const handleCalculate = async (data) => {
    if (autoMode) {
      return handleAutoOptimize(data);
    }

    setLoading(true);
    setError(null);

    const payload = { ...data };
    if (useCustomCatalog && customCatalog) {
      payload.custom_gpu_catalog = customCatalog;
    }

    try {
      const response = await calculateServerRequirements(payload);

      if (!response) {
        setError("No response from server. Check that the backend is running.");
        setResults(null);
        setInputData(null);
      } else if (response.error) {
        setError(response.error);
        setResults(null);
        setInputData(null);
      } else {
        const Z = payload.tp_multiplier_Z || 1;
        const gpuPerInst = response.gpus_per_instance || 1;
        const gpusPerServer = response.gpus_per_server ?? payload.gpus_per_server;
        setResults({
          ...response,
          gpus_per_server: gpusPerServer,
          gpus_per_instance: response.gpus_per_instance ?? gpuPerInst,
          gpus_per_instance_tp: Z * gpuPerInst,
          instances_per_server_tp:
            response.instances_per_server_tp ??
            Math.floor((payload.gpus_per_server || 8) / (Z * gpuPerInst)),
          instance_total_mem_gb:
            response.instance_total_mem_gb ?? Z * gpuPerInst * (payload.gpu_mem_gb || 0),
          kv_free_per_instance_tp_gb:
            response.kv_free_per_instance_tp_gb ??
            Math.max(
              0,
              Z * gpuPerInst * (payload.gpu_mem_gb || 0) * (payload.kavail || 0.9) -
                (response.model_mem_gb || 0),
            ),
          total_gpu_count:
            response.total_gpu_count ?? (response.servers_final || 0) * (gpusPerServer || 0),
        });
        setInputData(payload);
        setError(null);
        if (window.innerWidth < 1024 && swipeRef.current) {
          setTimeout(() => {
            swipeRef.current?.scrollTo({
              left: swipeRef.current.scrollWidth - swipeRef.current.clientWidth,
              behavior: "smooth",
            });
          }, 100);
        }
      }
    } catch (err) {
      setError(err.message || "Unexpected error");
      setResults(null);
      setInputData(null);
    } finally {
      setLoading(false);
    }
  };

  // ── Auto-optimize handler ──
  const handleAutoOptimize = async (data) => {
    setOptimizeLoading(true);
    setOptimizeError(null);
    setOptimizeResults(null);
    setOptimizeStats(null);
    setSelectedConfigIdx(null);
    setResults(null);
    setInputData(null);
    setError(null);

    const payload = {
      ...data,
      mode: optimizeMode,
      top_n: 30,
    };

    if (gpuFilter && gpuFilter.length > 0) {
      payload.gpu_ids = gpuFilter;
    }

    // Include custom catalog in the payload when active
    if (useCustomCatalog && customCatalog) {
      payload.custom_gpu_catalog = customCatalog;
    }

    try {
      const response = await autoOptimize(payload);

      if (response && response.error) {
        setOptimizeError(response.error);
      } else if (response && response.results) {
        setOptimizeResults(response.results);
        setOptimizeStats({
          mode: response.mode,
          total_evaluated: response.total_evaluated,
          total_valid: response.total_valid,
        });
      } else {
        setOptimizeError("Unexpected response from server.");
      }
    } catch (err) {
      setOptimizeError(err.message || "Unexpected error");
    } finally {
      setOptimizeLoading(false);
    }
  };

  // ── Generic VLM/OCR submit handler ──
  const handleSpecialSizingResponse = (response, payload) => {
    if (!response) {
      setError("No response from server. Check that the backend is running.");
      setResults(null);
      setInputData(null);
      return;
    }
    if (response.error) {
      setError(response.error);
      setResults(null);
      setInputData(null);
      return;
    }
    setResults({
      ...response,
      gpus_per_server: response.gpus_per_server ?? payload.gpus_per_server,
    });
    setInputData(payload);
    setError(null);
    if (window.innerWidth < 1024 && swipeRef.current) {
      setTimeout(() => {
        swipeRef.current?.scrollTo({
          left: swipeRef.current.scrollWidth - swipeRef.current.clientWidth,
          behavior: "smooth",
        });
      }, 100);
    }
  };

  // ── VLM calculate handler ──
  const handleVLMCalculate = async (data) => {
    setLoading(true);
    setError(null);
    try {
      const response = await calculateVLMSizing(data);
      handleSpecialSizingResponse(response, data);
    } catch (err) {
      setError(err.message || "Unexpected error");
      setResults(null);
      setInputData(null);
    } finally {
      setLoading(false);
    }
  };

  // ── OCR + LLM calculate handler ──
  const handleOCRCalculate = async (data) => {
    setLoading(true);
    setError(null);
    try {
      const response = await calculateOCRSizing(data);
      handleSpecialSizingResponse(response, data);
    } catch (err) {
      setError(err.message || "Unexpected error");
      setResults(null);
      setInputData(null);
    } finally {
      setLoading(false);
    }
  };

  // ── Handle selecting a row in the optimization table ──
  const handleSelectRow = useCallback(
    async (idx) => {
      if (!optimizeResults || !optimizeResults[idx]) return;

      setSelectedConfigIdx(idx);
      const config = optimizeResults[idx];

      const configForForm = {};
      if (config.sizing_input) {
        Object.assign(configForForm, config.sizing_input);
      } else {
        configForForm.gpu_mem_gb = config.gpu_mem_gb;
        configForForm.gpu_flops_Fcount = config.gpu_tflops;
        configForForm.gpus_per_server = config.gpus_per_server;
        configForForm.tp_multiplier_Z = config.tp_multiplier_Z;
        configForForm.bytes_per_param = config.bytes_per_param;
      }

      // Attach GPU display info so the form can reconstruct selectedGpu
      configForForm._gpuInfo = {
        id: config.gpu_id,
        full_name: config.gpu_name,
        memory_gb: config.gpu_mem_gb,
        tflops: config.gpu_tflops,
      };

      setAppliedConfig(configForForm);

      setLoading(true);
      setError(null);

      try {
        const response = await calculateServerRequirements(config.sizing_input || configForForm);

        if (!response) {
          setError("No response from server.");
          setResults(null);
          setInputData(null);
        } else if (response.error) {
          setError(response.error);
          setResults(null);
          setInputData(null);
        } else {
          const Z = (config.sizing_input || configForForm).tp_multiplier_Z || 1;
          const gpuPerInst = response.gpus_per_instance || 1;
          const fullInput = config.sizing_input || configForForm;
          const gpusPerServer = response.gpus_per_server ?? fullInput.gpus_per_server;
          setResults({
            ...response,
            gpus_per_server: gpusPerServer,
            gpus_per_instance: response.gpus_per_instance ?? gpuPerInst,
            gpus_per_instance_tp: Z * gpuPerInst,
            instances_per_server_tp:
              response.instances_per_server_tp ??
              Math.floor((fullInput.gpus_per_server || 8) / (Z * gpuPerInst)),
            instance_total_mem_gb:
              response.instance_total_mem_gb ?? Z * gpuPerInst * (fullInput.gpu_mem_gb || 0),
            kv_free_per_instance_tp_gb:
              response.kv_free_per_instance_tp_gb ??
              Math.max(
                0,
                Z * gpuPerInst * (fullInput.gpu_mem_gb || 0) * (fullInput.kavail || 0.9) -
                  (response.model_mem_gb || 0),
              ),
            total_gpu_count:
              response.total_gpu_count ?? (response.servers_final || 0) * (gpusPerServer || 0),
            cost_estimate_usd: response.cost_estimate_usd ?? config.cost_estimate_usd ?? null,
          });
          setInputData(fullInput);
          setError(null);
          if (window.innerWidth < 1024 && swipeRef.current) {
            setTimeout(() => {
              swipeRef.current?.scrollTo({
                left: swipeRef.current.scrollWidth - swipeRef.current.clientWidth,
                behavior: "smooth",
              });
            }, 100);
          }
        }
      } catch (err) {
        setError(err.message || "Unexpected error");
        setResults(null);
        setInputData(null);
      } finally {
        setLoading(false);
      }
    },
    [optimizeResults],
  );

  const handleAppliedConfigConsumed = useCallback(() => {
    setAppliedConfig(null);
  }, []);

  const handleGpuFilterApply = useCallback((selectedIds) => {
    setGpuFilter(selectedIds);
  }, []);

  return (
    <>
      <div className="flex justify-center gap-2 mb-3 lg:hidden">
        <button
          type="button"
          onClick={() => swipeRef.current?.scrollTo({ left: 0, behavior: "smooth" })}
          className={`w-2.5 h-2.5 rounded-full transition-colors ${
            swipeIndex === 0 ? "bg-accent" : "bg-subtle hover:bg-muted"
          }`}
          aria-label="Configuration"
          title="Configuration"
        />
        <button
          type="button"
          onClick={() => {
            const el = swipeRef.current;
            if (el) {
              el.scrollTo({ left: el.scrollWidth - el.clientWidth, behavior: "smooth" });
            }
          }}
          className={`w-2.5 h-2.5 rounded-full transition-colors ${
            swipeIndex === 1 ? "bg-accent" : "bg-subtle hover:bg-muted"
          }`}
          aria-label="Results"
          title="Results"
        />
      </div>

      {/* ── Main 2-column: swipe on mobile, grid on desktop ── */}
      <div
        ref={swipeRef}
        className="grid grid-flow-col auto-cols-[100%] overflow-x-auto snap-x snap-mandatory lg:grid-flow-row lg:grid-cols-2 lg:auto-cols-auto lg:overflow-visible lg:gap-8 swipe-panels"
      >
        <div className="snap-start overflow-hidden">
          <div className="bg-surface border border-border rounded-xl shadow-card p-4 sm:p-6 flex flex-col overflow-hidden">
            <ModeSwitcher mode={mode} onChange={handleModeChange} />
            {mode === "llm" && (
              <CalculatorForm
                onSubmit={handleCalculate}
                loading={autoMode ? optimizeLoading : loading}
                autoMode={autoMode}
                setAutoMode={setAutoMode}
                optimizeMode={optimizeMode}
                setOptimizeMode={setOptimizeMode}
                gpuFilter={gpuFilter}
                onOpenGpuFilter={() => {
                  setGpuModalMode("filter");
                  setGpuModalOpen(true);
                }}
                onOpenGpuPicker={(selectedGpuId) => {
                  setGpuPickerInitialId(selectedGpuId || null);
                  setGpuModalMode("picker");
                  setGpuModalOpen(true);
                }}
                gpuPickerResult={gpuPickerResult}
                onClearGpuPickerResult={() => setGpuPickerResult(null)}
                appliedConfig={appliedConfig}
                onAppliedConfigConsumed={handleAppliedConfigConsumed}
              />
            )}
            {mode === "vlm" && (
              <VLMCalculatorForm
                onSubmit={handleVLMCalculate}
                loading={loading}
                onOpenGpuPicker={(selectedGpuId) => {
                  setGpuPickerInitialId(selectedGpuId || null);
                  setGpuModalMode("picker");
                  setGpuModalOpen(true);
                }}
                gpuPickerResult={gpuPickerResult}
                onClearGpuPickerResult={() => setGpuPickerResult(null)}
              />
            )}
            {mode === "ocr" && (
              <OCRCalculatorForm
                onSubmit={handleOCRCalculate}
                loading={loading}
                onOpenGpuPicker={(selectedGpuId) => {
                  setGpuPickerInitialId(selectedGpuId || null);
                  setGpuModalMode("picker");
                  setGpuModalOpen(true);
                }}
                gpuPickerResult={gpuPickerResult}
                onClearGpuPickerResult={() => setGpuPickerResult(null)}
              />
            )}
          </div>
        </div>

        <div className="snap-start overflow-hidden">
          <div className="bg-surface border border-border rounded-xl shadow-card p-4 sm:p-6 flex flex-col overflow-hidden">
            {mode === "vlm" && (
              <VLMResultsDisplay
                results={results}
                loading={loading}
                error={error}
                inputData={inputData}
              />
            )}
            {mode === "ocr" && (
              <OCRResultsDisplay
                results={results}
                loading={loading}
                error={error}
                inputData={inputData}
              />
            )}
            {mode === "llm" && (
              <ResultsDisplay
                results={results}
                loading={loading}
                error={error}
                inputData={inputData}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Optimization Results Side Panel (LLM mode only) ── */}
      {autoMode && mode === "llm" && (
        <>
          {/* Panel + toggle as one unit so they move together */}
          <div
            className="fixed left-0 top-0 h-full z-[9998]"
            style={{
              width: Math.min(drawerWidth, window.innerWidth * 0.65),
              transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
              transition: isResizing ? "none" : "transform 0.3s ease-in-out",
            }}
          >
            {/* Panel body */}
            <div className="absolute inset-0 bg-surface shadow-elevated flex flex-col">
              {/* Drag handle — right edge */}
              <div
                onMouseDown={handleDragStart}
                className="absolute right-0 top-0 h-full w-2 cursor-col-resize z-10 group"
                title="Drag to resize"
              >
                <div className="absolute right-0 top-0 h-full w-1 bg-transparent group-hover:bg-accent/50 transition-colors" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-accent"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <h2 className="text-lg font-semibold text-fg">Optimization Results</h2>
                </div>
              </div>

              {/* Table content */}
              <div className="relative flex-1 overflow-y-auto">
                <div className="p-6">
                  <OptimizeResultsTable
                    results={optimizeResults}
                    loading={optimizeLoading}
                    error={optimizeError}
                    stats={optimizeStats}
                    selectedIdx={selectedConfigIdx}
                    onSelectRow={(idx) => {
                      handleSelectRow(idx);
                    }}
                    embedded
                  />
                </div>
                {isResizing && <div className="absolute inset-0" />}
              </div>
            </div>

            {/* ── Edge toggle tab (inside same container = moves perfectly in sync) ── */}
            <button
              type="button"
              data-tour="optimize-results"
              onClick={() => setDrawerOpen((prev) => !prev)}
              className="absolute top-1/2 -translate-y-1/2 h-16 w-6 flex items-center justify-center bg-accent hover:bg-accent/90 text-accent-fg rounded-r-lg shadow-card-hover"
              style={{ left: "100%" }}
              title={drawerOpen ? "Collapse results panel" : "Show results panel"}
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-300 ${drawerOpen ? "" : "rotate-180"}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          </div>
        </>
      )}

      {/* GPU Filter / Picker Modal */}
      <GpuFilterModal
        isOpen={gpuModalOpen}
        onClose={() => setGpuModalOpen(false)}
        selectedGpuIds={
          gpuModalMode === "picker" ? (gpuPickerInitialId ? [gpuPickerInitialId] : []) : gpuFilter
        }
        onApply={(ids, singleGpuObj) => {
          if (gpuModalMode === "picker") {
            setGpuPickerResult(singleGpuObj || null);
          } else {
            handleGpuFilterApply(ids);
          }
          setGpuModalOpen(false);
        }}
        singleSelection={gpuModalMode === "picker"}
        modalTitle="Select GPU"
        modalSubtitle="Choose one GPU for calculation"
        customCatalog={customCatalog}
        customCatalogName={customCatalogName}
        useCustomCatalog={useCustomCatalog}
        onCustomCatalogUpload={handleCustomCatalogUpload}
        onCustomCatalogToggle={handleCustomCatalogToggle}
      />
    </>
  );
};

export default Calculator;
