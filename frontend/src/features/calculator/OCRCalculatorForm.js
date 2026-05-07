import React, { useState, useEffect, useCallback } from "react";
import { useT } from "../../contexts/I18nContext";

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

const NumberInput = ({ name, label, value, onChange, min, max, step, suffix, hint }) => (
  <div>
    <label className="block text-xs font-medium text-muted mb-1" htmlFor={`ocr-${name}`}>
      {label}
      {hint && <span className="ml-1 text-subtle font-normal">· {hint}</span>}
    </label>
    <div className="relative">
      <input
        id={`ocr-${name}`}
        type="number"
        name={name}
        value={value ?? ""}
        onChange={(e) => onChange(name, e.target.value === "" ? "" : Number(e.target.value))}
        min={min}
        max={max}
        step={step ?? "any"}
        className="w-full px-3 py-2 text-sm border border-border rounded-md bg-surface text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
      />
      {suffix && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-subtle pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  </div>
);

const SelectInput = ({ name, label, value, options, onChange }) => (
  <div>
    <label className="block text-xs font-medium text-muted mb-1" htmlFor={`ocr-${name}`}>
      {label}
    </label>
    <select
      id={`ocr-${name}`}
      name={name}
      value={value}
      onChange={(e) => onChange(name, Number(e.target.value))}
      className="w-full px-3 py-2 text-sm border border-border rounded-md bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </div>
);

// Section ID picks a coloured dot accent only — card body is neutral so
// contrast works in both light and dark modes. Visual language matches
// the LLM CalculatorForm sections (single row of dot + uppercase muted
// heading on a bg-surface card).
const SECTION_DOTS = {
  blue: "bg-info",
  emerald: "bg-success",
  purple: "bg-accent",
  amber: "bg-warning",
  rose: "bg-danger",
};

const Section = ({ title, color = "blue", dataTour, children }) => {
  const dot = SECTION_DOTS[color] || SECTION_DOTS.blue;
  return (
    <div
      className="rounded-xl p-5 border border-border bg-surface shadow-card"
      data-tour={dataTour}
    >
      <h4 className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] uppercase text-muted mb-3">
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
        {title}
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
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
    <div className="sm:col-span-2">
      <label className="block text-xs font-medium text-muted mb-1">{t("ocrForm.pipelineLabel")}</label>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              className={`text-left p-2 rounded-md border-2 transition-all ${
                active
                  ? "bg-accent border-accent text-accent-fg"
                  : "bg-surface border-border text-fg hover:border-accent/40"
              }`}
            >
              <p className="text-sm font-semibold">{o.label}</p>
              <p
                className={`text-[11px] mt-0.5 ${active ? "opacity-80" : "text-muted"}`}
              >
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

    // Drop the unused pipeline-specific fields from payload to keep it clean
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

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 flex-1">
      {/* Presets */}
      <div data-tour="ocr-presets">
        <label className="block text-sm font-medium text-muted mb-2">{t("vmForm.quickPresets")}</label>
        <div className="grid grid-cols-2 gap-2">
          {OCR_PRESETS.map((preset) => {
            const isActive = selectedPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                title={preset.description}
                className={`text-left p-3 rounded-lg border-2 transition-all ${
                  isActive
                    ? "bg-accent border-accent text-accent-fg shadow-card"
                    : "bg-surface border-border text-fg hover:border-accent/40 hover:bg-accent-soft"
                }`}
              >
                <p className="text-sm font-semibold">{preset.name}</p>
                <p className={`text-xs mt-0.5 ${isActive ? "opacity-80" : "text-muted"}`}>
                  {preset.subtitle}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Workload */}
      <Section title={t("vmForm.workloadOnline")} color="blue" dataTour="ocr-workload">
        <NumberInput
          name="lambda_online"
          label={t("vmForm.pagesPerSecond")}
          value={formData.lambda_online}
          onChange={handleFieldChange}
          min={0}
          step="0.1"
          suffix="pps"
        />
        <NumberInput
          name="c_peak"
          label={t("vmForm.peakConcurrent")}
          value={formData.c_peak}
          onChange={handleFieldChange}
          min={1}
          step="1"
        />
        <NumberInput
          name="sla_page"
          label={t("vmForm.slaPerPage")}
          value={formData.sla_page}
          onChange={handleFieldChange}
          min={0}
          step="0.1"
          suffix="sec"
        />
      </Section>

      {/* OCR pipeline */}
      <Section title={t("ocrForm.pipelineTitle")} color="rose" dataTour="ocr-pipeline">
        <PipelineToggle value={formData.pipeline} onChange={handlePipelineChange} />
        {formData.pipeline === "ocr_gpu" ? (
          <>
            <NumberInput
              name="r_ocr_gpu"
              label={t("ocrForm.throughputGpu")}
              value={formData.r_ocr_gpu}
              onChange={handleFieldChange}
              min={0}
              step="0.1"
              suffix="pps/GPU"
              hint={t("ocrForm.empirical")}
            />
            <NumberInput
              name="eta_ocr"
              label={t("ocrForm.poolUtilisation")}
              value={formData.eta_ocr}
              onChange={handleFieldChange}
              min={0.01}
              max={1.0}
              step="0.01"
              hint={t("ocrForm.poolUtilHint")}
            />
          </>
        ) : (
          <>
            <NumberInput
              name="r_ocr_core"
              label={t("ocrForm.throughputCore")}
              value={formData.r_ocr_core}
              onChange={handleFieldChange}
              min={0}
              step="0.05"
              suffix="pps/core"
            />
            <NumberInput
              name="n_ocr_cores"
              label={t("ocrForm.cpuCores")}
              value={formData.n_ocr_cores}
              onChange={handleFieldChange}
              min={1}
              step="1"
            />
          </>
        )}
        <NumberInput
          name="t_handoff"
          label={t("ocrForm.handoff")}
          value={formData.t_handoff}
          onChange={handleFieldChange}
          min={0}
          step="0.01"
          suffix="sec"
          hint={t("ocrForm.handoffHint")}
        />
      </Section>

      {/* Text profile */}
      <Section title={t("ocrForm.textProfile")} color="emerald">
        <NumberInput
          name="chars_page"
          label={t("ocrForm.charsPerPage")}
          value={formData.chars_page}
          onChange={handleFieldChange}
          min={1}
          step="50"
        />
        <NumberInput
          name="c_token"
          label={t("ocrForm.charsPerToken")}
          value={formData.c_token}
          onChange={handleFieldChange}
          min={0.1}
          step="0.1"
          hint={t("ocrForm.charsPerTokenHint")}
        />
        <NumberInput
          name="n_prompt_sys"
          label={t("ocrForm.sysPromptTokens")}
          value={formData.n_prompt_sys}
          onChange={handleFieldChange}
          min={0}
          step="50"
        />
        <NumberInput
          name="n_fields"
          label={t("vmForm.jsonFields")}
          value={formData.n_fields}
          onChange={handleFieldChange}
          min={1}
          step="1"
        />
        <NumberInput
          name="tok_field"
          label={t("vmForm.tokensPerField")}
          value={formData.tok_field}
          onChange={handleFieldChange}
          min={1}
          step="1"
        />
      </Section>

      {/* LLM model */}
      <Section title={t("ocrForm.modelTitle")} color="purple">
        <NumberInput
          name="params_billions"
          label={t("vmForm.parameters")}
          value={formData.params_billions}
          onChange={handleFieldChange}
          min={0}
          step="0.1"
          suffix="B"
        />
        <SelectInput
          name="bytes_per_param"
          label={t("vmForm.quantization")}
          value={formData.bytes_per_param}
          options={QUANTIZATION_OPTIONS}
          onChange={handleFieldChange}
        />
        <NumberInput
          name="layers_L"
          label={t("vmForm.layers")}
          value={formData.layers_L}
          onChange={handleFieldChange}
          min={1}
          step="1"
        />
        <NumberInput
          name="hidden_size_H"
          label={t("vmForm.hiddenSize")}
          value={formData.hidden_size_H}
          onChange={handleFieldChange}
          min={1}
          step="1"
        />
        <NumberInput
          name="num_kv_heads"
          label={t("vmForm.kvHeads")}
          value={formData.num_kv_heads}
          onChange={handleFieldChange}
          min={1}
          step="1"
        />
        <NumberInput
          name="num_attention_heads"
          label={t("vmForm.attnHeads")}
          value={formData.num_attention_heads}
          onChange={handleFieldChange}
          min={1}
          step="1"
        />
        <NumberInput
          name="max_context_window_TSmax"
          label={t("vmForm.maxContext")}
          value={formData.max_context_window_TSmax}
          onChange={handleFieldChange}
          min={1}
          step="1"
          suffix={t("vmForm.tokensSuffix")}
        />
      </Section>

      {/* Hardware */}
      <Section title={t("vmForm.hardware")} color="amber" dataTour="ocr-hardware">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-muted mb-1">{t("vmForm.gpuModel")}</label>
          <button
            type="button"
            onClick={() => onOpenGpuPicker?.(selectedGpu?.id)}
            className="w-full text-left px-3 py-2 text-sm border border-border rounded-md bg-surface text-fg hover:border-accent/40 hover:bg-elevated transition-colors"
          >
            {selectedGpu
              ? selectedGpu.full_name || `${selectedGpu.vendor} ${selectedGpu.model}`
              : t("vmForm.gpuPickPrompt")}
          </button>
          {selectedGpu && (
            <p className="text-xs text-muted mt-1">
              {selectedGpu.memory_size_formatted || `${selectedGpu.memory_gb} GB`}
              {selectedGpu.tflops ? ` · ${selectedGpu.tflops} TFLOPS` : ""}
            </p>
          )}
        </div>
        <NumberInput
          name="gpu_mem_gb"
          label={t("vmForm.gpuMemory")}
          value={formData.gpu_mem_gb}
          onChange={handleFieldChange}
          min={1}
          step="1"
          suffix="GB"
        />
        <NumberInput
          name="gpu_flops_Fcount"
          label={t("vmForm.gpuTflops")}
          value={formData.gpu_flops_Fcount}
          onChange={handleFieldChange}
          min={1}
          step="1"
        />
        <NumberInput
          name="gpus_per_server"
          label={t("vmForm.gpusPerServer")}
          value={formData.gpus_per_server}
          onChange={handleFieldChange}
          min={1}
          max={16}
          step="1"
        />
        <NumberInput
          name="tp_multiplier_Z"
          label={t("vmForm.tp")}
          value={formData.tp_multiplier_Z}
          onChange={handleFieldChange}
          min={1}
          max={8}
          step="1"
          hint={t("vmForm.tpHint")}
        />
      </Section>

      {validationError && (
        <div className="bg-danger-soft border border-danger/30 rounded-md p-3 text-sm text-danger">
          {validationError}
        </div>
      )}

      {/* Submit */}
      <div className="mt-2" data-tour="ocr-calculate-btn">
        <button
          type="submit"
          disabled={loading}
          className={`w-full py-3 px-4 rounded-lg text-sm font-semibold text-accent-fg shadow-card transition-all ${
            loading
              ? "bg-accent/60 cursor-not-allowed"
              : "bg-accent hover:bg-accent/90 hover:shadow-card-hover"
          }`}
        >
          {loading ? t("form.calculating") : t("ocrForm.submit")}
        </button>
      </div>
    </form>
  );
};

export default OCRCalculatorForm;
