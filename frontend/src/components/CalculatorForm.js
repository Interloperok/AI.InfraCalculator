import React, { useState } from 'react';

const CalculatorForm = ({ onSubmit, loading }) => {
  // Initial form values based on the SizingInput dataclass
  const [formData, setFormData] = useState({
    // Users & behavior
    internal_users: 1000,
    penetration_internal: 0.1,
    concurrency_internal: 0.2,
    external_users: 5000,
    penetration_external: 0.05,
    concurrency_external: 0.1,

    // Tokens & sessions
    prompt_tokens_P: 350,
    answer_tokens_A: 200,
    rps_per_active_user_R: 0.05,
    session_duration_sec_t: 300,

    // Model & KV
    params_billions: 7,
    bytes_per_param: 2,
    overhead_factor: 1.1,
    layers_L: 32,
    hidden_size_H: 4096,
    bytes_per_kv_state: 2,
    paged_attention_gain_Kopt: 1.5,

    // Hardware
    gpu_mem_gb: 80,
    gpus_per_server: 8,
    mem_reserve_fraction: 0.07,

    // Empirics
    tps_per_instance: 100,
    batching_coeff: 1.2,
    sla_reserve: 1.25,
  });

  // State for tracking which sections are expanded (first section expanded by default)
  const [expandedSections, setExpandedSections] = useState({
    users: true,
    tokens: false,
    model: false,
    hardware: false,
    empirics: false
  });

  const handleChange = (name, value) => {
    setFormData(prev => ({
      ...prev,
      [name]: parseFloat(value) || 0
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const toggleSection = (sectionKey) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  // Helper function to create slider with input
  const renderSliderInput = (name, label, min, max, step, value, unit = '') => (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-2">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <span className="text-sm text-gray-500">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => handleChange(name, e.target.value)}
        className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
      <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );

  // Helper function to render a collapsible section
  const renderCollapsibleSection = (key, title, color, inputs, isExpanded) => (
    <div className={`${color}-50 rounded-lg border ${isExpanded ? 'border' + color.replace('50', '200') : 'border-gray-200'} mb-4 overflow-hidden`}>
      <button
        type="button"
        onClick={() => toggleSection(key)}
        className={`w-full flex justify-between items-center p-4 text-left ${color}-800 font-medium rounded-lg hover:bg-opacity-50 transition-colors`}
      >
        <span>{title}</span>
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
            ? 'max-h-96 opacity-100' 
            : 'max-h-0 opacity-0'
        }`}
      >
        <div className="p-4 pt-2 border-t border-gray-200">
          {inputs}
        </div>
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-800 mb-6">Configuration Parameters</h2>

      {/* Users & Behavior Section */}
      {renderCollapsibleSection(
        'users',
        'Users & Behavior',
        'bg-blue',
        <>
          {renderSliderInput('internal_users', 'Internal Users', 0, 10000, 100, formData.internal_users)}
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
        'bg-green',
        <>
          {renderSliderInput('prompt_tokens_P', 'Prompt Tokens', 0, 2000, 10, formData.prompt_tokens_P, '')}
          {renderSliderInput('answer_tokens_A', 'Answer Tokens', 0, 2000, 10, formData.answer_tokens_A, '')}
          {renderSliderInput('rps_per_active_user_R', 'RPS per Active User', 0, 1, 0.01, formData.rps_per_active_user_R)}
          {renderSliderInput('session_duration_sec_t', 'Session Duration (sec)', 0, 3600, 60, formData.session_duration_sec_t, 's')}
        </>,
        expandedSections.tokens
      )}

      {/* Model & KV Section */}
      {renderCollapsibleSection(
        'model',
        'Model & KV',
        'bg-purple',
        <>
          {renderSliderInput('params_billions', 'Params (Billions)', 0.1, 100, 0.1, formData.params_billions, 'B')}
          {renderSliderInput('bytes_per_param', 'Bytes per Param', 1, 4, 0.1, formData.bytes_per_param)}
          {renderSliderInput('overhead_factor', 'Overhead Factor', 1.0, 2.0, 0.05, formData.overhead_factor)}
          {renderSliderInput('layers_L', 'Layers', 1, 128, 1, formData.layers_L)}
          {renderSliderInput('hidden_size_H', 'Hidden Size', 512, 8192, 256, formData.hidden_size_H)}
          {renderSliderInput('bytes_per_kv_state', 'Bytes per KV State', 1, 4, 0.1, formData.bytes_per_kv_state)}
          {renderSliderInput('paged_attention_gain_Kopt', 'Paged Attention Gain', 1, 3, 0.1, formData.paged_attention_gain_Kopt)}
        </>,
        expandedSections.model
      )}

      {/* Hardware Section */}
      {renderCollapsibleSection(
        'hardware',
        'Hardware',
        'bg-yellow',
        <>
          {renderSliderInput('gpu_mem_gb', 'GPU Memory (GB)', 8, 128, 1, formData.gpu_mem_gb, 'GB')}
          {renderSliderInput('gpus_per_server', 'GPUs per Server', 1, 16, 1, formData.gpus_per_server)}
          {renderSliderInput('mem_reserve_fraction', 'Memory Reserve (0-1)', 0, 0.2, 0.01, formData.mem_reserve_fraction)}
        </>,
        expandedSections.hardware
      )}

      {/* Empirics Section */}
      {renderCollapsibleSection(
        'empirics',
        'Empirics',
        'bg-red',
        <>
          {renderSliderInput('tps_per_instance', 'Tokens/sec per Instance', 10, 500, 10, formData.tps_per_instance)}
          {renderSliderInput('batching_coeff', 'Batching Coefficient', 1, 5, 0.1, formData.batching_coeff)}
          {renderSliderInput('sla_reserve', 'SLA Reserve', 1, 3, 0.05, formData.sla_reserve)}
        </>,
        expandedSections.empirics
      )}

      <button
        type="submit"
        disabled={loading}
        className={`w-full py-3 px-4 rounded-lg font-medium text-white ${
          loading 
            ? 'bg-gray-400 cursor-not-allowed' 
            : 'bg-blue-600 hover:bg-blue-700 transition-colors'
        }`}
      >
        {loading ? 'Calculating...' : 'Calculate Server Requirements'}
      </button>
    </form>
  );
};

export default CalculatorForm;
