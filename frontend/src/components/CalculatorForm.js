import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { getGPUs, searchGPUs } from '../services/api';

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
    name: '32B / 500K users / A100 80GB / Z=4',
    description: 'Reference example from Excel calculator (MRT=0, 23 servers)',
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
    name: '7B / 2K users / A100 80GB / Z=1',
    description: 'Small model, low workload',
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
    name: '70B / 10K users / H100 80GB / Z=2',
    description: 'Large model with reasoning, medium workload',
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

const CalculatorForm = ({ onSubmit, loading }) => {
  // State for GPU search
  const [gpuSearch, setGpuSearch] = useState('');
  const [gpuSearchResults, setGpuSearchResults] = useState([]);
  const [isGpuSearching, setIsGpuSearching] = useState(false);

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
    tp: false,
    compute: false,
    sla: false,
  });

  const [activeTab, setActiveTab] = useState('basic'); // 'basic' or 'advanced'

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

  // Handle GPU search when gpuSearch changes
  useEffect(() => {
    if (gpuSearch.trim()) {
      searchGPUsByQuery(gpuSearch);
    } else {
      setGpuSearchResults([]);
    }
  }, [gpuSearch]);

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
    setGpuSearch('');
    setGpuSearchResults([]);
    setModelSearch('');
    setSearchResults([]);
  };

  const toggleSection = (sectionKey) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  // Handle GPU selection
  const handleGpuSelect = (gpu) => {
    setSelectedGpu(gpu);
    setGpuSearch('');
    setGpuSearchResults([]);

    setFormData(prev => ({
      ...prev,
      gpu_id: gpu.id,
      gpu_mem_gb: gpu.memory_gb,
      gpus_per_server: gpu.recommended_gpus_per_server || 8,
      // Auto-fill TFLOPS from GPU catalog (Half Precision / Tensor Core)
      gpu_flops_Fcount: gpu.tflops || prev.gpu_flops_Fcount,
    }));
  };

  // Function to search for GPUs using the API service
  const searchGPUsByQuery = async (query) => {
    if (!query.trim()) {
      setGpuSearchResults([]);
      return;
    }

    setIsGpuSearching(true);
    try {
      const data = await searchGPUs(query, { per_page: 10 });
      if (data && data.gpus) {
        setGpuSearchResults(data.gpus);
      } else {
        setGpuSearchResults([]);
      }
    } catch (error) {
      console.error('Error searching for GPUs:', error);
      setGpuSearchResults([]);
    } finally {
      setIsGpuSearching(false);
    }
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

  // Helper function to create slider with text input
  const renderSliderInput = (name, label, min, max, step, value, unit = '', tooltip = '') => {
    const integerFields = [
      'internal_users', 'external_users', 'layers_L', 'hidden_size_H',
      'gpus_per_server', 'bytes_per_param', 'bytes_per_kv_state',
      'dialog_turns', 'tp_multiplier_Z', 'max_context_window_TSmax'
    ];

    const isInteger = integerFields.includes(name);

    const handleSliderChange = (e) => {
      const newValue = isInteger ? Math.round(e.target.value) : e.target.value;
      handleChange(name, newValue);
    };

    const handleInputChange = (e) => {
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
      <div className="mb-6" key={name}>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium text-gray-700 flex items-center">
            {label}
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
              className={`px-2 py-1 text-sm border border-gray-300 rounded-md text-right ${max >= 1000000 ? 'w-28' : 'w-20'}`}
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
        {renderSliderInput('internal_users', 'Total Users', 0, 1000000, 1000, formData.internal_users, '', 'Total number of internal users who may access the AI service.')}
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
              <div className="flex items-center">
                <svg className="w-5 h-5 text-green-600 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <div className="text-xs font-medium text-green-700 uppercase tracking-wide mb-0.5">Selected Model</div>
                  <div className="text-sm font-semibold text-green-900">{selectedModel.modelId || selectedModel.id}</div>
                </div>
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

        {/* GPU Selection with Search */}
        <div className="mb-4 relative">
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
            Search GPU
            <InfoTooltip text="Search the GPU catalog by name (e.g. A100, H100, RTX 4090). Memory and compute specs will be filled in automatically." />
          </label>
          <input
            type="text"
            value={gpuSearch}
            onChange={(e) => setGpuSearch(e.target.value)}
            placeholder="Search for a GPU (e.g., RTX, A100, etc.)"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />

          {isGpuSearching && (
            <div className="absolute right-3 top-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
            </div>
          )}

          {gpuSearchResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-md max-h-60 overflow-auto">
              {gpuSearchResults.map((gpu, index) => (
                <div
                  key={gpu.id}
                  onClick={() => handleGpuSelect(gpu)}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                >
                  <div className="font-medium">{gpu.full_name || `${gpu.vendor} ${gpu.model}`}</div>
                  <div className="text-xs text-gray-500">
                    Memory: {gpu.memory_size_formatted || `${gpu.memory_gb} GB`} |
                    TDP: {gpu.tdp_watts || 'Unknown W'} |
                    Cores: {gpu.cores || 'Unknown'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedGpu && (
            <div className="mt-4">
              <div className="p-3 bg-purple-50 border-2 border-purple-400 rounded-md shadow-sm">
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
            </div>
          )}
        </div>

        {renderSliderInput('gpus_per_server', 'GPUs per Server', 1, 16, 1, formData.gpus_per_server, '', 'Number of GPU accelerators installed in each physical server.')}
        {renderSliderInput('kavail', 'Usable Memory Fraction', 0.5, 1.0, 0.01, formData.kavail, '', 'Fraction of GPU memory available after OS/driver overhead. Typically 0.85–0.95.')}
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

      {/* Tensor Parallelism Section */}
      {renderCollapsibleSection(
        'tp',
        'Tensor Parallelism',
        <>
          {renderSliderInput('tp_multiplier_Z', 'TP Degree (Z)', 1, 8, 1, formData.tp_multiplier_Z, '', 'Number of GPUs across which the model is split. Higher Z = more memory per instance but more inter-GPU communication.')}
          {renderSliderInput('saturation_coeff_C', 'Saturation Coefficient', 1, 32, 1, formData.saturation_coeff_C, '', 'Controls diminishing returns of batch processing. Higher C = throughput saturates at larger batch sizes.')}
        </>,
        expandedSections.tp,
        'Tensor parallelism splits one model across multiple GPUs, increasing available memory per instance.'
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
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-800 mb-6">Configuration Parameters</h2>

      {/* Presets */}
      <div className="mb-4" data-tour="presets">
        <label className="block text-sm font-medium text-gray-600 mb-2">Quick Presets</label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset)}
              title={preset.description}
              className="px-3 py-1.5 text-xs font-medium rounded-full border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-400 transition-colors"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

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

      {/* Calculate button */}
      <button
        type="submit"
        data-tour="calculate-btn"
        disabled={loading}
        className={`w-full py-3 px-4 rounded-lg font-semibold text-lg transition-colors ${
          loading
            ? 'bg-blue-300 text-white cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700 calc-btn-glow'
        }`}
      >
        {loading ? (
          <span className="flex items-center justify-center">
            <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></span>
            Calculating...
          </span>
        ) : (
          'Calculate'
        )}
      </button>
    </form>
  );
};

export default CalculatorForm;
