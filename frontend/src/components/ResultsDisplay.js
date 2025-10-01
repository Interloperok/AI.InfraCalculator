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
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-red-800 mb-2">Error</h3>
          <p className="text-red-600">{error}</p>
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
    { name: 'Active Users', value: results.total_active_users },
    { name: 'Required RPS', value: results.required_RPS },
    { name: 'Model Memory (GB)', value: results.model_mem_gb },
    { name: 'Servers (Memory)', value: results.servers_by_memory },
    { name: 'Servers (Compute)', value: results.servers_by_compute },
    { name: 'Final Servers', value: results.servers_final },
  ];

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

  const serverBreakdownData = [
    { name: 'Memory Limited', value: results.servers_by_memory },
    { name: 'Compute Limited', value: results.servers_by_compute },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-800">Calculation Results</h2>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800">Total Active Users</h3>
          <p className="text-2xl font-bold text-blue-600">{results.total_active_users.toFixed(2)}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-green-800">Required RPS</h3>
          <p className="text-2xl font-bold text-green-600">{results.required_RPS.toFixed(2)}</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-purple-800">Model Memory (GB)</h3>
          <p className="text-2xl font-bold text-purple-600">{results.model_mem_gb.toFixed(2)}</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-yellow-800">Final Servers Needed</h3>
          <p className="text-2xl font-bold text-yellow-600">{results.servers_final}</p>
        </div>
      </div>

      {/* Resource Distribution Chart */}
      <div className="bg-white border rounded-lg p-4">
        <h3 className="text-lg font-medium text-gray-800 mb-4">Resource Distribution</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={resourceData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Server Breakdown */}
      <div className="bg-white border rounded-lg p-4">
        <h3 className="text-lg font-medium text-gray-800 mb-4">Server Requirements Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={serverBreakdownData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {serverBreakdownData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Memory Limited Servers:</span>
              <span className="font-medium">{results.servers_by_memory}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Compute Limited Servers:</span>
              <span className="font-medium">{results.servers_by_compute}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-blue-100 rounded-lg border border-blue-200">
              <span className="text-blue-800 font-medium">Final Server Count:</span>
              <span className="font-bold text-blue-800 text-lg">{results.servers_final}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Results */}
      <div className="bg-white border rounded-lg p-4">
        <h3 className="text-lg font-medium text-gray-800 mb-4">Detailed Results</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex justify-between border-b pb-1">
              <span className="text-gray-600">Tokens per Request:</span>
              <span className="font-medium">{results.T_tokens_per_request.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b pb-1">
              <span className="text-gray-600">GPUs per Instance:</span>
              <span className="font-medium">{results.gpus_per_instance}</span>
            </div>
            <div className="flex justify-between border-b pb-1">
              <span className="text-gray-600">Instances per Server:</span>
              <span className="font-medium">{results.instances_per_server}</span>
            </div>
            <div className="flex justify-between border-b pb-1">
              <span className="text-gray-600">KV per Session (GB):</span>
              <span className="font-medium">{results.kv_per_session_gb_opt.toFixed(4)}</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between border-b pb-1">
              <span className="text-gray-600">Sessions per Server:</span>
              <span className="font-medium">{results.sessions_per_server}</span>
            </div>
            <div className="flex justify-between border-b pb-1">
              <span className="text-gray-600">RPS per Server:</span>
              <span className="font-medium">{results.rps_per_server.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResultsDisplay;