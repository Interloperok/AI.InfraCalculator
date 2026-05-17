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
  pipeline: "ocr_gpu",
  r_ocr_gpu: 8.0,
  eta_ocr: 0.85,
  r_ocr_core: 0.5,
  n_ocr_cores: 8,
  t_handoff: 0.0,
  chars_page: 3000,
  c_token: 3.5,
  n_prompt_sys: 1000,
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

export const OCR_PRESETS = [
  {
    id: "ocr_a4_gpu_7b",
    name: "A4 OCR-GPU / 1 pps",
    subtitle: "PaddleOCR + Llama-7B · A100",
    description: "A4 page, ocr_gpu pipeline (PaddleOCR @ 8 pps/GPU), Llama-2 7B FP16, A100 80GB.",
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
      ...DEFAULTS,
      lambda_online: 1.0,
      c_peak: 4,
      sla_page: 5.0,
      pipeline: "ocr_gpu",
      r_ocr_gpu: 8.0,
      eta_ocr: 0.85,
      chars_page: 3000,
      n_fields: 20,
      params_billions: 7,
      layers_L: 32,
      hidden_size_H: 4096,
    },
  },
  {
    id: "ocr_id_card_cpu_7b",
    name: "ID card OCR-CPU / 2 pps",
    subtitle: "Tesseract + Llama-7B · A100",
    description:
      "Small ID card, ocr_cpu pipeline (Tesseract @ 0.5 pps/core × 16), Llama-2 7B FP16, A100 80GB.",
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
      ...DEFAULTS,
      lambda_online: 2.0,
      c_peak: 8,
      sla_page: 3.0,
      pipeline: "ocr_cpu",
      r_ocr_core: 0.5,
      n_ocr_cores: 16,
      chars_page: 800,
      c_token: 3.5,
      n_prompt_sys: 500,
      n_fields: 8,
      tok_field: 30,
      params_billions: 7,
      layers_L: 32,
      hidden_size_H: 4096,
    },
  },
];



