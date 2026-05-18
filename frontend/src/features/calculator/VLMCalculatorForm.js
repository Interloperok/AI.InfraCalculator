import React, { useState, useEffect, useCallback } from "react";
import { useT } from "../../contexts/I18nContext";

// Matches CalculatorForm InfoTooltip styling.
const InfoTooltip = ({ text }) => (
  <span className="relative group/tip inline-flex items-center ml-1.5 align-middle">
    <svg
      className="w-4 h-4 text-subtle hover:text-accent cursor-help transition-colors"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
    <span className="invisible group-hover/tip:visible opacity-0 group-hover/tip:opacity-100 transition-opacity duration-200 absolute z-[9999] bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 text-[11px] font-normal normal-case tracking-normal text-white bg-slate-900 dark:bg-slate-800 rounded-md shadow-elevated w-60 text-center leading-relaxed pointer-events-none">
      {text}
      <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-800" />
    </span>
  </span>
);

const CARD_COLOR_MAP = {
  blue: { selected: "border-blue-500 bg-blue-50 text-blue-700" },
  emerald: { selected: "border-green-500 bg-green-50 text-green-700" },
  rose: { selected: "border-rose-500 bg-rose-50 text-rose-700" },
  violet: { selected: "border-violet-500 bg-violet-50 text-violet-700" },
  amber: { selected: "border-amber-500 bg-amber-50 text-amber-700" },
  indigo: { selected: "border-indigo-500 bg-indigo-50 text-indigo-700" },
};

const SECTION_STYLES = {
  blue: {
    section:
      "bg-blue-50 rounded-lg p-4 border border-blue-200 dark:bg-surface dark:border-border dark:rounded-xl dark:p-5",
    dot: "bg-blue-500",
  },
  emerald: {
    section:
      "bg-green-50 rounded-lg p-4 border border-green-200 dark:bg-surface dark:border-border dark:rounded-xl dark:p-5",
    dot: "bg-green-500",
  },
  green: {
    section:
      "bg-green-50 rounded-lg p-4 border border-green-200 dark:bg-surface dark:border-border dark:rounded-xl dark:p-5",
    dot: "bg-green-500",
  },
  purple: {
    section:
      "bg-purple-50 rounded-lg p-4 border border-purple-200 dark:bg-surface dark:border-border dark:rounded-xl dark:p-5",
    dot: "bg-purple-500",
  },
  orange: {
    section:
      "bg-orange-50 rounded-lg p-4 border border-orange-200 dark:bg-surface dark:border-border dark:rounded-xl dark:p-5",
    dot: "bg-orange-500",
  },
  amber: {
    section:
      "bg-amber-50 rounded-lg p-4 border border-amber-200 dark:bg-surface dark:border-border dark:rounded-xl dark:p-5",
    dot: "bg-amber-500",
  },
};

const QUANTIZATION_OPTIONS = [
  { label: "FP16 / BF16 (2 B/param)", value: 2 },
  { label: "FP8 (1 B/param)", value: 1 },
  { label: "INT4 / AWQ (0.5 B/param)", value: 0.5 },
];

const DEFAULTS = {
  lambda_online: 1.0,
  c_peak: 4,
  sla_page: 5.0,
  w_px: 1240,
  h_px: 1754,
  patch_eff: 28,
  n_ch: 1,
  n_prompt_txt: 200,
  n_fields: 20,
  tok_field: 50,
  params_billions: 7,
  bytes_per_param: 2,
  layers_L: 32,
  hidden_size_H: 4096,
  num_kv_heads: 32,
  num_attention_heads: 32,
  bytes_per_kv_state: 2,
  max_context_window_TSmax: 32768,
  gpu_mem_gb: 80,
  gpu_id: undefined,
  gpus_per_server: 8,
  kavail: 0.9,
  tp_multiplier_Z: 1,
  gpu_flops_Fcount: 312,
};

