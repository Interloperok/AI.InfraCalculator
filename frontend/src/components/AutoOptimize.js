import React, { useState } from 'react';
import { autoOptimize } from '../services/api';

const OPTIMIZATION_MODES = [
  {
    id: 'min_servers',
    name: 'Min Servers',
    description: 'Minimize the number of physical servers',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'emerald',
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Optimal balance of servers, GPUs, and throughput',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    color: 'amber',
  },
];

const COLOR_MAP = {
  blue: { selected: 'border-blue-500 bg-blue-50 text-blue-700', ring: 'ring-blue-500' },
  emerald: { selected: 'border-emerald-500 bg-emerald-50 text-emerald-700', ring: 'ring-emerald-500' },
  violet: { selected: 'border-violet-500 bg-violet-50 text-violet-700', ring: 'ring-violet-500' },
  amber: { selected: 'border-amber-500 bg-amber-50 text-amber-700', ring: 'ring-amber-500' },
};

const QUANT_LABELS = { 1: 'INT8', 2: 'FP16', 4: 'FP32' };

const AutoOptimize = ({ onApplyConfig }) => {
  const [formData, setFormData] = useState({
    // Model
    params_billions: 7,
    layers_L: 32,
    hidden_size_H: 4096,
    safe_margin: 5.0,
    emp_model: 1.0,
    // Users
    internal_users: 1000,
    penetration_internal: 0.1,
    concurrency_internal: 0.1,
    external_users: 0,
    penetration_external: 0.0,
    concurrency_external: 0.0,
    sessions_per_user_J: 1,
    // Tokens
    system_prompt_tokens_SP: 1000,
    user_prompt_tokens_Prp: 200,
    reasoning_tokens_MRT: 4096,
    answer_tokens_A: 400,
    dialog_turns: 5,
    // KV
    bytes_per_kv_state: 2,
    emp_kv: 1.0,
    max_context_window_TSmax: 32768,
    // SLA
    rps_per_session_R: 0.02,
    sla_reserve_KSLA: 1.25,
    // Tuning
    kavail: 0.9,
    eta_prefill: 0.20,
    eta_decode: 0.15,
    saturation_coeff_C: 8.0,
    // Optimization
    mode: 'balanced',
    top_n: 10,
  });

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

  const handleChange = (name, value) => {
    const integerFields = [
      'internal_users', 'external_users', 'layers_L', 'hidden_size_H',
      'dialog_turns', 'max_context_window_TSmax', 'top_n',
    ];
    const parsed = parseFloat(value) || 0;
    const final = integerFields.includes(name) ? Math.round(parsed) : parsed;
    setFormData(prev => ({ ...prev, [name]: final }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults(null);
    setStats(null);

    const response = await autoOptimize(formData);

    if (response && response.error) {
      setError(response.error);
    } else if (response && response.results) {
      setResults(response.results);
      setStats({
        mode: response.mode,
        total_evaluated: response.total_evaluated,
        total_valid: response.total_valid,
      });
    } else {
      setError('Unexpected response from server.');
    }

    setLoading(false);
  };

  const handleApply = (config) => {
    if (config.sizing_input && onApplyConfig) {
      onApplyConfig(config.sizing_input);
    }
  };

  const renderField = (name, label, min, max, step, unit = '') => {
    const integerFields = [
      'internal_users', 'external_users', 'layers_L', 'hidden_size_H',
      'dialog_turns', 'max_context_window_TSmax', 'top_n',
    ];
    const isInt = integerFields.includes(name);

    return (
      <div key={name} className="flex items-center justify-between py-1.5">
        <label className="text-sm text-gray-600 truncate mr-3">{label}</label>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={min}
            max={max}
            step={isInt ? 1 : step}
            value={formData[name]}
            onChange={(e) => handleChange(name, e.target.value)}
            className="w-24 px-2 py-1 text-sm border border-gray-300 rounded-md text-right focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
          />
          {unit && <span className="text-xs text-gray-400 w-8">{unit}</span>}
        </div>
      </div>
    );
  };

  const fmt = (v, digits = 2) => {
    if (v === undefined || v === null || isNaN(v)) return '0';
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return Number(v).toFixed(digits);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
      {/* ── Left Column: Input Form (2/5) ── */}
      <div className="lg:col-span-2 bg-white rounded-xl shadow-lg p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <h2 className="text-xl font-semibold text-gray-800">Auto-Optimize</h2>
          <p className="text-sm text-gray-500 -mt-3">
            Define your model and workload. The system will find the best hardware configuration.
          </p>

          {/* Mode Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Optimization Mode</label>
            <div className="grid grid-cols-2 gap-2">
              {OPTIMIZATION_MODES.map((mode) => {
                const isSelected = formData.mode === mode.id;
                const colors = COLOR_MAP[mode.color];
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, mode: mode.id }))}
                    className={`p-3 rounded-lg border-2 text-left transition-all duration-200 ${
                      isSelected
                        ? `${colors.selected} border-current shadow-sm`
                        : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {mode.icon}
                      <span className="text-sm font-semibold">{mode.name}</span>
                    </div>
                    <p className="text-xs opacity-75 leading-relaxed">{mode.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Model Parameters */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <h3 className="text-sm font-semibold text-blue-800 mb-2">Model</h3>
            {renderField('params_billions', 'Parameters', 0.1, 500, 0.1, 'B')}
            {renderField('layers_L', 'Layers', 1, 200, 1)}
            {renderField('hidden_size_H', 'Hidden dim', 256, 32768, 256)}
          </div>

          {/* Users */}
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <h3 className="text-sm font-semibold text-green-800 mb-2">Users & Load</h3>
            {renderField('internal_users', 'Users', 0, 10000000, 100)}
            {renderField('penetration_internal', 'Adoption', 0, 1, 0.01)}
            {renderField('concurrency_internal', 'Concurrency', 0, 1, 0.01)}
          </div>

          {/* Tokens */}
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <h3 className="text-sm font-semibold text-purple-800 mb-2">Token Budget</h3>
            {renderField('system_prompt_tokens_SP', 'System prompt', 0, 10000, 100, 'tok')}
            {renderField('user_prompt_tokens_Prp', 'User message', 0, 5000, 10, 'tok')}
            {renderField('reasoning_tokens_MRT', 'Reasoning', 0, 32768, 256, 'tok')}
            {renderField('answer_tokens_A', 'Response', 0, 5000, 10, 'tok')}
            {renderField('dialog_turns', 'Turns', 1, 20, 1)}
          </div>

          {/* SLA & Tuning (collapsible) */}
          <details className="bg-gray-50 rounded-lg border border-gray-200">
            <summary className="p-4 text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 rounded-lg">
              Advanced Settings
            </summary>
            <div className="px-4 pb-4 space-y-0">
              {renderField('max_context_window_TSmax', 'Max context', 1024, 131072, 1024, 'tok')}
              {renderField('kavail', 'Usable memory', 0.5, 1.0, 0.01)}
              {renderField('eta_prefill', 'Prefill eff.', 0.05, 0.5, 0.01)}
              {renderField('eta_decode', 'Decode eff.', 0.05, 0.5, 0.01)}
              {renderField('rps_per_session_R', 'Req rate', 0.001, 1, 0.001)}
              {renderField('sla_reserve_KSLA', 'SLA headroom', 1, 3, 0.05)}
              {renderField('top_n', 'Results count', 1, 50, 1)}
            </div>
          </details>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 px-4 rounded-lg font-semibold text-lg transition-colors ${
              loading
                ? 'bg-indigo-300 text-white cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 calc-btn-glow'
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></span>
                Searching configurations...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Find Best Configs
              </span>
            )}
          </button>
        </form>
      </div>

      {/* ── Right Column: Results Table (3/5) ── */}
      <div className="lg:col-span-3 bg-white rounded-xl shadow-lg p-6 flex flex-col">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Optimization Results</h2>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
              <p className="text-gray-500">Evaluating thousands of configurations...</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !results && !error && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center py-12">
              <div className="text-gray-300 mb-4">
                <svg className="mx-auto h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-400">No results yet</h3>
              <p className="text-gray-400 mt-1">Configure your model and workload, then click Find Best Configs</p>
            </div>
          </div>
        )}

        {/* Results */}
        {results && results.length > 0 && (
          <>
            {/* Stats bar */}
            {stats && (
              <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
                <span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-full font-medium">
                  {OPTIMIZATION_MODES.find(m => m.id === stats.mode)?.name || stats.mode}
                </span>
                <span>Evaluated: <strong>{stats.total_evaluated.toLocaleString()}</strong></span>
                <span>Valid: <strong>{stats.total_valid.toLocaleString()}</strong></span>
                <span>Showing: <strong>{results.length}</strong></span>
              </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="py-2 px-2 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                    <th className="py-2 px-2 text-left text-xs font-semibold text-gray-500 uppercase">GPU</th>
                    <th className="py-2 px-2 text-center text-xs font-semibold text-gray-500 uppercase">Quant</th>
                    <th className="py-2 px-2 text-center text-xs font-semibold text-gray-500 uppercase">TP (Z)</th>
                    <th className="py-2 px-2 text-center text-xs font-semibold text-gray-500 uppercase">GPU/Srv</th>
                    <th className="py-2 px-2 text-center text-xs font-semibold text-gray-500 uppercase">Servers</th>
                    <th className="py-2 px-2 text-center text-xs font-semibold text-gray-500 uppercase">Total GPU</th>
                    <th className="py-2 px-2 text-center text-xs font-semibold text-gray-500 uppercase">Sess/Srv</th>
                    <th className="py-2 px-2 text-center text-xs font-semibold text-gray-500 uppercase">Throughput</th>
                    <th className="py-2 px-2 text-center text-xs font-semibold text-gray-500 uppercase"></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((config, idx) => (
                    <tr
                      key={idx}
                      className={`border-b border-gray-100 hover:bg-indigo-50/50 transition-colors ${
                        idx === 0 ? 'bg-indigo-50/30' : ''
                      }`}
                    >
                      <td className="py-3 px-2">
                        {idx === 0 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold">
                            1
                          </span>
                        ) : (
                          <span className="text-gray-400 font-medium pl-1.5">{config.rank}</span>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <div className="font-medium text-gray-800 truncate max-w-[180px]" title={config.gpu_name}>
                          {config.gpu_name}
                        </div>
                        <div className="text-xs text-gray-400">
                          {config.gpu_mem_gb} GB | {fmt(config.gpu_tflops, 0)} TFLOPS
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          config.bytes_per_param === 1 ? 'bg-green-100 text-green-700' :
                          config.bytes_per_param === 2 ? 'bg-blue-100 text-blue-700' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          {QUANT_LABELS[config.bytes_per_param] || config.bytes_per_param}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center font-medium">{config.tp_multiplier_Z}</td>
                      <td className="py-3 px-2 text-center">{config.gpus_per_server}</td>
                      <td className="py-3 px-2 text-center">
                        <span className="font-bold text-gray-800">{config.servers_final}</span>
                        <div className="text-xs text-gray-400">
                          m:{config.servers_by_memory} c:{config.servers_by_compute}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center font-semibold text-gray-700">{config.total_gpus}</td>
                      <td className="py-3 px-2 text-center">{config.sessions_per_server}</td>
                      <td className="py-3 px-2 text-center text-gray-600">{fmt(config.th_server_comp, 2)}</td>
                      <td className="py-3 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleApply(config)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
                          title="Apply this configuration to the Calculator"
                        >
                          Apply
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* No valid results */}
        {results && results.length === 0 && !error && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center py-12">
              <h3 className="text-lg font-medium text-gray-500">No valid configurations found</h3>
              <p className="text-gray-400 mt-1">Try adjusting your model parameters or removing filters</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AutoOptimize;