const INTEGER_FIELDS = new Set([
  "c_peak", "n_ocr_cores", "n_fields", "tok_field", "n_prompt_sys", "chars_page",
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
          htmlFor={`ocr-${name}`}
        >
          <span className="truncate">{label}</span>
          {hint && <span className="text-subtle font-normal">· {hint}</span>}
          {tooltip && <InfoTooltip text={tooltip} />}
        </label>
        <div className="flex items-center gap-1.5 shrink-0 w-[120px] justify-end">
          <input
            id={`ocr-${name}`}
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
    <label className="block text-sm font-medium text-fg mb-2" htmlFor={`ocr-${name}`}>
      {label}
    </label>
    <select
      id={`ocr-${name}`}
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


const PipelineToggle = ({ value, onChange }) => {
  const t = useT();
  const options = [
    {
      id: "ocr_gpu",
      label: t("ocrForm.pipelineOnGpu"),
      hint: t("ocrForm.pipelineOnGpuHint"),
    },
    {
      id: "ocr_cpu",
      label: t("ocrForm.pipelineOnCpu"),
      hint: t("ocrForm.pipelineOnCpuHint"),
    },
  ];
  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-fg mb-2">
        {t("ocrForm.pipelineLabel")}
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              className={`text-left p-2.5 rounded-lg border-2 transition-all ${
                active
                  ? "border-rose-500 bg-rose-50 text-rose-800 dark:bg-surface dark:text-fg"
                  : "border-border bg-surface text-fg hover:border-rose-300"
              }`}
            >
              <p className="text-sm font-semibold">{o.label}</p>
              <p className={`text-[11px] mt-0.5 ${active ? "text-rose-700/80" : "text-muted"}`}>
                {o.hint}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const OCRCalculatorForm = ({
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

  const handlePipelineChange = (value) => {
    setFormData((prev) => ({ ...prev, pipeline: value }));
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
      "chars_page",
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

    if (formData.pipeline === "ocr_gpu" && !(formData.r_ocr_gpu > 0)) {
      setValidationError(t("ocrForm.errOcrGpu"));
      return;
    }
    if (formData.pipeline === "ocr_cpu") {
      if (!(formData.r_ocr_core > 0)) {
        setValidationError(t("ocrForm.errOcrCore"));
        return;
      }
      if (!(formData.n_ocr_cores >= 1)) {
        setValidationError(t("ocrForm.errOcrCores"));
        return;
      }
    }

    const payload = { ...formData };
    if (payload.pipeline === "ocr_gpu") {
      delete payload.r_ocr_core;
      delete payload.n_ocr_cores;
    } else {
      delete payload.r_ocr_gpu;
      delete payload.eta_ocr;
    }

    onSubmit(payload);
  };

  const basicInputs = (
    <div className="space-y-4">
      <Section title={t("form.section.users")} color="blue" dataTour="ocr-workload">
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

      <Section title={t("ocrForm.pipelineTitle")} color="rose" dataTour="ocr-pipeline">
        <PipelineToggle value={formData.pipeline} onChange={handlePipelineChange} />
        {formData.pipeline === "ocr_gpu" ? (
          <SliderInput
            name="r_ocr_gpu"
            label={t("ocrForm.throughputGpu")}
            value={formData.r_ocr_gpu}
            onChange={handleFieldChange}
            min={0.1}
            max={50}
            step={0.1}
            unit="pps/GPU"
            hint={t("ocrForm.empirical")}
            tooltip={t("ocrForm.throughputGpu.tooltip")}
          />
        ) : (
          <>
            <SliderInput
              name="r_ocr_core"
              label={t("ocrForm.throughputCore")}
              value={formData.r_ocr_core}
              onChange={handleFieldChange}
              min={0.05}
              max={5}
              step={0.05}
              unit="pps/core"
              tooltip={t("ocrForm.throughputCore.tooltip")}
            />
            <SliderInput
              name="n_ocr_cores"
              label={t("ocrForm.cpuCores")}
              value={formData.n_ocr_cores}
              onChange={handleFieldChange}
              min={1}
              max={128}
              step={1}
              tooltip={t("ocrForm.cpuCores.tooltip")}
            />
          </>
        )}
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

      <Section title={t("form.section.hardware")} color="purple" dataTour="ocr-hardware">
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
          name="chars_page"
          label={t("ocrForm.charsPerPage")}
          value={formData.chars_page}
          onChange={handleFieldChange}
          min={100}
          max={20000}
          step={50}
          tooltip={t("ocrForm.charsPerPage.tooltip")}
        />
        <SliderInput
          name="c_token"
          label={t("ocrForm.charsPerToken")}
          value={formData.c_token}
          onChange={handleFieldChange}
          min={1}
          max={8}
          step={0.1}
          hint={t("ocrForm.charsPerTokenHint")}
          tooltip={t("ocrForm.charsPerToken.tooltip")}
        />
        <SliderInput
          name="n_prompt_sys"
          label={t("ocrForm.sysPromptTokens")}
          value={formData.n_prompt_sys}
          onChange={handleFieldChange}
          min={0}
          max={4000}
          step={50}
          unit="tok"
          tooltip={t("ocrForm.sysPromptTokens.tooltip")}
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
          tooltip={t("vmForm.tokensPerField.tooltip")}
        />
      </Section>

      <Section title={t("ocrForm.pipelineTitle")} color="rose">
        {formData.pipeline === "ocr_gpu" && (
          <SliderInput
            name="eta_ocr"
            label={t("ocrForm.poolUtilisation")}
            value={formData.eta_ocr}
            onChange={handleFieldChange}
            min={0.5}
            max={1}
            step={0.01}
            hint={t("ocrForm.poolUtilHint")}
            tooltip={t("ocrForm.poolUtilisation.tooltip")}
          />
        )}
        <SliderInput
          name="t_handoff"
          label={t("ocrForm.handoff")}
          value={formData.t_handoff}
          onChange={handleFieldChange}
          min={0}
          max={2}
          step={0.01}
          unit="sec"
          hint={t("ocrForm.handoffHint")}
          tooltip={t("ocrForm.handoff.tooltip")}
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
      <div className="mb-2" data-tour="ocr-presets">
        <label className="block text-sm font-medium text-muted mb-2">
          {t("vmForm.quickPresets")}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {OCR_PRESETS.map((preset) => {
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
        data-tour="ocr-calculate-btn"
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
          t("ocrForm.submit")
        )}
      </button>
    </form>
  );
};

export default OCRCalculatorForm;
