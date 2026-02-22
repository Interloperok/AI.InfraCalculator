import React from 'react';

const QUANT_LABELS = { 1: 'INT8', 2: 'FP16', 4: 'FP32' };

const OPTIMIZATION_MODE_LABELS = {
  min_servers: 'Min Servers',
  min_cost: 'Min Cost',
  balanced: 'Balanced',
  max_performance: 'Max Performance',
};

const fmt = (v, digits = 2) => {
  if (v === undefined || v === null || isNaN(v)) return '0';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return Number(v).toFixed(digits);
};

const fmtCost = (v) => {
  if (v === undefined || v === null || isNaN(v)) return '—';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + Number(v).toLocaleString();
};

const OptimizeResultsTable = ({
  results,
  loading,
  error,
  stats,
  selectedIdx,
  onSelectRow,
  embedded = false,
}) => {
  return (
    <div className={embedded ? 'flex flex-col' : 'bg-white rounded-xl shadow-lg p-6 flex flex-col'}>
      {!embedded && (
        <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Optimization Results
        </h2>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500 mb-3"></div>
            <p className="text-gray-500 text-sm">Evaluating configurations...</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !results && !error && (
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="text-center">
            <div className="text-gray-300 mb-3">
              <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-gray-400">No results yet</h3>
            <p className="text-xs text-gray-400 mt-1">Click "Find Best Configs" to start</p>
          </div>
        </div>
      )}

      {/* Results */}
      {results && results.length > 0 && (
        <>
          {/* Stats bar */}
          {stats && (
            <div className="flex items-center gap-3 mb-3 text-xs text-gray-500 flex-wrap">
              <span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-full font-medium">
                {OPTIMIZATION_MODE_LABELS[stats.mode] || stats.mode}
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
                  <th className="py-2 px-2 text-center text-xs font-semibold text-gray-500 uppercase">TP(Z)</th>
                  <th className="py-2 px-2 text-center text-xs font-semibold text-gray-500 uppercase">GPU/Srv</th>
                  <th className="py-2 px-2 text-center text-xs font-semibold text-gray-500 uppercase">Servers</th>
                  <th className="py-2 px-2 text-center text-xs font-semibold text-gray-500 uppercase">Total GPU</th>
                  <th className="py-2 px-2 text-center text-xs font-semibold text-gray-500 uppercase">Sess/Srv</th>
                  <th className="py-2 px-2 text-center text-xs font-semibold text-gray-500 uppercase">Throughput</th>
                  <th className="py-2 px-2 text-center text-xs font-semibold text-gray-500 uppercase">Cost</th>
                </tr>
              </thead>
              <tbody>
                {results.map((config, idx) => {
                  const isSelected = selectedIdx === idx;
                  return (
                    <tr
                      key={idx}
                      onClick={() => onSelectRow(idx)}
                      className={`border-b border-gray-100 cursor-pointer transition-all duration-150 ${
                        isSelected
                          ? 'bg-indigo-100 ring-2 ring-indigo-500 ring-inset'
                          : idx === 0 && selectedIdx === null
                            ? 'bg-indigo-50/30 hover:bg-indigo-50'
                            : 'hover:bg-indigo-50/50'
                      }`}
                    >
                      <td className="py-2.5 px-2">
                        {idx === 0 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold">
                            1
                          </span>
                        ) : (
                          <span className="text-gray-400 font-medium pl-1.5">{config.rank}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2" title={`${config.gpu_name} — ${config.gpu_mem_gb} GB | ${fmt(config.gpu_tflops, 0)} TFLOPS`}>
                        <div className="font-medium text-gray-800 truncate max-w-[150px]">
                          {config.gpu_name}
                        </div>
                        <div className="text-xs text-gray-400">
                          {config.gpu_mem_gb} GB | {fmt(config.gpu_tflops, 0)} TF
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                          config.bytes_per_param === 1 ? 'bg-green-100 text-green-700' :
                          config.bytes_per_param === 2 ? 'bg-blue-100 text-blue-700' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          {QUANT_LABELS[config.bytes_per_param] || config.bytes_per_param}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-center font-medium">{config.tp_multiplier_Z}</td>
                      <td className="py-2.5 px-2 text-center">{config.gpus_per_server}</td>
                      <td className="py-2.5 px-2 text-center">
                        <span className="font-bold text-gray-800">{config.servers_final}</span>
                      </td>
                      <td className="py-2.5 px-2 text-center font-semibold text-gray-700">{config.total_gpus}</td>
                      <td className="py-2.5 px-2 text-center">{config.sessions_per_server}</td>
                      <td className="py-2.5 px-2 text-center text-gray-600">{fmt(config.th_server_comp, 2)}</td>
                      <td className="py-2.5 px-2 text-center text-gray-600">
                        <div>{fmtCost(config.cost_estimate_usd)}</div>
                        {config.gpu_price_usd != null && (
                          <div className="text-xs text-gray-400">{fmtCost(config.gpu_price_usd)}/gpu</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* No valid results */}
      {results && results.length === 0 && !error && (
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="text-center">
            <h3 className="text-sm font-medium text-gray-500">No valid configurations found</h3>
            <p className="text-xs text-gray-400 mt-1">Try adjusting your parameters or GPU filters</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default OptimizeResultsTable;
