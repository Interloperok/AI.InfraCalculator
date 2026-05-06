import React, { useState, useEffect, useCallback } from "react";

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

const NumberInput = ({ name, label, value, onChange, min, max, step, suffix, hint }) => (
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor={`vlm-${name}`}>
      {label}
      {hint && <span className="ml-1 text-gray-400 font-normal">· {hint}</span>}
    </label>
    <div className="relative">
      <input
        id={`vlm-${name}`}
        type="number"
        name={name}
        value={value ?? ""}
        onChange={(e) => onChange(name, e.target.value === "" ? "" : Number(e.target.value))}
        min={min}
        max={max}
        step={step ?? "any"}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
      />
      {suffix && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  </div>
);

const SelectInput = ({ name, label, value, options, onChange }) => (
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor={`vlm-${name}`}>
      {label}
    </label>
    <select
      id={`vlm-${name}`}
      name={name}
      value={value}
      onChange={(e) => onChange(name, Number(e.target.value))}
      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </div>
);

const SECTION_STYLES = {
  blue: {
    container: "rounded-lg p-4 border bg-blue-50 border-blue-200",
    heading: "text-sm font-semibold text-blue-700 mb-3 uppercase tracking-wider",
  },
  emerald: {
    container: "rounded-lg p-4 border bg-emerald-50 border-emerald-200",
    heading: "text-sm font-semibold text-emerald-700 mb-3 uppercase tracking-wider",
  },
  purple: {
    container: "rounded-lg p-4 border bg-purple-50 border-purple-200",
    heading: "text-sm font-semibold text-purple-700 mb-3 uppercase tracking-wider",
  },
  amber: {
    container: "rounded-lg p-4 border bg-amber-50 border-amber-200",
    heading: "text-sm font-semibold text-amber-700 mb-3 uppercase tracking-wider",
  },
};

const Section = ({ title, color = "blue", dataTour, children }) => {
  const styles = SECTION_STYLES[color] || SECTION_STYLES.blue;
  return (
    <div className={styles.container} data-tour={dataTour}>
      <h4 className={styles.heading}>{title}</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
};

const VLMCalculatorForm = ({
  onSubmit,
  loading,
  onOpenGpuPicker,
  gpuPickerResult,
  onClearGpuPickerResult,
}) => {
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
        setValidationError(`Missing or invalid value for ${f}`);
        return;
      }
    }

    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 flex-1">
      {/* Presets */}
      <div data-tour="vlm-presets">
        <label className="block text-sm font-medium text-gray-600 mb-2">Quick Presets</label>
        <div className="grid grid-cols-2 gap-2">
          {VLM_PRESETS.map((preset) => {
            const isActive = selectedPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                title={preset.description}
                className={`text-left p-3 rounded-lg border-2 transition-all ${
                  isActive
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-md"
                    : "bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50"
                }`}
              >
                <p className="text-sm font-semibold">{preset.name}</p>
                <p className={`text-xs mt-0.5 ${isActive ? "opacity-80" : "text-gray-500"}`}>
                  {preset.subtitle}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Workload */}
      <Section title="Workload (online)" color="blue" dataTour="vlm-workload">
        <NumberInput
          name="lambda_online"
          label="Pages per second (λ)"
          value={formData.lambda_online}
          onChange={handleFieldChange}
          min={0}
          step="0.1"
          suffix="pps"
        />
        <NumberInput
          name="c_peak"
          label="Peak concurrent pages"
          value={formData.c_peak}
          onChange={handleFieldChange}
          min={1}
          step="1"
        />
        <NumberInput
          name="sla_page"
          label="SLA per page (p95)"
          value={formData.sla_page}
          onChange={handleFieldChange}
          min={0}
          step="0.1"
          suffix="sec"
        />
      </Section>

      {/* Image / token profile */}
      <Section title="Image & token profile" color="emerald">
        <NumberInput
          name="w_px"
          label="Image width"
          value={formData.w_px}
          onChange={handleFieldChange}
          min={1}
          step="1"
          suffix="px"
        />
        <NumberInput
          name="h_px"
          label="Image height"
          value={formData.h_px}
          onChange={handleFieldChange}
          min={1}
          step="1"
          suffix="px"
        />
        <NumberInput
          name="patch_eff"
          label="Effective patch size"
          value={formData.patch_eff}
          onChange={handleFieldChange}
          min={1}
          step="1"
          hint="Qwen2.5-VL ≈ 28"
        />
        <NumberInput
          name="n_prompt_txt"
          label="Prompt tokens (text)"
          value={formData.n_prompt_txt}
          onChange={handleFieldChange}
          min={0}
          step="1"
        />
        <NumberInput
          name="n_fields"
          label="JSON fields per response"
          value={formData.n_fields}
          onChange={handleFieldChange}
          min={1}
          step="1"
        />
        <NumberInput
          name="tok_field"
          label="Tokens per field"
          value={formData.tok_field}
          onChange={handleFieldChange}
          min={1}
          step="1"
          hint="typically 30-100"
        />
      </Section>

      {/* Model */}
      <Section title="VLM model" color="purple">
        <NumberInput
          name="params_billions"
          label="Parameters"
          value={formData.params_billions}
          onChange={handleFieldChange}
          min={0}
          step="0.1"
          suffix="B"
        />
        <SelectInput
          name="bytes_per_param"
          label="Quantization"
          value={formData.bytes_per_param}
          options={QUANTIZATION_OPTIONS}
          onChange={handleFieldChange}
        />
        <NumberInput
          name="layers_L"
          label="Layers (L)"
          value={formData.layers_L}
          onChange={handleFieldChange}
          min={1}
          step="1"
        />
        <NumberInput
          name="hidden_size_H"
          label="Hidden size (H)"
          value={formData.hidden_size_H}
          onChange={handleFieldChange}
          min={1}
          step="1"
        />
        <NumberInput
          name="num_kv_heads"
          label="KV heads (Nkv)"
          value={formData.num_kv_heads}
          onChange={handleFieldChange}
          min={1}
          step="1"
        />
        <NumberInput
          name="num_attention_heads"
          label="Attention heads"
          value={formData.num_attention_heads}
          onChange={handleFieldChange}
          min={1}
          step="1"
        />
        <NumberInput
          name="max_context_window_TSmax"
          label="Max context window"
          value={formData.max_context_window_TSmax}
          onChange={handleFieldChange}
          min={1}
          step="1"
          suffix="tokens"
        />
      </Section>

      {/* Hardware */}
      <Section title="Hardware" color="amber" dataTour="vlm-hardware">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">GPU model</label>
          <button
            type="button"
            onClick={() => onOpenGpuPicker?.(selectedGpu?.id)}
            className="w-full text-left px-3 py-2 text-sm border border-gray-200 rounded-md bg-white hover:border-indigo-300 transition-colors"
          >
            {selectedGpu
              ? selectedGpu.full_name || `${selectedGpu.vendor} ${selectedGpu.model}`
              : "Click to choose a GPU…"}
          </button>
          {selectedGpu && (
            <p className="text-xs text-gray-500 mt-1">
              {selectedGpu.memory_size_formatted || `${selectedGpu.memory_gb} GB`}
              {selectedGpu.tflops ? ` · ${selectedGpu.tflops} TFLOPS` : ""}
            </p>
          )}
        </div>
        <NumberInput
          name="gpu_mem_gb"
          label="GPU memory"
          value={formData.gpu_mem_gb}
          onChange={handleFieldChange}
          min={1}
          step="1"
          suffix="GB"
        />
        <NumberInput
          name="gpu_flops_Fcount"
          label="GPU TFLOPS"
          value={formData.gpu_flops_Fcount}
          onChange={handleFieldChange}
          min={1}
          step="1"
        />
        <NumberInput
          name="gpus_per_server"
          label="GPUs per server"
          value={formData.gpus_per_server}
          onChange={handleFieldChange}
          min={1}
          max={16}
          step="1"
        />
        <NumberInput
          name="tp_multiplier_Z"
          label="Tensor parallelism (Z)"
          value={formData.tp_multiplier_Z}
          onChange={handleFieldChange}
          min={1}
          max={8}
          step="1"
          hint="1 = single GPU"
        />
      </Section>

      {validationError && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
          {validationError}
        </div>
      )}

      {/* Submit */}
      <div className="mt-2" data-tour="vlm-calculate-btn">
        <button
          type="submit"
          disabled={loading}
          className={`w-full py-3 px-4 rounded-lg text-sm font-semibold text-white shadow-md transition-all ${
            loading
              ? "bg-indigo-400 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg"
          }`}
        >
          {loading ? "Calculating…" : "Calculate VLM Sizing"}
        </button>
      </div>
    </form>
  );
};

export default VLMCalculatorForm;
