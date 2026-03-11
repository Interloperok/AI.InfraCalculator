import React, { useState, useRef, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { downloadReport } from "../../services/api";

const ResultsDisplay = ({ results, loading, error, inputData }) => {
  const [detailTab, setDetailTab] = useState("memory"); // 'memory' | 'compute'
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);
  const [slaNotificationsOpen, setSlaNotificationsOpen] = useState(false);
  const slaNotificationsRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (slaNotificationsRef.current && !slaNotificationsRef.current.contains(e.target)) {
        setSlaNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDownloadReport = async () => {
    if (!inputData) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const result = await downloadReport(inputData);
      if (result && result.error) {
        setDownloadError(result.error);
      }
    } catch (err) {
      setDownloadError(err.message || "Failed to download report");
    } finally {
      setDownloading(false);
    }
  };

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
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-500">No results yet</h3>
        <p className="text-gray-400">Submit your configuration to see the server requirements</p>
      </div>
    );
  }

  // Prepare data for donut chart — GPU memory breakdown per instance (with TP)
  const totalMem = results.instance_total_mem_gb || 0;
  const modelMem = results.model_mem_gb || 0;
  const kvFree = results.kv_free_per_instance_tp_gb || 0;
  const overhead = Math.max(0, totalMem - modelMem - kvFree);

  const memBreakdown = [
    { name: "Model Weights", value: Math.round(modelMem * 100) / 100 },
    { name: "Available for KV-cache", value: Math.round(kvFree * 100) / 100 },
    ...(overhead > 0.01
      ? [{ name: "Reserved (1 − Kavail)", value: Math.round(overhead * 100) / 100 }]
      : []),
  ];
  const DONUT_COLORS = ["#6366f1", "#10b981", "#94a3b8"];

  // Helper to format numbers
  const fmt = (v, digits = 2) => {
    if (v === undefined || v === null || isNaN(v)) return "0";
    if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + "B";
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return v.toFixed(digits);
  };

  return (
    <div className="gap-6 flex flex-col flex-1">
      <h2 className="text-2xl font-semibold text-gray-800">Calculation Results</h2>

      {downloadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between">
          <p className="text-sm text-red-700">{downloadError}</p>
          <button
            type="button"
            onClick={() => setDownloadError(null)}
            className="text-red-500 hover:text-red-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      {/* ── Cost Estimate (above) ── */}
      <div
        data-tour="cost-estimate"
        className="bg-gradient-to-br from-purple-600 to-violet-800 rounded-xl p-5 text-white shadow-lg flex items-center justify-between"
      >
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider opacity-90 flex items-center gap-1.5">
            Cost Estimate
            <span className="relative group/tip">
              <svg
                className="w-3.5 h-3.5 opacity-70 cursor-help"
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
              <span className="invisible group-hover/tip:visible opacity-0 group-hover/tip:opacity-100 transition-opacity duration-200 absolute z-[9999] bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 text-[11px] font-normal normal-case tracking-normal text-white bg-gray-900 rounded-lg shadow-lg w-56 text-center leading-relaxed pointer-events-none">
                If you see an empty cost value, download the GPU reference guide and add the actual cost values there yourself.
                <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
              </span>
            </span>
          </h3>
          <p className="text-3xl font-extrabold mt-1">
            {results.cost_estimate_usd != null && results.cost_estimate_usd > 0
              ? `$${Number(results.cost_estimate_usd).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : "—"}
          </p>
          {results.cost_estimate_usd != null && results.cost_estimate_usd > 0 && (
            <span className="text-sm font-semibold opacity-80">GPU hardware only</span>
          )}
        </div>
        <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>

      {/* ── Concurrent Sessions & Session Context ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-tour="session-cards">
        <div className="bg-gradient-to-br from-slate-600 to-slate-800 rounded-xl p-5 text-white shadow-lg flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider opacity-60">
              Concurrent Sessions
            </h3>
            <p className="text-3xl font-extrabold mt-1">
              {fmt(results.Ssim_concurrent_sessions, 0)}
            </p>
          </div>
          <svg
            className="w-10 h-10 opacity-20"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </div>
        <div className="bg-gradient-to-br from-slate-600 to-slate-800 rounded-xl p-5 text-white shadow-lg flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider opacity-60">
              Session Context
            </h3>
            <p className="text-3xl font-extrabold mt-1">
              {fmt(results.TS_session_context, 0)}
              <span className="text-sm font-semibold opacity-60 ml-1">tokens</span>
            </p>
          </div>
          <svg
            className="w-10 h-10 opacity-20"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        </div>
      </div>

      {/* ── 3 Key Metric Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-tour="result-cards">
        {/* Card 1 — Servers Required */}
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-6 text-white shadow-lg flex flex-col min-h-[170px]">
          <h3 className="text-xs font-semibold uppercase tracking-wider opacity-70">
            Servers Required
          </h3>
          <p className="text-5xl font-extrabold mt-auto mb-auto">{results.servers_final || 0}</p>
          <p className="text-sm opacity-75 mt-2">
            max(mem:&thinsp;{results.servers_by_memory || 0}, comp:&thinsp;
            {results.servers_by_compute || 0})
          </p>
        </div>

        {/* Card 2 — Sessions per Server */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-6 text-white shadow-lg flex flex-col min-h-[170px]">
          <h3 className="text-xs font-semibold uppercase tracking-wider opacity-70">
            Sessions per Server
          </h3>
          <p className="text-5xl font-extrabold mt-auto mb-auto">
            {results.sessions_per_server || 0}
          </p>
          <p className="text-sm opacity-75 mt-2">
            {results.instances_per_server_tp || 0} inst &times; {results.S_TP_z || 0} sess each
          </p>
        </div>

        {/* Card 3 — Server Throughput */}
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-6 text-white shadow-lg flex flex-col min-h-[170px]">
          <h3 className="text-xs font-semibold uppercase tracking-wider opacity-70 flex items-center gap-1.5">
            Server Throughput
            <span className="relative group/tip">
              <svg
                className="w-3.5 h-3.5 opacity-60 cursor-help"
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
              <span className="invisible group-hover/tip:visible opacity-0 group-hover/tip:opacity-100 transition-opacity duration-200 absolute z-[9999] bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 text-[11px] font-normal normal-case tracking-normal text-white bg-gray-900 rounded-lg shadow-lg w-48 text-center leading-relaxed pointer-events-none">
                Requests per second that one server can handle (req/s)
                <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
              </span>
            </span>
          </h3>
          <p className="text-5xl font-extrabold mt-auto mb-auto">
            {fmt(results.th_server_comp, 1)}
          </p>
          <p className="text-sm opacity-75 mt-2">
            prefill {fmt(results.th_prefill, 0)} &middot; decode {fmt(results.th_decode, 0)}
          </p>
        </div>
      </div>

      {/* ── Secondary Metric Cards (3 tiles) ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-blue-400/80 to-indigo-500/80 rounded-lg p-4 text-white shadow">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
            GPUs per Server
          </h3>
          <p className="text-2xl font-bold mt-1">{results.gpus_per_server || 0}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-400/80 to-teal-500/80 rounded-lg p-4 text-white shadow">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider opacity-70 flex items-center gap-1">
            GPUs per Instance
            <span className="relative group/tip">
              <svg
                className="w-3 h-3 opacity-60 cursor-help"
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
              <span className="invisible group-hover/tip:visible opacity-0 group-hover/tip:opacity-100 transition-opacity duration-200 absolute z-[9999] bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 text-[11px] font-normal normal-case tracking-normal text-white bg-gray-900 rounded-lg shadow-lg w-52 text-center leading-relaxed pointer-events-none">
                One instance = one running copy of the model. This is the number of GPUs allocated
                to each copy (tensor parallelism degree).
                <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
              </span>
            </span>
          </h3>
          <p className="text-2xl font-bold mt-1">
            {results.gpus_per_instance_tp || results.gpus_per_instance || 0}
          </p>
        </div>
        <div className="bg-gradient-to-br from-violet-400/80 to-purple-500/80 rounded-lg p-4 text-white shadow">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider opacity-70 flex items-center gap-1">
            Instances per Server
            <span className="relative group/tip">
              <svg
                className="w-3 h-3 opacity-60 cursor-help"
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
              <span className="invisible group-hover/tip:visible opacity-0 group-hover/tip:opacity-100 transition-opacity duration-200 absolute z-[9999] bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 text-[11px] font-normal normal-case tracking-normal text-white bg-gray-900 rounded-lg shadow-lg w-52 text-center leading-relaxed pointer-events-none">
                How many independent model copies fit on one server, considering tensor parallelism.
                <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
              </span>
            </span>
          </h3>
          <p className="text-2xl font-bold mt-1">{results.instances_per_server_tp || 0}</p>
        </div>
      </div>

      {/* ── SLA Validation ── */}
      {(results.ttft_analyt != null || results.e2e_latency_analyt != null) && (
        <div className="bg-white border rounded-lg p-6" data-tour="sla-validation">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">SLA Validation</h3>
            <div className="flex items-center gap-2">
              {results.sla_passed !== true && (
                <div className="relative" ref={slaNotificationsRef}>
                  <button
                    type="button"
                    onClick={() => setSlaNotificationsOpen((prev) => !prev)}
                    className="relative p-1 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1"
                    title="SLA notifications"
                  >
                    <svg
                      className="w-5 h-5 text-gray-500 bell-shake"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                      />
                    </svg>
                    {results.sla_passed === false && results.sla_recommendations?.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                        {results.sla_recommendations.length}
                      </span>
                    )}
                  </button>
                  {slaNotificationsOpen && (
                    <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <h4 className="text-sm font-semibold text-gray-800">SLA Notifications</h4>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        {results.sla_recommendations?.length > 0 ? (
                          <ul className="p-4 space-y-2">
                            {results.sla_recommendations.map((rec, i) => (
                              <li key={i} className="text-sm text-amber-900 flex items-start gap-2">
                                <span className="text-amber-500 mt-0.5 flex-shrink-0">&#x2022;</span>
                                <span>{rec}</span>
                              </li>
                            ))}
                          </ul>
                        ) : results.sla_passed === true ? (
                          <div className="p-4 text-sm text-green-700 flex items-center gap-2">
                            <svg
                              className="w-4 h-4 flex-shrink-0"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                            SLA passed. No recommendations.
                          </div>
                        ) : (
                          <div className="p-4 text-sm text-gray-600">No notifications.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {results.sla_passed != null && (
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${
                    results.sla_passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                  }`}
                >
                  {results.sla_passed ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  )}
                  {results.sla_passed ? "Passed" : "Failed"}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* TTFT */}
            <div
              className={`rounded-lg p-4 border-l-4 ${
                results.ttft_sla_pass === true
                  ? "bg-green-50 border-green-500"
                  : results.ttft_sla_pass === false
                    ? "bg-red-50 border-red-500"
                    : "bg-gray-50 border-gray-300"
              }`}
            >
              <h4 className="text-sm font-semibold text-gray-700 mb-3">
                Time To First Token (TTFT)
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Calculated</span>
                  <span className="text-sm font-bold text-gray-900">
                    {fmt(results.ttft_analyt, 2)} sec
                  </span>
                </div>
                {results.ttft_sla_target != null && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">SLA Target</span>
                    <span className="text-sm font-semibold text-gray-700">
                      {fmt(results.ttft_sla_target, 2)} sec
                    </span>
                  </div>
                )}
                {results.ttft_sla_pass != null && (
                  <div
                    className={`text-center py-1.5 rounded text-xs font-semibold ${
                      results.ttft_sla_pass
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {results.ttft_sla_pass ? "PASS" : "FAIL — exceeds target"}
                  </div>
                )}
              </div>
            </div>

            {/* e2e Latency */}
            <div
              className={`rounded-lg p-4 border-l-4 ${
                results.e2e_latency_sla_pass === true
                  ? "bg-green-50 border-green-500"
                  : results.e2e_latency_sla_pass === false
                    ? "bg-red-50 border-red-500"
                    : "bg-gray-50 border-gray-300"
              }`}
            >
              <h4 className="text-sm font-semibold text-gray-700 mb-3">End-to-End Latency</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Calculated</span>
                  <span className="text-sm font-bold text-gray-900">
                    {fmt(results.e2e_latency_analyt, 2)} sec
                  </span>
                </div>
                {results.e2e_latency_sla_target != null && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">SLA Target</span>
                    <span className="text-sm font-semibold text-gray-700">
                      {fmt(results.e2e_latency_sla_target, 2)} sec
                    </span>
                  </div>
                )}
                {results.e2e_latency_sla_pass != null && (
                  <div
                    className={`text-center py-1.5 rounded text-xs font-semibold ${
                      results.e2e_latency_sla_pass
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {results.e2e_latency_sla_pass ? "PASS" : "FAIL — exceeds target"}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* GPU Memory Donut Chart */}
      <div className="bg-white border rounded-lg p-6" data-tour="donut-chart">
        <h3 className="text-lg font-medium text-gray-800 mb-1">GPU Memory per Instance</h3>
        <p className="text-sm text-gray-500 mb-4">
          {results.gpus_per_instance_tp || results.gpus_per_instance || 0} GPU
          {(results.gpus_per_instance_tp || results.gpus_per_instance || 0) !== 1 ? "s" : ""}{" "}
          &times; {results.gpu_mem_gb || 0} GiB &nbsp;={" "}
          <span className="font-semibold text-gray-700">{fmt(totalMem, 1)} GiB total</span>
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Donut */}
          <div className="relative w-52 h-52 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={memBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {memBreakdown.map((_, i) => (
                    <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(value) => `${value} GiB`}
                  contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-gray-800">{fmt(totalMem, 1)}</span>
              <span className="text-xs text-gray-500">GiB</span>
            </div>
          </div>

          {/* Legend */}
          <div className="space-y-3 flex-1 min-w-0">
            {memBreakdown.map((item, i) => (
              <div key={item.name} className="flex items-center gap-3">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-gray-700">{item.name}</span>
                    <span className="text-sm font-semibold text-gray-900 ml-2">
                      {fmt(item.value, 2)} GiB
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length],
                        width: `${totalMem > 0 ? (item.value / totalMem) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detailed Results — tabbed */}
      <div className="bg-white border rounded-lg p-6" data-tour="detail-toggle">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-800">Detailed Results</h3>
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
            <button
              type="button"
              onClick={() => setDetailTab("memory")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${
                detailTab === "memory"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                />
              </svg>
              Memory Path
            </button>
            <button
              type="button"
              onClick={() => setDetailTab("compute")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${
                detailTab === "compute"
                  ? "bg-white text-green-700 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Compute Path
            </button>
          </div>
        </div>

        {/* Memory Path */}
        {detailTab === "memory" && (
          <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-500">
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-blue-200">
                <span className="text-sm text-gray-700">Tokens per Request (T)</span>
                <span className="text-sm font-semibold text-gray-900">
                  {fmt(results.T_tokens_per_request, 0)}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-blue-200">
                <span className="text-sm text-gray-700">Session Context (TS)</span>
                <span className="text-sm font-semibold text-gray-900">
                  {fmt(results.TS_session_context, 0)} tok
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-blue-200">
                <span className="text-sm text-gray-700">Sequence Length (SL)</span>
                <span className="text-sm font-semibold text-gray-900">
                  {fmt(results.SL_sequence_length, 0)} tok
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-blue-200">
                <span className="text-sm text-gray-700">Model Memory (Mmodel)</span>
                <span className="text-sm font-semibold text-gray-900">
                  {fmt(results.model_mem_gb)} GiB
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-blue-200">
                <span className="text-sm text-gray-700">KV/Session (MKV)</span>
                <span className="text-sm font-semibold text-gray-900">
                  {fmt(results.kv_per_session_gb, 4)} GiB
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-blue-200">
                <span className="text-sm text-gray-700">Free KV/Instance</span>
                <span className="text-sm font-semibold text-gray-900">
                  {fmt(results.kv_free_per_instance_gb)} GiB
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-blue-200">
                <span className="text-sm text-gray-700">Sessions/Instance (base TP)</span>
                <span className="text-sm font-semibold text-gray-900">
                  {results.S_TP_base || 0}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-blue-200">
                <span className="text-sm text-gray-700">Sessions/Instance (Z x TP)</span>
                <span className="text-sm font-semibold text-gray-900">{results.S_TP_z || 0}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-700 font-semibold">Servers by Memory</span>
                <span className="text-sm font-bold text-blue-700">
                  {results.servers_by_memory || 0}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Compute Path */}
        {detailTab === "compute" && (
          <div className="bg-green-50 rounded-lg p-4 border-l-4 border-green-500">
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-green-200">
                <span className="text-sm text-gray-700">GPU TFLOPS (per GPU)</span>
                <span className="text-sm font-semibold text-gray-900">
                  {fmt(results.gpu_tflops_used)} TFLOPS
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-green-200">
                <span className="text-sm text-gray-700">Fcount_model (per instance)</span>
                <span className="text-sm font-semibold text-gray-900">
                  {fmt(results.Fcount_model_tflops)} TFLOPS
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-green-200">
                <span className="text-sm text-gray-700">FLOP/token (FPS)</span>
                <span className="text-sm font-semibold text-gray-900">
                  {fmt(results.FPS_flops_per_token)}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-green-200">
                <span className="text-sm text-gray-700">Decode Tokens (Tdec)</span>
                <span className="text-sm font-semibold text-gray-900">
                  {fmt(results.Tdec_tokens, 0)} tok
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-green-200">
                <span className="text-sm text-gray-700">Prefill Throughput (Th_pf)</span>
                <span className="text-sm font-semibold text-gray-900">
                  {fmt(results.th_prefill)} tok/s
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-green-200">
                <span className="text-sm text-gray-700">Decode Throughput (Th_dec)</span>
                <span className="text-sm font-semibold text-gray-900">
                  {fmt(results.th_decode)} tok/s
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-green-200">
                <span className="text-sm text-gray-700">Requests/sec per Instance (Cmodel)</span>
                <span className="text-sm font-semibold text-gray-900">
                  {fmt(results.Cmodel_rps, 4)}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-green-200">
                <span className="text-sm text-gray-700">Server Throughput (Th_server)</span>
                <span className="text-sm font-semibold text-gray-900">
                  {fmt(results.th_server_comp, 4)} req/s
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-700 font-semibold">Servers by Compute</span>
                <span className="text-sm font-bold text-green-700">
                  {results.servers_by_compute || 0}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Download Report Button */}
      {inputData && (
        <button
          type="button"
          data-tour="download-report"
          onClick={handleDownloadReport}
          disabled={downloading}
          className={`mt-auto w-full py-3 px-4 rounded-lg font-semibold text-lg transition-colors ${
            downloading
              ? "bg-green-300 text-white cursor-not-allowed"
              : "bg-green-600 text-white hover:bg-green-700 download-btn-glow"
          }`}
        >
          {downloading ? (
            <span className="flex items-center justify-center">
              <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></span>
              Generating Report...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Download Excel Report
            </span>
          )}
        </button>
      )}
    </div>
  );
};

export default ResultsDisplay;
