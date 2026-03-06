import React, { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { getGPUs, exportGpuCatalog } from "../services/api";

/**
 * GpuFilterModal — GPU selection for auto-optimization + catalog management.
 *
 * Props:
 *   singleSelection      — if true, only one GPU can be selected (for normal calc mode)
 *   modalTitle           — optional title when singleSelection (e.g. "Select GPU")
 *   modalSubtitle        — optional subtitle when singleSelection
 *   customCatalog, customCatalogName, useCustomCatalog, onCustomCatalogUpload, onCustomCatalogToggle
 */
const GpuFilterModal = ({
  isOpen,
  onClose,
  selectedGpuIds,
  onApply,
  singleSelection = false,
  modalTitle,
  modalSubtitle,
  customCatalog,
  customCatalogName,
  useCustomCatalog,
  onCustomCatalogUpload,
  onCustomCatalogToggle,
}) => {
  const [gpuCatalog, setGpuCatalog] = useState([]);
  const [loadingGpus, setLoadingGpus] = useState(false);
  const [search, setSearch] = useState("");
  const initialIds = singleSelection ? (selectedGpuIds || []).slice(0, 1) : selectedGpuIds || [];
  const [selected, setSelected] = useState(new Set(initialIds));
  const [uploadError, setUploadError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [hoveredInfoGpuId, setHoveredInfoGpuId] = useState(null);
  const fileInputRef = useRef(null);

  // Deduplicate by (display name, memory_gb) so same GPU doesn't appear multiple times
  const deduplicateCatalog = (gpus) => {
    const seen = new Map();
    const result = [];
    for (const g of gpus) {
      const name = g.full_name || g.name || `${g.vendor || ""} ${g.model || ""}`.trim();
      const key = `${name}|${g.memory_gb}`;
      if (seen.has(key)) continue;
      seen.set(key, true);
      result.push(g);
    }
    return result;
  };

  // ── Build GPU list from either default (API) or custom (local) catalog ──
  useEffect(() => {
    if (!isOpen) return;
    const ids = singleSelection ? (selectedGpuIds || []).slice(0, 1) : selectedGpuIds || [];
    setSelected(new Set(ids));
    setSearch("");
    setUploadError(null);

    if (useCustomCatalog && customCatalog) {
      // Parse custom catalog locally (array of GPU objects)
      const arr = Array.isArray(customCatalog) ? customCatalog : Object.values(customCatalog);
      const modelName = (info) => info.model_name || info.model || info.name || "Unknown";
      const gpusRaw = arr
        .map((info, idx) => ({
          id:
            info.id ||
            `custom-${(info.vendor || "unknown").toLowerCase()}-${String(info.model_name || info.model || info.name || "unknown").replace(/\s+/g, "-")}-${info.memory_gb || 0}-${idx}`,
          vendor: info.vendor || "Unknown",
          model: modelName(info),
          full_name: `${info.vendor || "Unknown"} ${modelName(info)}`.trim(),
          memory_gb: info.memory_gb || 0,
          tflops: info.tflops_fp16 || info.tflops_fp32 || info.tflops || null,
          price_usd: info.price_usd != null ? Number(info.price_usd) : null,
        }))
        .filter((g) => g.memory_gb > 0);
      setGpuCatalog(deduplicateCatalog(gpusRaw));
      setLoadingGpus(false);
    } else {
      // Load from API (default catalog)
      const load = async () => {
        setLoadingGpus(true);
        try {
          let allGpus = [];
          let page = 1;
          let hasNext = true;

          while (hasNext) {
            const data = await getGPUs({ per_page: 100, page });
            if (data && data.gpus) {
              allGpus = allGpus.concat(data.gpus);
              hasNext = data.has_next === true;
              page++;
            } else {
              hasNext = false;
            }
          }

          setGpuCatalog(deduplicateCatalog(allGpus));
        } catch (err) {
          console.error("Failed to load GPU catalog:", err);
        } finally {
          setLoadingGpus(false);
        }
      };
      load();
    }
  }, [isOpen, selectedGpuIds, useCustomCatalog, customCatalog, singleSelection]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // ── Filter GPU list by search query (single source of truth for display name) ──
  const getGpuDisplayName = (gpu) =>
    gpu.full_name || gpu.name || `${gpu.vendor || ""} ${gpu.model || ""}`.trim() || "Unknown";

  const formatGpuInfoTooltip = (gpu) => {
    const lines = [];
    const name = getGpuDisplayName(gpu);
    if (name) lines.push(`Name: ${name}`);
    if (gpu.vendor) lines.push(`Vendor: ${gpu.vendor}`);
    if (gpu.model) lines.push(`Model: ${gpu.model}`);
    lines.push(`Memory: ${gpu.memory_gb} GB`);
    if (gpu.tflops != null) lines.push(`TFLOPS: ${gpu.tflops}`);
    if (gpu.price_usd != null && gpu.price_usd !== "") {
      lines.push(`Price: $${Number(gpu.price_usd).toLocaleString()}`);
    } else {
      lines.push("Price: not specified");
    }
    if (gpu.memory_type) lines.push(`Memory type: ${gpu.memory_type}`);
    if (gpu.tdp_watts) lines.push(`TDP: ${gpu.tdp_watts}`);
    if (gpu.launch_date) lines.push(`Launch: ${gpu.launch_date}`);
    return lines.join("\n");
  };

  const filteredGpus = gpuCatalog.filter((gpu) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const name = getGpuDisplayName(gpu).toLowerCase();
    return name.includes(q);
  });

  const toggleGpu = useCallback(
    (gpuId) => {
      setSelected((prev) => {
        if (singleSelection) {
          if (prev.has(gpuId)) return new Set();
          return new Set([gpuId]);
        }
        const next = new Set(prev);
        if (next.has(gpuId)) {
          next.delete(gpuId);
        } else {
          next.add(gpuId);
        }
        return next;
      });
    },
    [singleSelection],
  );

  const handleSelectAll = () => {
    if (singleSelection) return; // no "select all" in single mode
    setSelected(new Set(filteredGpus.map((g) => g.id)));
  };

  const handleClear = () => {
    setSelected(new Set());
  };

  const handleApply = () => {
    const ids = Array.from(selected);
    if (singleSelection && ids.length > 0) {
      const gpuObj = gpuCatalog.find((g) => g.id === ids[0]) || null;
      onApply(ids, gpuObj);
    } else {
      onApply(ids);
    }
    onClose();
  };

  // ── Download default catalog ──
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const data = await exportGpuCatalog();
      if (data && data.error) {
        setUploadError(data.error);
        return;
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "gpu_catalog.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setUploadError("Failed to download catalog");
    } finally {
      setDownloading(false);
    }
  };

  // ── Upload custom catalog ──
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);

        // Validate structure: must be an array of GPU objects
        if (!Array.isArray(parsed)) {
          setUploadError("Invalid format: expected a JSON array of GPU objects.");
          return;
        }

        if (parsed.length === 0) {
          setUploadError("Catalog is empty.");
          return;
        }

        const first = parsed[0];
        if (typeof first !== "object" || !first.memory_gb) {
          setUploadError('Invalid catalog: entries must have "memory_gb" field.');
          return;
        }

        onCustomCatalogUpload(parsed, file.name);
      } catch (err) {
        setUploadError(`Failed to parse JSON: ${err.message}`);
      }
    };
    reader.onerror = () => {
      setUploadError("Failed to read file");
    };
    reader.readAsText(file);

    // Reset the input so same file can be re-uploaded
    e.target.value = "";
  };

  // Count GPUs in each catalog
  const defaultCatalogCount = !useCustomCatalog ? gpuCatalog.length : null;
  const customCatalogCount = customCatalog
    ? Array.isArray(customCatalog)
      ? customCatalog.length
      : Object.keys(customCatalog).length
    : 0;

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <svg
                className="w-5 h-5 text-purple-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              {singleSelection ? modalTitle || "Select GPU" : "GPU Filter"}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {singleSelection
                ? modalSubtitle || "Choose one GPU for calculation"
                : "Select GPUs to include in optimization search"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
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

        {/* ── Catalog Source Section ── */}
        <div className="px-6 py-3 border-b border-gray-100 shrink-0 bg-gray-50/70">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Catalog Source
          </div>

          {/* Radio: Default */}
          <label
            className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
              !useCustomCatalog ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-gray-100"
            }`}
          >
            <input
              type="radio"
              name="catalogSource"
              checked={!useCustomCatalog}
              onChange={() => onCustomCatalogToggle(false)}
              className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800">
                Default Catalog
                {defaultCatalogCount != null && (
                  <span className="ml-1.5 text-xs font-normal text-gray-400">
                    ({defaultCatalogCount} GPUs)
                  </span>
                )}
              </div>
            </div>
          </label>

          {/* Radio: Custom */}
          <label
            className={`flex items-center gap-3 px-3 py-2 mt-1 rounded-lg transition-colors ${
              customCatalog ? "cursor-pointer" : "opacity-50 cursor-not-allowed"
            } ${useCustomCatalog ? "bg-indigo-50 ring-1 ring-indigo-200" : customCatalog ? "hover:bg-gray-100" : ""}`}
          >
            <input
              type="radio"
              name="catalogSource"
              checked={useCustomCatalog}
              disabled={!customCatalog}
              onChange={() => onCustomCatalogToggle(true)}
              className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800">
                Custom Catalog
                {customCatalog ? (
                  <span className="ml-1.5 text-xs font-normal text-gray-400">
                    {customCatalogName} ({customCatalogCount} GPUs)
                  </span>
                ) : (
                  <span className="ml-1.5 text-xs font-normal text-gray-400">Not uploaded</span>
                )}
              </div>
            </div>
          </label>

          {/* Download / Upload buttons */}
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              {downloading ? "Downloading..." : "Download Default"}
            </button>

            <button
              type="button"
              onClick={handleUploadClick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              Upload Custom
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Upload error */}
          {uploadError && (
            <div className="mt-2 text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-lg">
              {uploadError}
            </div>
          )}
        </div>

        {/* Search + controls */}
        <div className="px-6 py-3 border-b border-gray-100 shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search GPUs..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-purple-400"
            autoFocus
          />
          <div className="flex items-center justify-between mt-2">
            <div className="flex gap-2">
              {!singleSelection && (
                <>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    Select All ({filteredGpus.length})
                  </button>
                  <span className="text-gray-300">|</span>
                </>
              )}
              <button
                type="button"
                onClick={handleClear}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                Clear
              </button>
            </div>
            <span className="text-xs text-gray-400">{selected.size} selected</span>
          </div>
        </div>

        {/* GPU List */}
        <div className="flex-1 overflow-y-auto px-6 py-2">
          {loadingGpus ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
            </div>
          ) : filteredGpus.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">No GPUs match your search</div>
          ) : (
            <div className="space-y-1">
              {filteredGpus.map((gpu) => {
                const isChecked = selected.has(gpu.id);
                const name = getGpuDisplayName(gpu);
                return (
                  <label
                    key={gpu.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      isChecked ? "bg-purple-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleGpu(gpu.id)}
                      className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{name}</div>
                      <div className="text-xs text-gray-400">
                        {gpu.memory_gb} GB
                        {gpu.tflops ? ` | ${gpu.tflops} TFLOPS` : ""}
                        {" | "}
                        {gpu.price_usd != null && gpu.price_usd !== ""
                          ? `$${Number(gpu.price_usd).toLocaleString()}`
                          : "not specified"}
                      </div>
                    </div>
                    <span
                      className="relative flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full border border-gray-400 text-gray-500 text-xs font-normal cursor-help hover:border-purple-400 hover:text-purple-600 transition-colors"
                      onMouseEnter={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setHoveredInfoGpuId(gpu.id);
                      }}
                      onMouseLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setHoveredInfoGpuId(null);
                      }}
                    >
                      i
                      {hoveredInfoGpuId === gpu.id && (
                        <div
                          className="absolute right-full top-0 mr-1.5 z-[10001] px-3 py-2 text-left text-xs font-normal text-white bg-gray-800 rounded-lg shadow-lg whitespace-pre-line min-w-[200px] max-w-[280px] pointer-events-none"
                          style={{ lineHeight: 1.5 }}
                        >
                          {formatGpuInfoTooltip(gpu)}
                        </div>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2 text-sm font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
          >
            Apply{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default GpuFilterModal;
