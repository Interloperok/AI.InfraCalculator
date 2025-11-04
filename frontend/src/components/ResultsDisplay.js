import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const ResultsDisplay = ({ results, loading, error }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-gray-600">Calculating server requirements...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-yellow-800 mb-2">Warning</h3>
          <p className="text-yellow-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-4">
          <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-500">No results yet</h3>
        <p className="text-gray-400">Submit your configuration to see the server requirements</p>
      </div>
    );
  }

  // Prepare data for charts
  const resourceData = [
    { name: 'Model Memory (GB)', value: (results && results.model_mem_gb && typeof results.model_mem_gb === 'number' && !isNaN(results.model_mem_gb)) ? results.model_mem_gb : 0 },
    { name: 'KV-cache (No Opt, GB)', value: (results && results.kv_per_session_gb_no_opt && typeof results.kv_per_session_gb_no_opt === 'number' && !isNaN(results.kv_per_session_gb_no_opt)) ? results.kv_per_session_gb_no_opt : 0 },
    { name: 'KV-cache (Opt, GB)', value: (results && results.kv_per_session_gb_opt && typeof results.kv_per_session_gb_opt === 'number' && !isNaN(results.kv_per_session_gb_opt)) ? results.kv_per_session_gb_opt : 0 },
    { name: 'Memory Reserve (GB)', value: (results && results.gpu_mem_gb && results.mem_reserve_fraction && typeof results.gpu_mem_gb === 'number' && typeof results.mem_reserve_fraction === 'number' && !isNaN(results.gpu_mem_gb) && !isNaN(results.mem_reserve_fraction)) ? results.gpu_mem_gb * results.mem_reserve_fraction : 0 },
  ];

  // Защита от undefined данных для графика
  const safeResourceData = resourceData.map(item => ({
    name: item.name || 'Unknown',
    value: typeof item.value === 'number' && !isNaN(item.value) ? item.value : 0
  }));

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-800">Calculation Results</h2>

      {/* Highlighted Key Metrics - Servers and GPUs per Server */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl p-6 text-white shadow-lg">
          <h3 className="text-lg font-medium opacity-90">Final Server Count</h3>
          <p className="text-4xl font-bold mt-2">{results.servers_final || 0}</p>
          <p className="text-sm opacity-80 mt-2">Total servers required for your configuration</p>
        </div>
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-6 text-white shadow-lg">
          <h3 className="text-lg font-medium opacity-90">GPUs per Server</h3>
          <p className="text-4xl font-bold mt-2">{(results.gpus_per_instance * results.instances_per_server || 0).toFixed(0)}</p>
          <p className="text-sm opacity-80 mt-2">GPUs per Server = GPUs per Instance × Instances per Server</p>
        </div>
      </div>

      {/* Other Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800">Total Active Users</h3>
          <p className="text-xl font-bold text-blue-600">{(results.total_active_users || 0).toFixed(2)}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-green-800">Required RPS</h3>
          <p className="text-xl font-bold text-green-600">{(results.required_RPS || 0).toFixed(2)}</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-purple-800">Throughput (tokens/sec)</h3>
          <p className="text-xl font-bold text-purple-600">{(results.throughput || 0).toFixed(2)}</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-yellow-800">Instances per Server</h3>
          <p className="text-xl font-bold text-yellow-600">{results.instances_per_server || 0}</p>
        </div>
      </div>

      {/* Resource Distribution Chart */}
      <div className="bg-white border rounded-lg p-4">
        <h3 className="text-lg font-medium text-gray-800 mb-4">Resource Distribution (by server)</h3>
        <ResponsiveContainer width="100%" height={300}>
            <BarChart data={safeResourceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis label={{ value: 'GB / Count', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" fill="#3b82f6" />
            </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detailed Results */}
      <div className="bg-white border rounded-lg p-4">
        <h3 className="text-lg font-medium text-gray-800 mb-4">Detailed Results</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex justify-between border-b pb-1">
              <span className="text-gray-600">Tokens per Request:</span>
              <span className="font-medium">{(results.T_tokens_per_request || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b pb-1">
              <span className="text-gray-600">GPUs per Instance:</span>
              <span className="font-medium">{results.gpus_per_instance || 0}</span>
            </div>
            <div className="flex justify-between border-b pb-1">
              <span className="text-gray-600">Model instances per Server:</span>
              <span className="font-medium">{results.instances_per_server || 0}</span>
            </div>
            <div className="flex justify-between border-b pb-1">
              <span className="text-gray-600">GPUs per Server:</span>
              <span className="font-medium">{(results.gpus_per_instance * results.instances_per_server || 0).toFixed(0)}</span>
            </div>
            <div className="flex justify-between border-b pb-1">
              <span className="text-gray-600">KV per Session (GB):</span>
              <span className="font-medium">{(results.kv_per_session_gb_opt || 0).toFixed(4)}</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between border-b pb-1">
              <span className="text-gray-600">Sessions per Server:</span>
              <span className="font-medium">{results.sessions_per_server || 0}</span>
            </div>
            <div className="flex justify-between border-b pb-1">
              <span className="text-gray-600">RPS per Server:</span>
              <span className="font-medium">{(results.rps_per_server || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b pb-1">
              <span className="text-gray-600">Total GPUs Required:</span>
              <span className="font-medium">{(results.gpus_per_instance * results.instances_per_server || 0).toFixed(0)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResultsDisplay;