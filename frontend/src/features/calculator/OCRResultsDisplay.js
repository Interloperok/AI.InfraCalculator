import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import MigHintBadge from "./MigHintBadge";

const fmt = (v, digits = 2) => {
  if (v === undefined || v === null || Number.isNaN(v)) return "0";
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return Number(v).toFixed(digits);
};

const OCRResultsDisplay = ({ results, loading, error, inputData }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
          <p className="text-gray-600">Calculating OCR + LLM sizing…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <h3 className="text-lg font-medium text-yellow-800 mb-2">Warning</h3>
        <p className="text-yellow-600">{error}</p>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-4">
          <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-500">No results yet</h3>
        <p className="text-gray-400">Submit your OCR + LLM configuration to see the sizing</p>
      </div>
    );
  }

  // LLM-stage memory breakdown
  const totalMem = results.instance_total_mem_gb || 0;
  const modelMem = results.model_mem_gb || 0;
  const kvAtPeak = (results.kv_per_session_gb || 0) * (results.bs_real_star || 0);
  const overhead = Math.max(0, totalMem - modelMem - kvAtPeak);

  const memBreakdown = [
    { name: "Model Weights", value: Math.round(modelMem * 100) / 100 },
    { name: "KV-cache (at BS*)", value: Math.round(kvAtPeak * 100) / 100 },
    ...(overhead > 0.01
      ? [{ name: "Reserved", value: Math.round(overhead * 100) / 100 }]
      : []),
  ];
  const DONUT_COLORS = ["#6366f1", "#10b981", "#94a3b8"];

  const slaPass = results.sla_pass;
  const slaCardClass = slaPass
    ? "bg-gradient-to-br from-emerald-500 to-teal-600"
    : "bg-gradient-to-br from-red-500 to-rose-600";

  const isCpuPipeline = results.pipeline_used === "ocr_cpu";

  return (
    <div className="gap-6 flex flex-col flex-1">
      <h2 className="text-lg sm:text-2xl font-semibold text-gray-800">OCR + LLM Sizing Results</h2>

      {/* ── 3 Key Metric Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-tour="ocr-result-cards">
        {/* Card 1 — Infrastructure */}
        <div className="result-tile bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-4 sm:p-6 text-white shadow-lg flex flex-col sm:min-h-[170px] overflow-hidden">
          <h3 className="text-xs font-semibold uppercase tracking-wider opacity-70">
            Infrastructure Required
          </h3>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-auto mb-auto">
            <div className="text-center">
              <p
                className="text-2xl sm:text-3xl font-extrabold leading-none tabular-nums whitespace-nowrap"
                title={String(results.n_servers_total_online || 0)}
              >
                {fmt(results.n_servers_total_online, 0)}
              </p>
              <p className="text-[10px] sm:text-xs opacity-70 mt-1 uppercase tracking-wide">
                servers
              </p>
            </div>
            <div className="text-2xl opacity-30 leading-none -mt-3" aria-hidden="true">
              ·
            </div>
            <div className="text-center">
              <p
                className="text-2xl sm:text-3xl font-extrabold leading-none tabular-nums whitespace-nowrap"
                title={String(results.n_gpu_total_online || 0)}
              >
                {fmt(results.n_gpu_total_online, 0)}
              </p>
              <p className="text-[10px] sm:text-xs opacity-70 mt-1 uppercase tracking-wide">
                GPUs
              </p>
            </div>
          </div>
          <p className="text-xs sm:text-sm opacity-75 mt-2">
            OCR pool: {results.n_gpu_ocr_online || 0} · LLM pool: {results.n_gpu_llm_online || 0}
            {isCpuPipeline ? " · OCR on CPU" : ""}
          </p>
        </div>

        {/* Card 2 — SLA */}
        <div
          className={`result-tile ${slaCardClass} rounded-xl p-4 sm:p-6 text-white shadow-lg flex flex-col sm:min-h-[170px] overflow-hidden`}
        >
          <h3 className="text-xs font-semibold uppercase tracking-wider opacity-70">
            SLA per page
          </h3>
          <p className="text-3xl sm:text-4xl font-extrabold mt-auto mb-auto">
            {slaPass ? "PASS" : "FAIL"}
          </p>
          <p className="text-xs sm:text-sm opacity-90 mt-2">
            t_OCR {fmt(results.t_ocr, 2)}s · LLM budget {fmt(results.t_llm_target, 2)}s ·
            target {fmt(results.sla_page_target, 2)}s
          </p>
        </div>

        {/* Card 3 — LLM throughput */}
        <div className="result-tile bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-4 sm:p-6 text-white shadow-lg flex flex-col sm:min-h-[170px]">
          <h3 className="text-xs font-semibold uppercase tracking-wider opacity-70">
            LLM Throughput
          </h3>
          <p className="text-3xl sm:text-4xl font-extrabold mt-auto mb-auto">
            {fmt(results.th_pf_llm, 0)}
            <span className="text-base font-semibold opacity-70 ml-1">tok/s prefill</span>
          </p>
          <p className="text-xs sm:text-sm opacity-75 mt-2">
            decode {fmt(results.th_dec_llm, 0)} tok/s
          </p>
        </div>
      </div>

      {/* ── Pool breakdown ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="bg-gradient-to-br from-rose-400/80 to-pink-500/80 rounded-lg p-3 sm:p-4 text-white shadow">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
            OCR pool
          </h3>
          <p className="text-xl sm:text-2xl font-bold mt-1">
            {isCpuPipeline ? "CPU" : results.n_gpu_ocr_online || 0}
          </p>
          <p className="text-[10px] opacity-70 mt-0.5">
            {isCpuPipeline ? `${results.n_ocr_cores_used || 0} cores` : "GPUs"}
          </p>
        </div>
        <div className="bg-gradient-to-br from-blue-400/80 to-indigo-500/80 rounded-lg p-3 sm:p-4 text-white shadow">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
            LLM pool
          </h3>
          <p className="text-xl sm:text-2xl font-bold mt-1">{results.n_gpu_llm_online || 0}</p>
          <p className="text-[10px] opacity-70 mt-0.5">GPUs</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-400/80 to-teal-500/80 rounded-lg p-3 sm:p-4 text-white shadow">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
            BS_real*
          </h3>
          <p className="text-xl sm:text-2xl font-bold mt-1">{results.bs_real_star || 0}</p>
        </div>
        <div className="bg-gradient-to-br from-violet-400/80 to-purple-500/80 rounded-lg p-3 sm:p-4 text-white shadow">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
            LLM replicas
          </h3>
          <p className="text-xl sm:text-2xl font-bold mt-1">{results.n_repl_llm || 0}</p>
        </div>
      </div>

      {/* ── Gateway Quotas (two-pool: OCR + LLM) ── */}
      <div className="bg-white rounded-lg p-4 shadow border border-gray-200">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800">Gateway Quotas</h3>
          <span className="text-[11px] text-gray-500">
            Rate-limit OCR and LLM pools independently
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-rose-50 rounded-md py-2 px-2">
            <p className="text-[10px] uppercase font-semibold text-rose-700 tracking-wider">
              OCR Peak RPM
            </p>
            <p className="text-lg font-bold text-rose-900 mt-1">
              {isCpuPipeline ? "—" : fmt(results.ocr_peak_rpm, 0)}
            </p>
            <p className="text-[10px] text-rose-600 mt-0.5">
              {isCpuPipeline ? "CPU pipeline" : "pages/min"}
            </p>
          </div>
          <div className="bg-indigo-50 rounded-md py-2 px-2">
            <p className="text-[10px] uppercase font-semibold text-indigo-700 tracking-wider">
              LLM Peak RPM
            </p>
            <p className="text-lg font-bold text-indigo-900 mt-1">
              {fmt(results.llm_peak_rpm, 0)}
            </p>
            <p className="text-[10px] text-indigo-600 mt-0.5">
              sustained {fmt(results.llm_sustained_rpm, 0)}
            </p>
          </div>
          <div className="bg-emerald-50 rounded-md py-2 px-2">
            <p className="text-[10px] uppercase font-semibold text-emerald-700 tracking-wider">
              LLM Peak TPM
            </p>
            <p className="text-lg font-bold text-emerald-900 mt-1">
              {fmt(results.llm_peak_tpm, 0)}
            </p>
            <p className="text-[10px] text-emerald-600 mt-0.5">
              in {fmt(results.llm_peak_tpm_input, 0)} · out {fmt(results.llm_peak_tpm_output, 0)}
            </p>
          </div>
          <div className="bg-amber-50 rounded-md py-2 px-2">
            <p className="text-[10px] uppercase font-semibold text-amber-700 tracking-wider">
              Max Parallel
            </p>
            <p className="text-lg font-bold text-amber-900 mt-1">
              {fmt(results.max_parallel_requests, 0)}
            </p>
            <p className="text-[10px] text-amber-600 mt-0.5">concurrent pages</p>
          </div>
        </div>
      </div>

      {/* ── MIG feasibility hint (LLM stage; advisory) ── */}
      <MigHintBadge
        gpuId={inputData?.gpu_id}
        modelMemGb={results.model_mem_gb}
        kvAtPeakGb={results.kv_per_session_gb}
        gpusPerInstance={results.gpus_per_instance}
        tpMultiplierZ={inputData?.tp_multiplier_Z}
        servers={results.n_servers_total_online}
        totalGpus={results.n_gpu_llm_online}
      />

      {/* ── Memory donut (LLM stage) ── */}
      <div className="bg-gray-50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">
          GPU memory per LLM instance
        </h3>
        <div className="flex items-center gap-6">
          <div className="w-32 h-32 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={memBreakdown}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="60%"
                  outerRadius="100%"
                  paddingAngle={2}
                >
                  {memBreakdown.map((_, i) => (
                    <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(value, name) => [`${value} GB`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-2">
            {memBreakdown.map((entry, i) => (
              <div key={entry.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
                  />
                  <span className="text-gray-700">{entry.name}</span>
                </span>
                <span className="font-mono text-gray-800">{entry.value} GB</span>
              </div>
            ))}
            <div className="text-xs text-gray-500 pt-2 border-t border-gray-200">
              Total per instance: {fmt(totalMem, 1)} GB · KV at BS*: {fmt(kvAtPeak, 1)} GB
            </div>
          </div>
        </div>
      </div>

      {/* ── Diagnostics ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">
          Diagnostics
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <Stat label="Pipeline" value={results.pipeline_used || "—"} />
          <Stat label="t_OCR / page" value={`${fmt(results.t_ocr, 2)} s`} />
          <Stat label="LLM SLA budget" value={`${fmt(results.t_llm_target, 2)} s`} />
          <Stat label="L_text" value={`${fmt(results.l_text, 0)} tok`} />
          <Stat label="SL_pf (eff)" value={fmt(results.sl_pf_llm_eff, 0)} />
          <Stat label="SL_dec" value={results.sl_dec_llm} />
          <Stat label="GPUs / instance" value={results.gpus_per_instance} />
          <Stat label="Sessions / instance" value={results.s_tp_z} />
          <Stat
            label="KV / session"
            value={`${fmt(results.kv_per_session_gb, 2)} GB`}
          />
          <Stat label="Model weights" value={`${fmt(results.model_mem_gb, 1)} GB`} />
          <Stat label="GPU TFLOPS used" value={results.gpu_tflops_used} />
          <Stat label="Handoff" value={`${fmt(results.t_handoff_used, 2)} s`} />
        </div>
      </div>
    </div>
  );
};

const Stat = ({ label, value }) => (
  <div className="flex flex-col">
    <span className="text-[10px] uppercase tracking-wider text-gray-500">{label}</span>
    <span className="text-sm font-mono text-gray-800 mt-0.5">{value ?? "—"}</span>
  </div>
);

export default OCRResultsDisplay;
