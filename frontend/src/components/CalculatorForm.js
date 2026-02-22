import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { getGPUs } from '../services/api';

// ── Spark burst helper for toggle activation ──
const useSparkBurst = () => {
  const containerRef = useRef(null);
  const fire = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const SPARK_COUNT = 8;
    for (let i = 0; i < SPARK_COUNT; i++) {
      const spark = document.createElement('span');
      spark.className = 'spark';
      const angle = (360 / SPARK_COUNT) * i + (Math.random() * 30 - 15);
      const dist = 14 + Math.random() * 12;
      const rad = (angle * Math.PI) / 180;
      spark.style.setProperty('--tx', `${Math.cos(rad) * dist}px`);
      spark.style.setProperty('--ty', `${Math.sin(rad) * dist}px`);
      spark.style.left = '50%';
      spark.style.top = '50%';
      el.appendChild(spark);
      setTimeout(() => spark.remove(), 550);
    }
  }, []);
  return { containerRef, fire };
};

// ── Auto-Optimize Toggle Switch with animations ──
const ToggleSwitch = ({ autoMode, setAutoMode }) => {
  const { containerRef, fire } = useSparkBurst();
  const [justActivated, setJustActivated] = useState(false);
  const prevMode = useRef(autoMode);

  useEffect(() => {
    if (autoMode && !prevMode.current) {
      // Just turned ON
      setJustActivated(true);
      fire();
      const t = setTimeout(() => setJustActivated(false), 650);
      return () => clearTimeout(t);
    }
    prevMode.current = autoMode;
  }, [autoMode, fire]);

  return (
    <div className="flex items-center gap-2.5">
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => setAutoMode(!autoMode)}
          className={`relative inline-flex h-8 w-[56px] shrink-0 cursor-pointer rounded-full border-2 transition-all duration-300 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
            autoMode
              ? 'bg-indigo-600 border-indigo-600 toggle-electric'
              : 'bg-gray-200 border-gray-200 toggle-shimmer'
          }`}
          title="Auto-Optimize: automatically find the best hardware configuration"
        >
          <span
            className={`pointer-events-none inline-flex h-[28px] w-[28px] items-center justify-center rounded-full bg-white shadow-lg ring-0 transition-all duration-300 ease-[cubic-bezier(0.68,-0.55,0.265,1.55)] ${
              autoMode ? 'translate-x-[25px]' : 'translate-x-0'
            }`}
          >
            <svg
              className={`w-4 h-4 transition-all duration-200 ${
                autoMode ? 'text-indigo-600' : 'text-gray-400'
              } ${justActivated ? 'bolt-zap' : ''} ${autoMode && !justActivated ? 'bolt-glow' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </span>
        </button>
      </div>
      <span className={`text-sm font-semibold select-none transition-all duration-300 ${
        autoMode ? 'text-indigo-600' : 'text-gray-400'
      }`}>
        Auto
      </span>
      <InfoTooltip text="Auto-Optimize: automatically find the best hardware configuration by searching across GPUs, quantization, TP degree, and server layouts." />
    </div>
  );
};

// ── Tooltip bubble rendered via Portal (always on top of everything) ──
const TooltipBubble = ({ text, anchorRef, visible, width = 240 }) => {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (visible && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({
        top: rect.top - 8,           // 8px gap above the icon
        left: rect.left + rect.width / 2,
      });
    }
  }, [visible, anchorRef]);

  if (!visible) return null;

  return ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed',
        zIndex: 99999,
        top: pos.top,
        left: pos.left,
        transform: 'translate(-50%, -100%)',
        width: width,
        pointerEvents: 'none',
      }}
    >
      <div className="px-3 py-2 text-xs font-normal text-white bg-gray-800 rounded-lg shadow-lg text-center leading-relaxed">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
      </div>
    </div>,
    document.body
  );
};

// ── Reusable tooltip wrapper ──
const useTooltip = () => {
  const ref = useRef(null);
  const [show, setShow] = useState(false);
  const onEnter = useCallback(() => setShow(true), []);
  const onLeave = useCallback(() => setShow(false), []);
  return { ref, show, onEnter, onLeave };
};

// ── Info tooltip component (for input labels) ──
const InfoTooltip = ({ text }) => {
  const { ref, show, onEnter, onLeave } = useTooltip();
  return (
    <span
      ref={ref}
      className="inline-flex ml-1.5 align-middle"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <svg
        className="w-4 h-4 text-gray-400 hover:text-indigo-500 cursor-help transition-colors"
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
      <TooltipBubble text={text} anchorRef={ref} visible={show} width={240} />
    </span>
  );
};

// ── Section info tooltip (for section headers) ──
const SectionTooltip = ({ text }) => {
  const { ref, show, onEnter, onLeave } = useTooltip();
  return (
    <span
      ref={ref}
      className="inline-flex ml-2 align-middle"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={(e) => e.stopPropagation()}
    >
      <svg
        className="w-4 h-4 text-current opacity-50 hover:opacity-100 cursor-help transition-opacity"
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
      <TooltipBubble text={text} anchorRef={ref} visible={show} width={256} />
    </span>
  );
};

// ── Presets ──
const PRESETS = [
  {
    id: 'excel_32b_500k',
    name: '32B / 500K users',
    subtitle: 'A100 80GB  |  Z = 4',
    description: 'Reference example from Excel calculator (MRT=0, 23 servers)',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    color: 'indigo',
    model: { id: 'preset-32b', modelId: 'Custom 32B (FP16, L=64, H=4096)' },
    gpu: { id: 'preset-a100-80', vendor: 'NVIDIA', model: 'A100 80GB PCIe', full_name: 'NVIDIA A100 80GB PCIe', memory_gb: 80, tflops: 312, tdp_watts: '300 W', cores: 6912 },
    data: {
      internal_users: 500000,
      penetration_internal: 0.1,
      concurrency_internal: 0.05,
      external_users: 0,
      penetration_external: 0.0,
      concurrency_external: 0.0,
      sessions_per_user_J: 1,
      system_prompt_tokens_SP: 1000,
      user_prompt_tokens_Prp: 200,
      reasoning_tokens_MRT: 0,
      answer_tokens_A: 400,
      dialog_turns: 5,
      params_billions: 32,
      bytes_per_param: 2,
      overhead_factor: 1.1,
      emp_model: 1.0,
      layers_L: 64,
      hidden_size_H: 4096,
      bytes_per_kv_state: 2,
      emp_kv: 1.0,
      max_context_window_TSmax: 32768,
      gpu_mem_gb: 80,
      gpus_per_server: 8,
      kavail: 0.9,
      tp_multiplier_Z: 4,
      saturation_coeff_C: 10.0,
      gpu_flops_Fcount: 312,
      eta_prefill: 0.20,
      eta_decode: 0.15,
      th_prefill_empir: null,
      th_decode_empir: null,
      rps_per_session_R: 0.02,
      sla_reserve_KSLA: 1.25,
    },
  },
  {
    id: 'small_7b',
    name: '7B / 2K users',
    subtitle: 'A100 80GB  |  Z = 1',
    description: 'Small model, low workload',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    color: 'emerald',
    model: { id: 'preset-7b', modelId: 'Llama-2 7B (FP16, L=32, H=4096)' },
    gpu: { id: 'preset-a100-80', vendor: 'NVIDIA', model: 'A100 80GB PCIe', full_name: 'NVIDIA A100 80GB PCIe', memory_gb: 80, tflops: 312, tdp_watts: '300 W', cores: 6912 },
    data: {
      internal_users: 2000,
      penetration_internal: 0.4,
      concurrency_internal: 0.1,
      external_users: 0,
      penetration_external: 0.0,
      concurrency_external: 0.0,
      sessions_per_user_J: 1,
      system_prompt_tokens_SP: 1000,
      user_prompt_tokens_Prp: 200,
      reasoning_tokens_MRT: 4096,
      answer_tokens_A: 400,
      dialog_turns: 5,
      params_billions: 7,
      bytes_per_param: 2,
      overhead_factor: 1.15,
      emp_model: 1.0,
      layers_L: 32,
      hidden_size_H: 4096,
      bytes_per_kv_state: 2,
      emp_kv: 1.0,
      max_context_window_TSmax: 32768,
      gpu_mem_gb: 80,
      gpus_per_server: 8,
      kavail: 0.9,
      tp_multiplier_Z: 1,
      saturation_coeff_C: 8.0,
      gpu_flops_Fcount: 312,
      eta_prefill: 0.20,
      eta_decode: 0.15,
      th_prefill_empir: null,
      th_decode_empir: null,
      rps_per_session_R: 0.02,
      sla_reserve_KSLA: 1.25,
    },
  },
  {
    id: 'large_70b',
    name: '70B / 10K users',
    subtitle: 'H100 80GB  |  Z = 2',
    description: 'Large model with reasoning, medium workload',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
      </svg>
    ),
    color: 'amber',
    model: { id: 'preset-70b', modelId: 'Llama-2 70B (FP16, L=80, H=8192)' },
    gpu: { id: 'preset-h100-80', vendor: 'NVIDIA', model: 'H100 80GB PCIe', full_name: 'NVIDIA H100 80GB PCIe', memory_gb: 80, tflops: 756, tdp_watts: '350 W', cores: 16896 },
    data: {
      internal_users: 10000,
      penetration_internal: 0.3,
      concurrency_internal: 0.1,
      external_users: 0,
      penetration_external: 0.0,
      concurrency_external: 0.0,
      sessions_per_user_J: 1,
      system_prompt_tokens_SP: 1000,
      user_prompt_tokens_Prp: 200,
      reasoning_tokens_MRT: 4096,
      answer_tokens_A: 400,
      dialog_turns: 5,
      params_billions: 70,
      bytes_per_param: 2,
      overhead_factor: 1.15,
      emp_model: 1.0,
      layers_L: 80,
      hidden_size_H: 8192,
      bytes_per_kv_state: 2,
      emp_kv: 1.0,
      max_context_window_TSmax: 32768,
      gpu_mem_gb: 80,
      gpus_per_server: 8,
      kavail: 0.9,
      tp_multiplier_Z: 2,
      saturation_coeff_C: 8.0,
      gpu_flops_Fcount: 756,
      eta_prefill: 0.20,
      eta_decode: 0.15,
      th_prefill_empir: null,
      th_decode_empir: null,
      rps_per_session_R: 0.02,
      sla_reserve_KSLA: 1.25,
    },
  },
];

// ── Optimization Mode Cards ──
const OPTIMIZATION_MODES = [
  {
    id: 'min_servers',
    name: 'Min Servers',
    description: 'Minimize the number of physical servers',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
      </svg>
    ),
    color: 'blue',
  },
  {
    id: 'min_cost',
    name: 'Min Cost',
    description: 'Minimize total GPU infrastructure cost',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'emerald',
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Best balance of cost & performance',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
      </svg>
    ),
    color: 'violet',
  },
  {
    id: 'max_performance',
    name: 'Max Performance',
    description: 'Maximize throughput per server',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    color: 'amber',
  },
];

const CARD_COLOR_MAP = {
  blue: { selected: 'border-blue-500 bg-blue-50 text-blue-700' },
  emerald: { selected: 'border-emerald-500 bg-emerald-50 text-emerald-700' },
  violet: { selected: 'border-violet-500 bg-violet-50 text-violet-700' },
  amber: { selected: 'border-amber-500 bg-amber-50 text-amber-700' },
  indigo: { selected: 'border-indigo-500 bg-indigo-50 text-indigo-700' },
};

const CalculatorForm = ({
  onSubmit, loading,
  autoMode, setAutoMode,
  optimizeMode, setOptimizeMode,
  gpuFilter, onOpenGpuFilter,
  onOpenGpuPicker,
  gpuPickerResult,
  onClearGpuPickerResult,
  appliedConfig, onAppliedConfigConsumed,
}) => {

  // Initial form values based on the SizingInput (Methodology v2)
  const [formData, setFormData] = useState({
    // Users & behavior (Section 2.1)
    internal_users: 100,
    penetration_internal: 0.1,
    concurrency_internal: 0.2,
    external_users: 0,
    penetration_external: 0.05,
    concurrency_external: 0.1,
    sessions_per_user_J: 1,

    // Tokens (Section 2.2)
    system_prompt_tokens_SP: 1000,
    user_prompt_tokens_Prp: 200,
    reasoning_tokens_MRT: 4096,
    answer_tokens_A: 400,
    dialog_turns: 5,

    // Model (Section 3.1)
    params_billions: 7,
    bytes_per_param: 2,
    overhead_factor: 1.15,
    emp_model: 1.0,
    layers_L: 32,
    hidden_size_H: 4096,

    // KV-cache (Section 3.2)
    bytes_per_kv_state: 2,
    emp_kv: 1.0,
    max_context_window_TSmax: 32768,

    // Hardware & TP (Section 4)
    gpu_mem_gb: 0, // No GPU selected by default
    gpus_per_server: 8,
    kavail: 0.9,
    tp_multiplier_Z: 1,
    saturation_coeff_C: 8.0,

    // Compute (Section 6)
    gpu_flops_Fcount: null,
    eta_prefill: 0.20,
    eta_decode: 0.15,
    th_prefill_empir: null,
    th_decode_empir: null,

    // SLA (Section 6.4)
    rps_per_session_R: 0.02,
    sla_reserve_KSLA: 1.25,
  });

  // State for model search
  const [modelSearch, setModelSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedModel, setSelectedModel] = useState(null);

  // State for GPU selection
  const [selectedGpu, setSelectedGpu] = useState(null);

  // State for tracking which sections are expanded in the Advanced tab
  const [expandedSections, setExpandedSections] = useState({
    model: false,
    users: false,
    tokens: false,
    kv: false,
    compute: false,
    sla: false,
  });

  const [activeTab, setActiveTab] = useState('basic'); // 'basic' or 'advanced'
  const [selectedPreset, setSelectedPreset] = useState(null);

  // Load GPU data on component mount
  useEffect(() => {
    const loadGpuData = async () => {
      try {
        await getGPUs({ per_page: 100 });
      } catch (error) {
        console.error('Error loading GPU data:', error);
      }
    };
    loadGpuData();
  }, []);

  // Handle GPU selection (used when applying from modal or elsewhere) — must be before useEffect that uses it
  const handleGpuSelect = useCallback((gpu) => {
    setSelectedGpu(gpu);
    setFormData(prev => ({
      ...prev,
      gpu_id: gpu.id,
      gpu_mem_gb: gpu.memory_gb,
      gpus_per_server: gpu.recommended_gpus_per_server || 8,
      gpu_flops_Fcount: gpu.tflops ?? prev.gpu_flops_Fcount,
    }));
  }, []);

  // Apply GPU picked from modal (single-selection mode; modal passes full object)
  useEffect(() => {
    if (!gpuPickerResult || !onClearGpuPickerResult) return;
    const gpu = {
      ...gpuPickerResult,
      recommended_gpus_per_server: gpuPickerResult.recommended_gpus_per_server ?? 8,
      memory_size_formatted: gpuPickerResult.memory_size_formatted || `${gpuPickerResult.memory_gb} GB`,
    };
    handleGpuSelect(gpu);
    onClearGpuPickerResult();
  }, [gpuPickerResult, onClearGpuPickerResult, handleGpuSelect]);

  // Apply config from Auto-Optimize
  useEffect(() => {
    if (appliedConfig && typeof appliedConfig === 'object') {
      // Map applied SizingInput fields onto form data
      const mapped = {};
      const formKeys = Object.keys(formData);
      for (const key of formKeys) {
        if (key in appliedConfig && appliedConfig[key] !== null && appliedConfig[key] !== undefined) {
          mapped[key] = appliedConfig[key];
        }
      }
      if (Object.keys(mapped).length > 0) {
        setFormData(prev => ({ ...prev, ...mapped }));
        // Reconstruct selectedGpu from auto-optimize GPU info if available
        if (appliedConfig._gpuInfo) {
          setSelectedGpu(appliedConfig._gpuInfo);
        }
        // Don't clear selectedModel — LLM model stays the same across configs
      }
      // Signal that we consumed the config
      if (onAppliedConfigConsumed) {
        onAppliedConfigConsumed();
      }
    }
  }, [appliedConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Normalize GPUs per Server and TP (Z) to allowed values: 1, 2, 4, 6, 8
  const ALLOWED_DISCRETE = [1, 2, 4, 6, 8];
  useEffect(() => {
    setFormData(prev => {
      const clampToAllowed = (v) => {
        if (ALLOWED_DISCRETE.includes(v)) return v;
        return ALLOWED_DISCRETE.reduce((best, x) => Math.abs(x - v) < Math.abs(best - v) ? x : best);
      };
      const gpu = clampToAllowed(prev.gpus_per_server);
      const tp = clampToAllowed(prev.tp_multiplier_Z);
      if (gpu !== prev.gpus_per_server || tp !== prev.tp_multiplier_Z) {
        return { ...prev, gpus_per_server: gpu, tp_multiplier_Z: tp };
      }
      return prev;
    });
  }, [formData.gpus_per_server, formData.tp_multiplier_Z]);

  const handleChange = (name, value) => {
    const integerFields = [
      'internal_users', 'external_users', 'layers_L', 'hidden_size_H',
      'gpus_per_server', 'bytes_per_param', 'bytes_per_kv_state',
      'dialog_turns', 'tp_multiplier_Z', 'max_context_window_TSmax'
    ];

    const parsedValue = parseFloat(value) || 0;
    const finalValue = integerFields.includes(name) ? Math.round(parsedValue) : parsedValue;

    setFormData(prev => ({
      ...prev,
      [name]: finalValue
    }));
  };

  const buildPayload = () => {
    const payload = { ...formData };
    if (payload.gpu_flops_Fcount === null || payload.gpu_flops_Fcount === '' || payload.gpu_flops_Fcount === 0) {
      delete payload.gpu_flops_Fcount;
    }
    if (payload.th_prefill_empir === null || payload.th_prefill_empir === '' || payload.th_prefill_empir === 0) {
      delete payload.th_prefill_empir;
    }
    if (payload.th_decode_empir === null || payload.th_decode_empir === '' || payload.th_decode_empir === 0) {
      delete payload.th_decode_empir;
    }
    return payload;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(buildPayload());
  };

  const applyPreset = (preset) => {
    setFormData({ ...preset.data });
    setSelectedGpu(preset.gpu || null);
    setSelectedModel(preset.model || null);
    setSelectedPreset(preset.id);
    setModelSearch('');
    setSearchResults([]);
  };

  const toggleSection = (sectionKey) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  // Function to search for models on Hugging Face
  const searchModels = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`https://huggingface.co/api/models?search=${encodeURIComponent(query)}&limit=10`);
      const models = await response.json();

      const relevantModels = models.filter(model => {
        return model.tags && Array.isArray(model.tags) &&
               (model.tags.includes('transformers') ||
                model.tags.includes('gpt') ||
                model.tags.includes('llama') ||
                model.tags.includes('pytorch') ||
                model.config);
      });

      setSearchResults(relevantModels);
    } catch (error) {
      console.error('Error searching for models:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // State for model warning
  const [modelWarning, setModelWarning] = useState(null);

  // Handle model selection
  const handleModelSelect = async (model) => {
    setSelectedModel(model);
    setModelSearch('');
    setModelWarning(null);

    try {
      const modelId = model.modelId || model.id;
      const response = await fetch(`https://huggingface.co/api/models/${modelId}`);
      const modelDetails = await response.json();

      const updatedData = { ...formData };

      // Extract parameter count from safetensors info
      if (modelDetails.safetensors && modelDetails.safetensors.parameters) {
        const paramsObj = modelDetails.safetensors.parameters;
        if (paramsObj && typeof paramsObj === 'object') {
          const paramCounts = Object.values(paramsObj);
          if (paramCounts.length > 0) {
            const paramCount = paramCounts[0];
            if (typeof paramCount === 'number') {
              const paramsInBillions = Math.round((paramCount / 1e9) * 10) / 10;
              if (!isNaN(paramsInBillions) && paramsInBillions > 0) {
                updatedData.params_billions = paramsInBillions;
              }
            }
          }
        }
      }

      // Fallback: parse from model card data
      if (updatedData.params_billions === formData.params_billions && modelDetails.cardData && modelDetails.cardData.tags) {
        const paramTag = modelDetails.cardData.tags.find(tag =>
          (tag.includes('b') || tag.includes('m')) && !isNaN(tag.replace(/[a-zA-Z]/g, ''))
        );
        if (paramTag) {
          const paramValue = parseFloat(paramTag.replace(/[a-zA-Z]/g, ''));
          if (!isNaN(paramValue)) {
            const unit = paramTag.toLowerCase().includes('b') ? 1 : 0.001;
            updatedData.params_billions = paramValue * unit;
          }
        }
      }

      // Fallback: parse from model name
      if (updatedData.params_billions === formData.params_billions) {
        const modelName = modelId.toLowerCase();
        const paramMatch = modelName.match(/(\d+\.?\d*)([b|m])/i);
        if (paramMatch) {
          const paramValue = parseFloat(paramMatch[1]);
          const unit = paramMatch[2].toLowerCase();
          if (unit === 'b') {
            updatedData.params_billions = paramValue;
          } else if (unit === 'm') {
            updatedData.params_billions = paramValue * 0.001;
          }
        }
      }

      setFormData(updatedData);
      setSearchResults([]);

    } catch (error) {
      console.error('Error fetching model details:', error);
      setSelectedModel(model);
      setModelWarning("Could not automatically extract model parameters. Please adjust values manually.");
      setSearchResults([]);
    }
  };

  // Handle search input change with debounce
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setModelSearch(value);

    if (value.length > 2) {
      setTimeout(() => {
        searchModels(value);
      }, 500);
    } else {
      setSearchResults([]);
    }
  };

  // Helper function to render a collapsible section
  const renderCollapsibleSection = (key, title, inputs, isExpanded, tooltip = '') => (
    <div className="bg-gray-50 rounded-lg border border-gray-200 mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => toggleSection(key)}
        className="w-full flex justify-between items-center p-4 text-left text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors"
      >
        <span className="font-semibold flex items-center">
          {title}
          {tooltip && <SectionTooltip text={tooltip} />}
        </span>
        <svg
          className={`w-5 h-5 transform transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isExpanded
            ? 'max-h-screen opacity-100'
            : 'max-h-0 opacity-0'
        }`}
      >
        <div className="p-4 pt-2 border-t border-gray-200">
          {inputs}
        </div>
      </div>
    </div>
  );

  // Fields locked when auto-mode is active
  const AUTO_LOCKED_FIELDS = [
    'gpu_mem_gb', 'gpu_flops_Fcount', 'gpus_per_server',
    'tp_multiplier_Z', 'saturation_coeff_C', 'bytes_per_param', 'kavail',
  ];

  const isFieldLocked = (name) => autoMode && AUTO_LOCKED_FIELDS.includes(name);

  // Helper function to create slider with text input
  const renderSliderInput = (name, label, min, max, step, value, unit = '', tooltip = '') => {
    const integerFields = [
      'internal_users', 'external_users', 'layers_L', 'hidden_size_H',
      'gpus_per_server', 'bytes_per_param', 'bytes_per_kv_state',
      'dialog_turns', 'tp_multiplier_Z', 'max_context_window_TSmax'
    ];

    const isInteger = integerFields.includes(name);
    const disabled = isFieldLocked(name);

    const handleSliderChange = (e) => {
      if (disabled) return;
      const newValue = isInteger ? Math.round(e.target.value) : e.target.value;
      handleChange(name, newValue);
    };

    const handleInputChange = (e) => {
      if (disabled) return;
      let newValue = e.target.value;
      if (newValue !== '') {
        if (isInteger) {
          newValue = Math.round(parseFloat(newValue) || 0);
        } else {
          newValue = parseFloat(newValue) || 0;
        }
        if (!isNaN(newValue)) {
          newValue = Math.min(Math.max(newValue, min), max);
          handleChange(name, newValue);
        }
      } else {
        handleChange(name, 0);
      }
    };

    return (
      <div className={`mb-6 ${disabled ? 'opacity-50 pointer-events-none' : ''}`} key={name}>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium text-gray-700 flex items-center">
            {label}
            {disabled && (
              <span className="ml-1.5 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-normal">auto</span>
            )}
            {tooltip && <InfoTooltip text={tooltip} />}
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              min={min}
              max={max}
              step={isInteger ? 1 : "any"}
              value={value}
              onChange={handleInputChange}
              disabled={disabled}
              className={`px-2 py-1 text-sm border border-gray-300 rounded-md text-right ${max >= 1000000 ? 'w-28' : 'w-20'} ${disabled ? 'bg-gray-100' : ''}`}
              inputMode={isInteger ? "numeric" : "decimal"}
              placeholder="0"
            />
            <span className="text-sm text-gray-500 font-medium">{unit}</span>
          </div>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleSliderChange}
          disabled={disabled}
          className="w-full rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{typeof min === 'number' && min >= 1000 ? min.toLocaleString() : min}{unit}</span>
          <span>{typeof max === 'number' && max >= 1000 ? max.toLocaleString() : max}{unit}</span>
        </div>
      </div>
    );
  };

  // Basic configuration inputs
  const basicInputs = (
    <div className="space-y-6">
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <h3 className="text-lg font-medium text-blue-800 mb-4 flex items-center">
          Users
          <SectionTooltip text="Define the total user base. Fine-tune adoption and concurrency rates in the Advanced tab." />
        </h3>
        {renderSliderInput('internal_users', 'Total Users', 0, 100000000, 1000, formData.internal_users, '', 'Total number of internal users who may access the AI service.')}
      </div>

      <div className="bg-green-50 rounded-lg p-4 border border-green-200" data-tour="model-search">
        <h3 className="text-lg font-medium text-green-800 mb-4 flex items-center">
          Model
          <SectionTooltip text="Search for a model on Hugging Face to auto-fill architecture parameters, or set them manually in the Advanced tab." />
        </h3>

        {/* Model search */}
        <div className="mb-4 relative">
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
            Search Model
            <InfoTooltip text="Search Hugging Face to find your model. Parameters like size, layers, and hidden dim will be filled automatically." />
          </label>
          <input
            type="text"
            value={modelSearch}
            onChange={handleSearchChange}
            placeholder="Search for a model (e.g., llama, gpt, etc.)"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />

          {isSearching && (
            <div className="absolute right-3 top-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-md max-h-60 overflow-auto">
              {searchResults.map((model, index) => (
                <div
                  key={index}
                  onClick={() => handleModelSelect(model)}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                >
                  <div className="font-medium">{model.modelId || model.id}</div>
                  <div className="text-xs text-gray-500 truncate">{model.description || 'No description'}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedModel && (
          <div className="mt-4 mb-4">
            <div className="p-3 bg-green-50 border-2 border-green-400 rounded-md shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center min-w-0">
                  <svg className="w-5 h-5 text-green-600 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-green-700 uppercase tracking-wide mb-0.5">Selected Model</div>
                    <div className="text-sm font-semibold text-green-900 truncate">{selectedModel.modelId || selectedModel.id}</div>
                  </div>
                </div>
                <a
                  href={`https://huggingface.co/${selectedModel.modelId || selectedModel.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 p-1 rounded-lg hover:bg-yellow-50 transition-colors flex-shrink-0"
                  title="Open on Hugging Face"
                >
                  <img src="/huggingface-color.png" alt="Hugging Face" className="w-6 h-6" />
                </a>
              </div>
            </div>

            {modelWarning && (
              <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md flex justify-between items-start">
                <div className="text-sm text-yellow-800">{modelWarning}</div>
                <button
                  type="button"
                  onClick={() => setModelWarning(null)}
                  className="text-yellow-800 hover:text-yellow-900"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-purple-50 rounded-lg p-4 border border-purple-200" data-tour="gpu-search">
        <h3 className="text-lg font-medium text-purple-800 mb-4 flex items-center">
          Hardware
          <SectionTooltip text="Choose the GPU accelerator and server layout. Memory and TFLOPS are auto-filled from the GPU catalog." />
        </h3>

        {/* GPU Selection with Search — or GPU Filter in autoMode */}
        {autoMode ? (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
              GPU Selection
              <span className="ml-1.5 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-normal">auto</span>
              <InfoTooltip text="In auto-optimize mode GPUs are selected automatically. Use the filter to restrict which GPUs to consider." />
            </label>
            <button
              type="button"
              onClick={onOpenGpuFilter}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-purple-300 rounded-lg text-sm font-medium text-purple-700 hover:bg-purple-100 hover:border-purple-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              GPU Filter{gpuFilter && gpuFilter.length > 0 ? ` (${gpuFilter.length} selected)` : ' (all GPUs)'}
            </button>
          </div>
        ) : (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
              GPU
              <InfoTooltip text="Open the catalog to choose one GPU. Memory and compute specs will be filled in automatically." />
            </label>
            <button
              type="button"
              onClick={() => onOpenGpuPicker(selectedGpu?.id)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-purple-300 rounded-lg text-sm font-medium text-purple-700 hover:bg-purple-50 hover:border-purple-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              {selectedGpu ? (selectedGpu.full_name || `${selectedGpu.vendor} ${selectedGpu.model}`) : 'Select GPU'}
            </button>
            {selectedGpu && (
              <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-purple-600 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-purple-700 uppercase tracking-wide mb-0.5">Selected GPU</div>
                    <div className="text-sm font-semibold text-purple-900">
                      {selectedGpu.full_name || `${selectedGpu.vendor} ${selectedGpu.model}`}
                      <span className="text-purple-700 font-normal ml-1">
                        ({selectedGpu.memory_size_formatted || `${selectedGpu.memory_gb} GB`})
                        {selectedGpu.tflops ? ` | ${selectedGpu.tflops} TFLOPS` : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {(() => {
          const gpuPerServerAllowed = [1, 2, 4, 6, 8];
          const gpuLocked = isFieldLocked('gpus_per_server');
          const currentVal = formData.gpus_per_server;
          const currentIdx = Math.max(0, gpuPerServerAllowed.indexOf(currentVal) !== -1
            ? gpuPerServerAllowed.indexOf(currentVal)
            : gpuPerServerAllowed.reduce((best, v, i) => Math.abs(v - currentVal) < Math.abs(gpuPerServerAllowed[best] - currentVal) ? i : best, 0));
          const displayVal = gpuPerServerAllowed[currentIdx];
          return (
            <div className={`mb-6 ${gpuLocked ? 'opacity-50 pointer-events-none' : ''}`} key="gpus_per_server">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700 flex items-center">
                  GPUs per Server
                  {gpuLocked && (
                    <span className="ml-1.5 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-normal">auto</span>
                  )}
                  <InfoTooltip text="Number of GPU accelerators installed in each physical server. Allowed: 1, 2, 4, 6, 8." />
                </label>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 text-sm border border-gray-300 rounded-md text-right w-20 inline-block text-center font-medium ${gpuLocked ? 'bg-gray-100' : 'bg-white'}`}>
                    {displayVal}
                  </span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={gpuPerServerAllowed.length - 1}
                step={1}
                value={currentIdx}
                onChange={(e) => !gpuLocked && handleChange('gpus_per_server', gpuPerServerAllowed[parseInt(e.target.value)])}
                disabled={gpuLocked}
                className="w-full rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>{gpuPerServerAllowed[0]}</span>
                <span>{gpuPerServerAllowed[gpuPerServerAllowed.length - 1]}</span>
              </div>
            </div>
          );
        })()}
        {renderSliderInput('kavail', 'Usable Memory Fraction', 0.5, 1.0, 0.01, formData.kavail, '', 'Fraction of GPU memory available after OS/driver overhead. Typically 0.85–0.95.')}
      </div>

      <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
        <h3 className="text-lg font-medium text-orange-800 mb-4 flex items-center">
          Tensor Parallelism
          <SectionTooltip text="Tensor parallelism splits one model across multiple GPUs, increasing available memory per instance." />
        </h3>
        {(() => {
          const tpAllowed = [1, 2, 4, 6, 8];
          const tpLocked = isFieldLocked('tp_multiplier_Z');
          const currentIdx = Math.max(0, tpAllowed.indexOf(formData.tp_multiplier_Z) !== -1
            ? tpAllowed.indexOf(formData.tp_multiplier_Z)
            : tpAllowed.reduce((best, v, i) => Math.abs(v - formData.tp_multiplier_Z) < Math.abs(tpAllowed[best] - formData.tp_multiplier_Z) ? i : best, 0));
          return (
            <div className={`mb-6 ${tpLocked ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700 flex items-center">
                  TP Degree (Z)
                  {tpLocked && (
                    <span className="ml-1.5 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-normal">auto</span>
                  )}
                  <InfoTooltip text="Number of GPUs across which the model is split. Z=1 means no parallelism; higher even values increase memory per instance but add inter-GPU communication." />
                </label>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 text-sm border border-gray-300 rounded-md text-right w-20 inline-block text-center font-medium ${tpLocked ? 'bg-gray-100' : 'bg-white'}`}>
                    {formData.tp_multiplier_Z}
                  </span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={tpAllowed.length - 1}
                step={1}
                value={currentIdx}
                onChange={(e) => !tpLocked && handleChange('tp_multiplier_Z', tpAllowed[parseInt(e.target.value)])}
                disabled={tpLocked}
                className="w-full rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>{tpAllowed[0]}</span>
                <span>{tpAllowed[tpAllowed.length - 1]}</span>
              </div>
            </div>
          );
        })()}
        {renderSliderInput('saturation_coeff_C', 'Saturation Coefficient', 1, 32, 1, formData.saturation_coeff_C, '', 'Controls diminishing returns of batch processing. Higher C = throughput saturates at larger batch sizes.')}
      </div>
    </div>
  );

  // Advanced configuration inputs
  const advancedInputs = (
    <div className="space-y-6">
      {/* Model Section */}
      {renderCollapsibleSection(
        'model',
        'Model Architecture',
        <>
          {renderSliderInput('params_billions', 'Parameters', 0.1, 200, 0.1, formData.params_billions, 'B', 'Total number of trainable parameters in the model (in billions).')}
          {renderSliderInput('bytes_per_param', 'Precision (bytes/param)', 1, 4, 0.5, formData.bytes_per_param, '', 'Bytes per parameter after quantization. FP16 = 2, INT8 = 1, FP32 = 4.')}
          {renderSliderInput('overhead_factor', 'Memory Overhead', 1.0, 2.0, 0.05, formData.overhead_factor, '', 'Multiplier for extra memory used by framework buffers, activations, etc. Typically 1.1–1.2.')}
          {renderSliderInput('emp_model', 'Empirical Correction', 1.0, 1.5, 0.01, formData.emp_model, '', 'Empirical correction factor if measured model memory differs from the theoretical estimate.')}
          {renderSliderInput('layers_L', 'Transformer Layers', 1, 128, 1, formData.layers_L, '', 'Number of transformer blocks in the model (e.g. 32 for 7B, 80 for 70B).')}
          {renderSliderInput('hidden_size_H', 'Hidden Dimension', 512, 16384, 256, formData.hidden_size_H, '', 'Size of the hidden representation (embedding dimension). Found in model config as hidden_size.')}
        </>,
        expandedSections.model,
        'Core architecture parameters that determine the model\'s memory footprint on GPU.'
      )}

      {/* Users & Behavior */}
      {renderCollapsibleSection(
        'users',
        'User Behavior',
        <>
          {renderSliderInput('penetration_internal', 'Adoption Rate', 0, 1, 0.01, formData.penetration_internal, '', 'Fraction of total users who actively use the AI service. 0.1 = 10% adoption.')}
          {renderSliderInput('concurrency_internal', 'Concurrency Rate', 0, 1, 0.01, formData.concurrency_internal, '', 'Fraction of active users sending requests at the same time. 0.05 = 5% concurrency.')}
          {renderSliderInput('sessions_per_user_J', 'Sessions per User', 1, 10, 1, formData.sessions_per_user_J, '', 'Average number of parallel chat sessions each active user keeps open.')}
        </>,
        expandedSections.users,
        'Controls how many users are active simultaneously and how they generate load.'
      )}

      {/* Tokens Section */}
      {renderCollapsibleSection(
        'tokens',
        'Token Budget',
        <>
          {renderSliderInput('system_prompt_tokens_SP', 'System Prompt', 0, 10000, 100, formData.system_prompt_tokens_SP, 'tok', 'Tokens in the system prompt — instructions and context prepended to every request.')}
          {renderSliderInput('user_prompt_tokens_Prp', 'User Message', 0, 5000, 10, formData.user_prompt_tokens_Prp, 'tok', 'Average number of tokens in a single user message.')}
          {renderSliderInput('reasoning_tokens_MRT', 'Reasoning Tokens', 0, 16384, 256, formData.reasoning_tokens_MRT, 'tok', 'Token budget for chain-of-thought / reasoning. Set to 0 if the model does not use reasoning.')}
          {renderSliderInput('answer_tokens_A', 'Response Length', 0, 5000, 10, formData.answer_tokens_A, 'tok', 'Average number of tokens the model generates per response.')}
          {renderSliderInput('dialog_turns', 'Dialog Turns', 1, 20, 1, formData.dialog_turns, '', 'Number of user↔model turns in a typical conversation session.')}
        </>,
        expandedSections.tokens,
        'Token counts that define a typical request and conversation. These determine memory and compute requirements.'
      )}

      {/* KV-Cache Section */}
      {renderCollapsibleSection(
        'kv',
        'KV-Cache',
        <>
          {renderSliderInput('bytes_per_kv_state', 'KV Precision (bytes)', 1, 4, 0.5, formData.bytes_per_kv_state, '', 'Bytes per KV-cache element. FP16 = 2, INT8 = 1. Lower values save memory per session.')}
          {renderSliderInput('emp_kv', 'KV Empirical Factor', 1.0, 1.5, 0.01, formData.emp_kv, '', 'Empirical correction if measured KV-cache size differs from theoretical estimate.')}
          {renderSliderInput('max_context_window_TSmax', 'Max Context Length', 1024, 131072, 1024, formData.max_context_window_TSmax, 'tok', 'Maximum sequence length (context window) the model supports, in tokens.')}
        </>,
        expandedSections.kv,
        'Key-Value cache stores attention states for each session. Larger contexts and more sessions require more GPU memory.'
      )}

      {/* Compute Section */}
      {renderCollapsibleSection(
        'compute',
        'Compute & Throughput',
        <>
          {renderSliderInput('gpu_flops_Fcount', 'GPU Performance', 0, 2000, 10, formData.gpu_flops_Fcount || 0, 'TFLOPS', 'Peak half-precision (FP16/BF16) TFLOPS of the selected GPU. Auto-filled from GPU catalog.')}
          {renderSliderInput('eta_prefill', 'Prefill Efficiency', 0.05, 0.5, 0.01, formData.eta_prefill, '', 'GPU utilization during the prefill phase (processing the prompt). Typically 0.15–0.30.')}
          {renderSliderInput('eta_decode', 'Decode Efficiency', 0.05, 0.5, 0.01, formData.eta_decode, '', 'GPU utilization during the decode phase (generating tokens). Typically 0.10–0.20.')}
          <div className="text-xs text-gray-500 mb-4 p-2 bg-blue-50 rounded flex items-center">
            <svg className="w-4 h-4 mr-1.5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            If you have benchmark data, set measured throughput below to override analytical estimates.
          </div>
          {renderSliderInput('th_prefill_empir', 'Measured Prefill Speed', 0, 100000, 100, formData.th_prefill_empir || 0, 'tok/s', 'Actual measured prefill throughput from benchmarks. Overrides analytical calculation when set.')}
          {renderSliderInput('th_decode_empir', 'Measured Decode Speed', 0, 100000, 100, formData.th_decode_empir || 0, 'tok/s', 'Actual measured decode throughput from benchmarks. Overrides analytical calculation when set.')}
        </>,
        expandedSections.compute,
        'GPU compute capacity and throughput estimation. Determines how many requests each server can handle.'
      )}

      {/* SLA Section */}
      {renderCollapsibleSection(
        'sla',
        'SLA & Load',
        <>
          {renderSliderInput('rps_per_session_R', 'Request Rate', 0.001, 1, 0.001, formData.rps_per_session_R, '', 'Average requests per second generated by each active session. A typical chat session ≈ 0.02 req/s.')}
          {renderSliderInput('sla_reserve_KSLA', 'SLA Headroom', 1, 3, 0.05, formData.sla_reserve_KSLA, '', 'Safety multiplier to ensure capacity meets SLA targets. 1.25 = 25% extra headroom.')}
        </>,
        expandedSections.sla,
        'Service-level parameters that add safety margin to the final server count.'
      )}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="gap-6 flex flex-col flex-1">
      {/* Header with toggle switch */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-semibold text-gray-800">Configuration Parameters</h2>
        <ToggleSwitch
          autoMode={autoMode}
          setAutoMode={setAutoMode}
        />
      </div>

      {/* Presets (normal mode) or Optimization Mode cards (auto mode) */}
      {autoMode ? (
        <div className="mb-2">
          <label className="block text-sm font-medium text-gray-600 mb-2">Optimization Mode</label>
          <div className="grid grid-cols-2 gap-2">
            {OPTIMIZATION_MODES.map((mode) => {
              const isSelected = optimizeMode === mode.id;
              const colors = CARD_COLOR_MAP[mode.color];
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setOptimizeMode(mode.id)}
                  className={`p-2.5 rounded-lg border-2 text-left transition-all duration-200 ${
                    isSelected
                      ? `${colors.selected} border-current shadow-sm`
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    {mode.icon}
                    <span className="text-sm font-semibold">{mode.name}</span>
                  </div>
                  <p className="text-xs opacity-75 leading-relaxed">{mode.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mb-2" data-tour="presets">
          <label className="block text-sm font-medium text-gray-600 mb-2">Quick Presets</label>
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((preset) => {
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
                      ? `${colors.selected} border-current shadow-sm`
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    {preset.icon}
                    <span className="text-sm font-semibold leading-tight">{preset.name}</span>
                  </div>
                  <p className="text-xs opacity-60 leading-snug">{preset.subtitle}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          data-tour="basic-tab"
          className={`py-2 px-4 font-medium text-sm ${
            activeTab === 'basic'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('basic')}
        >
          Basic Configuration
        </button>
        <button
          type="button"
          data-tour="advanced-tab"
          className={`py-2 px-4 font-medium text-sm ${
            activeTab === 'advanced'
              ? 'text-gray-600 border-b-2 border-gray-600 bg-gray-50'
              : 'text-gray-400 hover:text-gray-600 bg-gray-50'
          }`}
          onClick={() => setActiveTab('advanced')}
        >
          Advanced
        </button>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'basic' && basicInputs}
        {activeTab === 'advanced' && advancedInputs}
      </div>

      {/* Calculate / Find Best Configs button */}
      <button
        type="submit"
        data-tour="calculate-btn"
        disabled={loading}
        className={`mt-auto w-full py-3 px-4 rounded-lg font-semibold text-lg transition-colors ${
          loading
            ? (autoMode ? 'bg-indigo-300 text-white cursor-not-allowed' : 'bg-blue-300 text-white cursor-not-allowed')
            : (autoMode ? 'bg-indigo-600 text-white hover:bg-indigo-700 calc-btn-glow' : 'bg-blue-600 text-white hover:bg-blue-700 calc-btn-glow')
        }`}
      >
        {loading ? (
          <span className="flex items-center justify-center">
            <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></span>
            {autoMode ? 'Searching configurations...' : 'Calculating...'}
          </span>
        ) : autoMode ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Find Best Configs
          </span>
        ) : (
          'Calculate'
        )}
      </button>

    </form>
  );
};

export default CalculatorForm;