export const VLM_PRESETS = [
  {
    id: "vlm_a4_form_1pps",
    name: "A4 form / 1 pps",
    subtitle: "Qwen2.5-VL 7B · A100 80GB",
    description: "A4 document form (150 dpi, 20 fields), Qwen2.5-VL 7B, A100 80GB single GPU.",
    color: "indigo",
    gpu: {
      id: "preset-a100-80",
      vendor: "NVIDIA",
      model: "A100 80GB PCIe",
      full_name: "NVIDIA A100 80GB PCIe",
      memory_gb: 80,
      tflops: 312,
    },
    data: {
      lambda_online: 1.0,
      c_peak: 4,
      sla_page: 5.0,
      w_px: 1240,
      h_px: 1754,
      patch_eff: 28,
      n_ch: 1,
      n_prompt_txt: 200,
      n_fields: 20,
      tok_field: 50,
      params_billions: 7,
      bytes_per_param: 2,
      layers_L: 32,
      hidden_size_H: 4096,
      num_kv_heads: 32,
      num_attention_heads: 32,
      bytes_per_kv_state: 2,
      max_context_window_TSmax: 32768,
      gpu_mem_gb: 80,
      gpus_per_server: 8,
      kavail: 0.9,
      tp_multiplier_Z: 1,
      gpu_flops_Fcount: 312,
    },
  },
  {
    id: "vlm_receipts_5pps",
    name: "Receipts / 5 pps",
    subtitle: "InternVL-2.5 4B · A100 80GB",
    description: "Receipt extraction (small image, 8 fields, 2 sec SLA), InternVL-2.5 4B.",
    color: "emerald",
    gpu: {
      id: "preset-a100-80",
      vendor: "NVIDIA",
      model: "A100 80GB PCIe",
      full_name: "NVIDIA A100 80GB PCIe",
      memory_gb: 80,
      tflops: 312,
    },
    data: {
      lambda_online: 5.0,
      c_peak: 20,
      sla_page: 2.0,
      w_px: 800,
      h_px: 1200,
      patch_eff: 28,
      n_ch: 1,
      n_prompt_txt: 100,
      n_fields: 8,
      tok_field: 30,
      params_billions: 4,
      bytes_per_param: 2,
      layers_L: 32,
      hidden_size_H: 3072,
      num_kv_heads: 16,
      num_attention_heads: 32,
      bytes_per_kv_state: 2,
      max_context_window_TSmax: 16384,
      gpu_mem_gb: 80,
      gpus_per_server: 8,
      kavail: 0.9,
      tp_multiplier_Z: 1,
      gpu_flops_Fcount: 312,
    },
  },
];


const INTEGER_FIELDS = new Set([
  "c_peak", "w_px", "h_px", "patch_eff", "n_prompt_txt", "n_fields", "tok_field",
  "layers_L", "hidden_size_H", "num_kv_heads", "num_attention_heads",
  "max_context_window_TSmax", "gpu_mem_gb", "gpu_flops_Fcount",
]);

const GPU_PER_SERVER_ALLOWED = [1, 2, 4, 6, 8];
const TP_ALLOWED = [1, 2, 4, 6, 8];

const nearestAllowedIndex = (allowed, value) =>
  Math.max(
    0,
    allowed.indexOf(value) !== -1
      ? allowed.indexOf(value)
      : allowed.reduce(
          (best, v, i) =>
            Math.abs(v - value) < Math.abs(allowed[best] - value) ? i : best,
          0,
        ),
  );

const SliderInput = ({ name, label, value, onChange, min, max, step, unit, hint, tooltip }) => {
  const isInteger = INTEGER_FIELDS.has(name);
  const numericValue = value ?? min;

  const commit = (raw) => {
    if (raw === "") {
      onChange(name, "");
      return;
    }
    let next = isInteger ? Math.round(parseFloat(raw) || 0) : parseFloat(raw) || 0;
    if (!Number.isNaN(next)) {
      next = Math.min(Math.max(next, min), max);
      onChange(name, next);
    }
  };

  return (
    <div className="mb-6" key={name}>
      <div className="flex justify-between items-center gap-3 mb-2">
        <label
          className="text-sm font-medium text-fg flex items-center min-w-0 flex-wrap gap-x-1"
          htmlFor={`vlm-${name}`}
        >
          <span className="truncate">{label}</span>
          {hint && <span className="text-subtle font-normal">· {hint}</span>}
          {tooltip && <InfoTooltip text={tooltip} />}
        </label>
        <div className="flex items-center gap-1.5 shrink-0 w-[120px] justify-end">
          <input
            id={`vlm-${name}`}
            type="number"
            min={min}
            max={max}
            step={isInteger ? 1 : step ?? "any"}
            value={numericValue}
            onChange={(e) => commit(e.target.value)}
            className="px-2 py-1 text-sm border border-border-strong rounded-md text-right bg-surface text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full"
            inputMode={isInteger ? "numeric" : "decimal"}
          />
          {unit && (
            <span className="text-xs text-muted font-medium w-7 shrink-0 text-left">{unit}</span>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={numericValue}
        onChange={(e) =>
          onChange(name, isInteger ? Math.round(Number(e.target.value)) : Number(e.target.value))
        }
        className="w-full rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
      <div className="flex justify-between text-xs text-muted mt-1">
        <span>
          {typeof min === "number" && min >= 1000 ? min.toLocaleString() : min}
          {unit}
        </span>
        <span>
          {typeof max === "number" && max >= 1000 ? max.toLocaleString() : max}
          {unit}
        </span>
      </div>
    </div>
  );
};

const DiscreteSliderInput = ({ name, label, value, allowed, onChange, hint, tooltip }) => {
  const currentIdx = nearestAllowedIndex(allowed, value);
  const displayVal = allowed[currentIdx];

  return (
    <div className="mb-6" key={name}>
      <div className="flex justify-between items-center gap-3 mb-2">
        <label className="text-sm font-medium text-fg flex items-center min-w-0 flex-wrap gap-x-1">
          <span className="truncate">{label}</span>
          {hint && <span className="text-subtle font-normal">· {hint}</span>}
          {tooltip && <InfoTooltip text={tooltip} />}
        </label>
        <div className="flex items-center w-[120px] justify-end">
          <span className="px-2 py-1 text-sm border border-border-strong rounded-md text-center font-medium w-full bg-surface text-fg">
            {displayVal}
          </span>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={allowed.length - 1}
        step={1}
        value={currentIdx}
        onChange={(e) => onChange(name, allowed[parseInt(e.target.value, 10)])}
        className="w-full rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
      <div className="flex justify-between text-xs text-muted mt-1">
        <span>{allowed[0]}</span>
        <span>{allowed[allowed.length - 1]}</span>
      </div>
    </div>
  );
};

const SelectInput = ({ name, label, value, options, onChange }) => (
  <div>
    <label className="block text-sm font-medium text-fg mb-2" htmlFor={`vlm-${name}`}>
      {label}
    </label>
    <select
      id={`vlm-${name}`}
      name={name}
      value={value}
      onChange={(e) => onChange(name, Number(e.target.value))}
      className="w-full px-3 py-2 text-sm border border-border rounded-md shadow-sm bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </div>
);

const Section = ({ title, color = "blue", dataTour, children }) => {
  const styles = SECTION_STYLES[color] || SECTION_STYLES.blue;
  return (
    <section className={styles.section} data-tour={dataTour}>
      <header className="flex items-center gap-2 mb-4">
        <span className={`h-2 w-2 rounded-full shrink-0 ${styles.dot}`} aria-hidden />
        <h3 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-muted">
          {title}
        </h3>
      </header>
      <div className="space-y-1">{children}</div>
    </section>
  );
};

const VLMCalculatorForm = ({
  onSubmit,
  loading,
  onOpenGpuPicker,
  gpuPickerResult,
  onClearGpuPickerResult,
}) => {
  const t = useT();
  const [formData, setFormData] = useState(DEFAULTS);
  const [selectedGpu, setSelectedGpu] = useState(null);
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [validationError, setValidationError] = useState(null);
  const [activeTab, setActiveTab] = useState("basic");

  const handleGpuSelect = useCallback((gpu) => {
    setSelectedGpu(gpu);
    setFormData((prev) => ({
      ...prev,
      gpu_id: gpu.id,
      gpu_mem_gb: gpu.memory_gb,
      gpus_per_server: gpu.recommended_gpus_per_server || prev.gpus_per_server,
      gpu_flops_Fcount: gpu.tflops ?? prev.gpu_flops_Fcount,
    }));
  }, []);

  // Apply GPU picked from modal
  useEffect(() => {
    if (!gpuPickerResult || !onClearGpuPickerResult) return;
    const gpu = {
      ...gpuPickerResult,
      recommended_gpus_per_server: gpuPickerResult.recommended_gpus_per_server ?? 8,
      memory_size_formatted:
        gpuPickerResult.memory_size_formatted || `${gpuPickerResult.memory_gb} GB`,
    };
    handleGpuSelect(gpu);
    onClearGpuPickerResult();
  }, [gpuPickerResult, onClearGpuPickerResult, handleGpuSelect]);

  const handleFieldChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setSelectedPreset(null);
  };

  const applyPreset = (preset) => {
    setFormData({ ...DEFAULTS, ...preset.data });
    setSelectedGpu(preset.gpu);
    setSelectedPreset(preset.id);
    setValidationError(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setValidationError(null);

    const requiredNumeric = [
      "lambda_online",
      "c_peak",
      "sla_page",
      "w_px",
      "h_px",
      "n_fields",
      "params_billions",
      "layers_L",
      "hidden_size_H",
      "gpu_mem_gb",
      "gpus_per_server",
    ];
    for (const f of requiredNumeric) {
      if (formData[f] == null || formData[f] === "" || Number(formData[f]) <= 0) {
        setValidationError(t("vmForm.invalidValue").replace("{field}", f));
        return;
      }
    }

    onSubmit(formData);
  };

  const basicInputs = (
    <div className="space-y-4">
      <Section title={t("form.section.users")} color="blue" dataTour="vlm-workload">
        <SliderInput
          name="lambda_online"
          label={t("vmForm.pagesPerSecond")}
          value={formData.lambda_online}
          onChange={handleFieldChange}
          min={0.1}
          max={50}
          step={0.1}
          unit="pps"
          tooltip={t("vmForm.pagesPerSecond.tooltip")}
        />
        <SliderInput
          name="c_peak"
          label={t("vmForm.peakConcurrent")}
          value={formData.c_peak}
          onChange={handleFieldChange}
          min={1}
          max={100}
          step={1}
          tooltip={t("vmForm.peakConcurrent.tooltip")}
        />
      </Section>

      <Section title={t("form.section.model")} color="green">
        <SliderInput
          name="params_billions"
          label={t("vmForm.parameters")}
          value={formData.params_billions}
          onChange={handleFieldChange}
          min={0.1}
          max={200}
          step={0.1}
          unit="B"
        />
        <div className="mb-6">
          <SelectInput
            name="bytes_per_param"
            label={t("vmForm.quantization")}
            value={formData.bytes_per_param}
            options={QUANTIZATION_OPTIONS}
            onChange={handleFieldChange}
          />
        </div>
      </Section>

      <Section title={t("form.section.hardware")} color="purple" dataTour="vlm-hardware">
        <div className="mb-6">
          <label className="block text-sm font-medium text-fg mb-2">
            {t("vmForm.gpuModel")}
          </label>
          <button
            type="button"
            onClick={() => onOpenGpuPicker?.(selectedGpu?.id)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-purple-300 rounded-lg text-sm font-medium text-purple-700 hover:bg-purple-50 hover:border-purple-400 transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            {selectedGpu
              ? selectedGpu.full_name || `${selectedGpu.vendor} ${selectedGpu.model}`
              : t("vmForm.gpuPickPrompt")}
          </button>
          {selectedGpu && (
            <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="text-sm font-semibold text-fg">
                {selectedGpu.full_name || `${selectedGpu.vendor} ${selectedGpu.model}`}
                <span className="text-accent font-normal ml-1">
                  ({selectedGpu.memory_size_formatted || `${selectedGpu.memory_gb} GB`}
                  {selectedGpu.tflops ? ` · ${selectedGpu.tflops} TFLOPS` : ""})
                </span>
              </div>
            </div>
          )}
        </div>
        <SliderInput
          name="gpu_mem_gb"
          label={t("vmForm.gpuMemory")}
          value={formData.gpu_mem_gb}
          onChange={handleFieldChange}
          min={8}
          max={192}
          step={1}
          unit="GB"
        />
        <DiscreteSliderInput
          name="gpus_per_server"
          label={t("vmForm.gpusPerServer")}
          value={formData.gpus_per_server}
          allowed={GPU_PER_SERVER_ALLOWED}
          onChange={handleFieldChange}
        />
      </Section>

      <Section title="Tensor Parallelism" color="orange">
        <DiscreteSliderInput
          name="tp_multiplier_Z"
          label={t("vmForm.tp")}
          value={formData.tp_multiplier_Z}
          allowed={TP_ALLOWED}
          onChange={handleFieldChange}
          hint={t("vmForm.tpHint")}
        />
      </Section>

      <Section title={t("form.section.sla")} color="amber">
        <SliderInput
          name="sla_page"
          label={t("vmForm.slaPerPage")}
          value={formData.sla_page}
          onChange={handleFieldChange}
          min={0}
          max={60}
          step={0.5}
          unit="sec"
          tooltip={t("vmForm.slaPerPage.tooltip")}
        />
      </Section>
    </div>
  );

  const advancedInputs = (
    <div className="space-y-4">
      <Section title={t("form.section.tokens")} color="emerald">
        <SliderInput
          name="w_px"
          label={t("vlmForm.imageWidth")}
          value={formData.w_px}
          onChange={handleFieldChange}
          min={200}
          max={4000}
          step={10}
          unit="px"
          tooltip={t("vlmForm.imageWidth.tooltip")}
        />
        <SliderInput
          name="h_px"
          label={t("vlmForm.imageHeight")}
          value={formData.h_px}
          onChange={handleFieldChange}
          min={200}
          max={6000}
          step={10}
          unit="px"
          tooltip={t("vlmForm.imageHeight.tooltip")}
        />
        <SliderInput
          name="patch_eff"
          label={t("vlmForm.patchSize")}
          value={formData.patch_eff}
          onChange={handleFieldChange}
          min={8}
          max={56}
          step={1}
          hint={t("vlmForm.patchHint")}
          tooltip={t("vlmForm.patchSize.tooltip")}
        />
        <SliderInput
          name="n_prompt_txt"
          label={t("vlmForm.promptTokens")}
          value={formData.n_prompt_txt}
          onChange={handleFieldChange}
          min={0}
          max={2000}
          step={10}
          unit="tok"
          tooltip={t("vlmForm.promptTokens.tooltip")}
        />
        <SliderInput
          name="n_fields"
          label={t("vmForm.jsonFields")}
          value={formData.n_fields}
          onChange={handleFieldChange}
          min={1}
          max={100}
          step={1}
          tooltip={t("vmForm.jsonFields.tooltip")}
        />
        <SliderInput
          name="tok_field"
          label={t("vmForm.tokensPerField")}
          value={formData.tok_field}
          onChange={handleFieldChange}
          min={1}
          max={200}
          step={1}
          unit="tok"
          hint={t("vmForm.tokensPerFieldHint")}
          tooltip={t("vmForm.tokensPerField.tooltip")}
        />
      </Section>

      <Section title={t("form.section.modelArch")} color="green">
        <SliderInput
          name="layers_L"
          label={t("vmForm.layers")}
          value={formData.layers_L}
          onChange={handleFieldChange}
          min={1}
          max={128}
          step={1}
        />
        <SliderInput
          name="hidden_size_H"
          label={t("vmForm.hiddenSize")}
          value={formData.hidden_size_H}
          onChange={handleFieldChange}
          min={512}
          max={16384}
          step={256}
        />
        <SliderInput
          name="num_attention_heads"
          label={t("vmForm.attnHeads")}
          value={formData.num_attention_heads}
          onChange={handleFieldChange}
          min={1}
          max={128}
          step={1}
        />
      </Section>

      <Section title={t("form.section.kvCache")} color="purple">
        <SliderInput
          name="num_kv_heads"
          label={t("vmForm.kvHeads")}
          value={formData.num_kv_heads}
          onChange={handleFieldChange}
          min={1}
          max={128}
          step={1}
        />
        <SliderInput
          name="max_context_window_TSmax"
          label={t("vmForm.maxContext")}
          value={formData.max_context_window_TSmax}
          onChange={handleFieldChange}
          min={1024}
          max={131072}
          step={1024}
          unit="tok"
        />
      </Section>

      <Section title={t("form.section.compute")} color="amber">
        <SliderInput
          name="gpu_flops_Fcount"
          label={t("vmForm.gpuTflops")}
          value={formData.gpu_flops_Fcount}
          onChange={handleFieldChange}
          min={0}
          max={2000}
          step={10}
          unit="TFLOPS"
        />
      </Section>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6 flex-1">
      {/* Presets */}
      <div className="mb-2" data-tour="vlm-presets">
        <label className="block text-sm font-medium text-muted mb-2">
          {t("vmForm.quickPresets")}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {VLM_PRESETS.map((preset) => {
            const isActive = selectedPreset === preset.id;
            const colors = CARD_COLOR_MAP[preset.color] || CARD_COLOR_MAP.indigo;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                title={preset.description}
                className={`p-2.5 rounded-lg border-2 text-left transition-all duration-200 ${
                  isActive
                    ? `${colors.selected} border-current shadow-card`
                    : "border-blue-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50"
                }`}
              >
                <p className="text-sm font-semibold leading-tight">{preset.name}</p>
                <p className="text-xs opacity-60 leading-snug mt-0.5">{preset.subtitle}</p>
              </button>
            );
          })}
        </div>
      </div>


      <div className="flex border-b border-border">
        <button
          type="button"
          data-tour="basic-tab"
          className={`py-2 px-4 font-medium text-sm ${
            activeTab === "basic"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setActiveTab("basic")}
        >
          {t("form.tab.basic")}
        </button>
        <button
          type="button"
          data-tour="advanced-tab"
          className={`py-2 px-4 font-medium text-sm ${
            activeTab === "advanced"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setActiveTab("advanced")}
        >
          {t("form.tab.advanced")}
        </button>
      </div>

      <div>
        {activeTab === "basic" && basicInputs}
        {activeTab === "advanced" && advancedInputs}
      </div>

      {validationError && (
        <div className="bg-danger-soft border border-danger/30 rounded-md p-3 text-sm text-danger">
          {validationError}
        </div>
      )}

      <button
        type="submit"
        data-tour="vlm-calculate-btn"
        disabled={loading}
        className={`mt-auto w-full py-3 px-4 rounded-lg font-semibold text-lg transition-colors text-white ${
          loading ? "bg-blue-300 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 calc-btn-glow"
        }`}
      >
        {loading ? (
          <span className="flex items-center justify-center">
            <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-current mr-2" />
            {t("form.calculating")}
          </span>
        ) : (
          t("vlmForm.submit")
        )}
      </button>
    </form>
  );
};

export default VLMCalculatorForm;
