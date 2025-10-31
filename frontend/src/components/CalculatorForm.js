import React, { useState, useEffect } from 'react';
import { getGPUs, searchGPUs } from '../services/api';

const CalculatorForm = ({ onSubmit, loading }) => {
  // State for GPU data
  const [gpuData, setGpuData] = useState([]);
  const [loadingGpus, setLoadingGpus] = useState(false);
  // State for GPU search
  const [gpuSearch, setGpuSearch] = useState('');
  const [gpuSearchResults, setGpuSearchResults] = useState([]);
  const [isGpuSearching, setIsGpuSearching] = useState(false);

  // Initial form values based on the SizingInput dataclass
  const [formData, setFormData] = useState({
    // Users & behavior
    internal_users: 100,
    penetration_internal: 0.1,
    concurrency_internal: 0.2,
    external_users: 0,
    penetration_external: 0.05,
    concurrency_external: 0.1,

    // Tokens & sessions
    prompt_tokens_P: 350,
    answer_tokens_A: 200,
    rps_per_active_user_R: 0.05,
    session_duration_sec_t: 300,

    // Model
    params_billions: 7,
    bytes_per_param: 2,
    overhead_factor: 1.1,
    layers_L: 32,
    hidden_size_H: 4096,

    // KV
    bytes_per_kv_state: 2,
    paged_attention_gain_Kopt: 1.5,

    // Hardware
    gpu_mem_gb: 0, // Changed to 0 as default (no GPU selected)
    gpus_per_server: 8,
    mem_reserve_fraction: 0.07,

    // Empirics
    tps_per_instance: 100,
    batching_coeff: 1.2,
    sla_reserve: 1.25,
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
    empirics: false
  });

  const [activeTab, setActiveTab] = useState('basic'); // 'basic' or 'advanced'

  // Load GPU data on component mount
  useEffect(() => {
    const loadGpuData = async () => {
      setLoadingGpus(true);
      try {
        const response = await getGPUs({ per_page: 100 }); // Load up to 100 GPUs
        if (response && response.gpus) {
          setGpuData(response.gpus);
        } else {
          setGpuData([]);
        }
      } catch (error) {
        console.error('Error loading GPU data:', error);
        setGpuData([]);
      } finally {
        setLoadingGpus(false);
      }
    };

    loadGpuData();
  }, []);

  // Auto-calculate when form data changes (with debounce)
  useEffect(() => {
    if (selectedModel && formData.gpu_mem_gb > 0) {
      const handler = setTimeout(() => {
        onSubmit(formData);
      }, 500); // 0.5 second delay to allow for faster updates when sliding

      // Cleanup function to clear the timeout if data changes again
      return () => {
        clearTimeout(handler);
      };
    }
  }, [formData, selectedModel, onSubmit]);

  // Handle GPU search when gpuSearch changes
  useEffect(() => {
    if (gpuSearch.trim()) {
      searchGPUsByQuery(gpuSearch);
    } else {
      setGpuSearchResults([]);
    }
  }, [gpuSearch]);

  const handleChange = (name, value) => {
    // Determine if the field should be an integer based on the API contract
    const integerFields = [
      'internal_users', 'external_users', 'layers_L', 'hidden_size_H', 
      'gpus_per_server', 'bytes_per_param', 'bytes_per_kv_state'
    ];
    
    const parsedValue = parseFloat(value) || 0;
    const finalValue = integerFields.includes(name) ? Math.round(parsedValue) : parsedValue;
    
    setFormData(prev => ({
      ...prev,
      [name]: finalValue
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Check if a model has been selected (indicated by selectedModel not being null)
    // and if a GPU has been selected (gpu_mem_gb > 0)
    if (!selectedModel) {
      alert("Please select a model before submitting.");
      return;
    }
    
    if (formData.gpu_mem_gb <= 0) {
      alert("Please select a GPU before submitting.");
      return;
    }
    
    // Since we're auto-calculating, we don't need to call onSubmit here
    // The calculation is already happening automatically when parameters change
    // We can still call onSubmit to ensure latest calculation if needed
    onSubmit(formData);
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
    
    // Update form data with GPU parameters
    setFormData(prev => ({
      ...prev,
      gpu_id: gpu.id,  // Add GPU ID to the form data
      gpu_mem_gb: gpu.memory_gb,
      gpus_per_server: gpu.recommended_gpus_per_server || 8,
      tps_per_instance: gpu.estimated_tps_per_instance || 1000,
      // Add other GPU-specific parameters here if needed
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
      // Using our API service to search for GPUs
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
      // Using Hugging Face API to search for models
      const response = await fetch(`https://huggingface.co/api/models?search=${encodeURIComponent(query)}&limit=10`);
      const models = await response.json();

      // Filter models that might have relevant information for our parameters
      const relevantModels = models.filter(model => {
        // Check if model has relevant data in its configuration
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
    setModelSearch(''); // Clear the search field after selection
    setModelWarning(null); // Clear any previous warnings
    
    try {
      // Get the model name
      const modelId = model.modelId || model.id;
      
      // Fetch model info from Hugging Face API
      const response = await fetch(`https://huggingface.co/api/models/${modelId}`);
      const modelDetails = await response.json();
      
      // Update form data with extracted parameters
      const updatedData = { ...formData };
      
      // Check for parameter count in safetensors info
      if (modelDetails.safetensors && modelDetails.safetensors.parameters) {
        // Extract parameters from safetensors info (e.g., BF16)
        const paramsObj = modelDetails.safetensors.parameters;
        if (paramsObj && typeof paramsObj === 'object') {
          // Look for the first parameter count in the object
          const paramCounts = Object.values(paramsObj);
          if (paramCounts.length > 0) {
            const paramCount = paramCounts[0];
            if (typeof paramCount === 'number') {
              // Convert to billions and round to 1 decimal place
              const paramsInBillions = Math.round((paramCount / 1e9) * 10) / 10;
              if (!isNaN(paramsInBillions) && paramsInBillions > 0) {
                updatedData.params_billions = paramsInBillions;
              }
            }
          }
        }
      }
      
      // If no parameters found in safetensors, try parsing from model card data
      if (updatedData.params_billions === formData.params_billions && modelDetails.cardData && modelDetails.cardData.tags) {
        // Look for parameter size in tags
        const paramTag = modelDetails.cardData.tags.find(tag => 
          (tag.includes('b') || tag.includes('m')) && !isNaN(tag.replace(/[a-zA-Z]/g, ''))
        );
        if (paramTag) {
          const paramValue = parseFloat(paramTag.replace(/[a-zA-Z]/g, ''));
          if (!isNaN(paramValue)) {
            const unit = paramTag.toLowerCase().includes('b') ? 1 : 0.001; // billion or million
            updatedData.params_billions = paramValue * unit;
          }
        }
      }
      
      // If still no parameters found, try parsing from model name
      if (updatedData.params_billions === formData.params_billions) {
        const modelName = modelId.toLowerCase();
        const paramMatch = modelName.match(/(\d+\.?\d*)([b|m])/i);
        
        if (paramMatch) {
          const paramValue = parseFloat(paramMatch[1]);
          const unit = paramMatch[2].toLowerCase();
          
          if (unit === 'b') {
            updatedData.params_billions = paramValue;
          } else if (unit === 'm') {
            updatedData.params_billions = paramValue * 0.001; // Convert millions to billions
          }
        }
      }
      
      setFormData(updatedData);
      setSearchResults([]);
      
    } catch (error) {
      console.error('Error fetching model details:', error);
      // If detailed fetch fails, just update the form with basic selection
      setSelectedModel(model);
      setModelWarning("Could not automatically extract model parameters. Please adjust values manually.");
      setSearchResults([]);
    }
  };

  // Handle GPU selection


  // Handle search input change with debounce
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setModelSearch(value);
    
    if (value.length > 2) {
      // Debounce the search to avoid too many API calls
      setTimeout(() => {
        searchModels(value);
      }, 500);
    } else {
      setSearchResults([]);
    }
  };

  // Helper function to render a collapsible section
  const renderCollapsibleSection = (key, title, inputs, isExpanded) => (
    <div className="bg-gray-50 rounded-lg border border-gray-200 mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => toggleSection(key)}
        className="w-full flex justify-between items-center p-4 text-left text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors"
      >
        <span className="font-semibold">{title}</span>
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
  const renderSliderInput = (name, label, min, max, step, value, unit = '') => {
    const integerFields = [
      'internal_users', 'external_users', 'layers_L', 'hidden_size_H', 
      'gpus_per_server', 'bytes_per_param', 'bytes_per_kv_state'
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
        // Only validate bounds if the value is a valid number
        if (!isNaN(newValue)) {
          // Ensure value stays within bounds
          newValue = Math.min(Math.max(newValue, min), max);
          handleChange(name, newValue);
        }
      } else {
        // If the input is empty, we can still update to 0 or let it remain as is
        handleChange(name, 0);
      }
    };

    return (
      <div className="mb-6" key={name}>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium text-gray-700">{label}</label>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              min={min}
              max={max}
              step={isInteger ? 1 : "any"}
              value={value}
              onChange={handleInputChange}
              className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md text-right"
              inputMode={isInteger ? "numeric" : "decimal"}
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
          className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{min}{unit}</span>
          <span>{max}{unit}</span>
        </div>
      </div>
    );
  };

  // Basic configuration inputs (internal users, external users, model, and hardware)
  const basicInputs = (
    <div className="space-y-6">
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <h3 className="text-lg font-medium text-blue-800 mb-4">Users Configuration</h3>
        {renderSliderInput('internal_users', 'Internal Users', 0, 10000, 100, formData.internal_users)}
      </div>
      
      <div className="bg-green-50 rounded-lg p-4 border border-green-200">
        <h3 className="text-lg font-medium text-green-800 mb-4">Model Configuration</h3>
        
        {/* Model search */}
        <div className="mb-4 relative">
          <label className="block text-sm font-medium text-gray-700 mb-2">Search Model</label>
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
          <div className="mb-4">
            <div className="p-3 bg-green-100 rounded-md">
              <div className="text-sm font-medium text-green-800">Selected: {selectedModel.modelId || selectedModel.id}</div>
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
      
      <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
        <h3 className="text-lg font-medium text-purple-800 mb-4">Hardware Configuration</h3>
        
        {/* GPU Selection with Search */}
        <div className="mb-4 relative">
          <label className="block text-sm font-medium text-gray-700 mb-2">Search GPU</label>
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
            <div className="mt-2">
              <div className="p-3 bg-purple-100 rounded-md">
                <div className="text-sm font-medium text-purple-800">
                  Selected: {selectedGpu.full_name || `${selectedGpu.vendor} ${selectedGpu.model}`} ({selectedGpu.memory_size_formatted || `${selectedGpu.memory_gb} GB`})
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Other hardware parameters */}
        {renderSliderInput('gpus_per_server', 'GPUs per Server', 1, 16, 1, formData.gpus_per_server)}
        {renderSliderInput('mem_reserve_fraction', 'Memory Reserve (0-1)', 0, 0.2, 0.01, formData.mem_reserve_fraction)}
      </div>
    </div>
  );

  // Advanced configuration inputs (all other parameters)
  const advancedInputs = (
    <div className="space-y-6">
      {/* Model Section */}
      {renderCollapsibleSection(
        'model',
        'Model',
        <>
          {renderSliderInput('params_billions', 'Params (Billions)', 0.1, 100, 0.1, formData.params_billions, 'B')}
          {renderSliderInput('bytes_per_param', 'Bytes per Param', 1, 4, 0.1, formData.bytes_per_param)}
          {renderSliderInput('overhead_factor', 'Overhead Factor', 1.0, 2.0, 0.05, formData.overhead_factor)}
          {renderSliderInput('layers_L', 'Layers', 1, 128, 1, formData.layers_L)}
          {renderSliderInput('hidden_size_H', 'Hidden Size', 512, 8192, 256, formData.hidden_size_H)}
        </>,
        expandedSections.model
      )}

      {/* Users & Behavior (excluding internal_users and external_users) */}
      {renderCollapsibleSection(
        'users',
        'Users & Behavior',
        <>
          {renderSliderInput('penetration_internal', 'Internal Penetration (0-1)', 0, 1, 0.01, formData.penetration_internal)}
          {renderSliderInput('concurrency_internal', 'Internal Concurrency (0-1)', 0, 1, 0.01, formData.concurrency_internal)}
          {renderSliderInput('external_users', 'External Users', 0, 50000, 1000, formData.external_users)}
          {renderSliderInput('penetration_external', 'External Penetration (0-1)', 0, 1, 0.01, formData.penetration_external)}
          {renderSliderInput('concurrency_external', 'External Concurrency (0-1)', 0, 1, 0.01, formData.concurrency_external)}
        </>,
        expandedSections.users
      )}

      {/* Tokens & Sessions Section */}
      {renderCollapsibleSection(
        'tokens',
        'Tokens & Sessions',
        <>
          {renderSliderInput('prompt_tokens_P', 'Prompt Tokens', 0, 2000, 10, formData.prompt_tokens_P, '')}
          {renderSliderInput('answer_tokens_A', 'Answer Tokens', 0, 2000, 10, formData.answer_tokens_A, '')}
          {renderSliderInput('rps_per_active_user_R', 'RPS per Active User', 0, 1, 0.01, formData.rps_per_active_user_R)}
          {renderSliderInput('session_duration_sec_t', 'Session Duration (sec)', 0, 3600, 60, formData.session_duration_sec_t, 's')}
        </>,
        expandedSections.tokens
      )}

      {/* KV Section (split from Model & KV) */}
      {renderCollapsibleSection(
        'kv',
        'KV',
        <>
          {renderSliderInput('bytes_per_kv_state', 'Bytes per KV State', 1, 4, 0.1, formData.bytes_per_kv_state)}
          {renderSliderInput('paged_attention_gain_Kopt', 'Paged Attention Gain', 1, 3, 0.1, formData.paged_attention_gain_Kopt)}
        </>,
        expandedSections.kv
      )}

      {/* Empirics Section */}
      {renderCollapsibleSection(
        'empirics',
        'Empirics',
        <>
          {renderSliderInput('tps_per_instance', 'Tokens/sec per Instance', 10, 500, 10, formData.tps_per_instance)}
          {renderSliderInput('batching_coeff', 'Batching Coefficient', 1, 5, 0.1, formData.batching_coeff)}
          {renderSliderInput('sla_reserve', 'SLA Reserve', 1, 3, 0.05, formData.sla_reserve)}
        </>,
        expandedSections.empirics
      )}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-800 mb-6">Configuration Parameters</h2>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
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

      <button
        type="submit"
        disabled={loading}
        className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-colors ${
          loading 
            ? 'bg-gray-400 cursor-not-allowed' 
            : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {loading ? (
          <span className="flex items-center justify-center">
            <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
            Calculating...
          </span>
        ) : 'Recalculate (Auto-calculation enabled)'}
      </button>
    </form>
  );
};

export default CalculatorForm;
