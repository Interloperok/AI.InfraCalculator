import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import {
  AlertTriangle,
  BarChart3,
  Database,
  Gauge,
  HardDrive,
  Info,
  Loader2,
} from "lucide-react";
import MigHintBadge from "./MigHintBadge";
import { useT } from "../../contexts/I18nContext";

const fmt = (v, digits = 2) => {
  if (v === undefined || v === null || Number.isNaN(v)) return "0";
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return Number(v).toFixed(digits);
};

const fmtTemplate = (str, params) =>
  str.replace(/\{(\w+)\}/g, (_, key) =>
    params[key] === undefined || params[key] === null ? "" : String(params[key]),
  );

const InfoTooltip = ({ text, align = "center", onColor = false }) => (
  <span className="relative group/tip inline-flex items-center">
    <Info
      className={`h-3.5 w-3.5 cursor-help ${onColor ? "text-white/70" : "text-subtle"}`}
      strokeWidth={2.25}
    />
    <span
      className={`invisible group-hover/tip:visible opacity-0 group-hover/tip:opacity-100 transition-opacity duration-200 absolute z-[9999] bottom-full ${
        align === "right" ? "right-0" : align === "left" ? "left-0" : "left-1/2 -translate-x-1/2"
      } mb-1.5 px-2.5 py-1.5 text-[11px] font-normal normal-case tracking-normal text-white bg-slate-900 dark:bg-slate-800 rounded-md shadow-elevated w-56 text-center leading-relaxed pointer-events-none`}
    >
      {text}
      <span
        className={`absolute top-full ${
          align === "right" ? "right-3" : align === "left" ? "left-3" : "left-1/2 -translate-x-1/2"
        } border-4 border-transparent border-t-slate-900 dark:border-t-slate-800`}
      />
    </span>
  </span>
);

const MetricLabel = ({ children, tooltip, tooltipAlign, onColor = false }) => (
  <div
    className={`flex w-full items-start gap-1 text-xs uppercase tracking-wider font-semibold ${onColor ? "text-white/90" : "text-muted"}`}
  >
    <span className="min-w-0 flex-1 leading-tight break-words">{children}</span>
    {tooltip && (
      <span className="inline-flex shrink-0 self-start">
        <InfoTooltip text={tooltip} align={tooltipAlign} onColor={onColor} />
      </span>
    )}
  </div>
);

const GatewayQuotaTile = ({ label, tooltip, tooltipAlign = "center", value, footer }) => (
  <div className="bg-elevated border border-border rounded-lg py-2.5 px-3 flex flex-col h-full">
    <div className="flex w-full items-start gap-1 min-h-[2.5rem] shrink-0 text-[10px] uppercase font-semibold text-muted tracking-wider">
      <span className="min-w-0 flex-1 leading-tight break-words">{label}</span>
      {tooltip && (
        <span className="inline-flex shrink-0 self-start">
          <InfoTooltip text={tooltip} align={tooltipAlign} />
        </span>
      )}
    </div>
    <div className="min-h-[1.75rem] mt-1 flex items-center text-lg font-semibold text-fg tabular-nums">
      {value}
    </div>
    <p className="text-[10px] text-muted mt-0.5 min-h-[2rem] leading-snug tabular-nums">{footer}</p>
  </div>
);

const Stat = ({ label, value, tooltip, tooltipAlign }) => (
  <div className="flex justify-between items-center py-2 border-b border-border last:border-b-0">
    <span className="text-sm text-muted flex items-center gap-1 min-w-0">
      <span className="truncate">{label}</span>
      {tooltip && <InfoTooltip text={tooltip} align={tooltipAlign || "center"} />}
    </span>
    <span className="text-sm font-semibold tabular-nums text-fg shrink-0 ml-2">{value ?? "—"}</span>
  </div>
);

const VLMResultsDisplay = ({ results, loading, error, inputData }) => {
  const t = useT();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 text-accent animate-spin mb-4" strokeWidth={2.25} />
          <p className="text-muted">{t("vlm.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center">
        <div className="bg-warning-soft border border-warning/30 rounded-lg p-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-warning" strokeWidth={2.25} />
            <h3 className="text-lg font-semibold text-warning">{t("results.warning")}</h3>
          </div>
          <p className="text-warning/90 dark:text-warning text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="text-center py-12">
        <div className="text-subtle mb-4">
          <BarChart3 className="mx-auto h-12 w-12" strokeWidth={1.75} />
        </div>
        <h3 className="text-lg font-semibold text-fg">{t("results.empty.title")}</h3>
        <p className="text-muted text-sm mt-1">{t("results.empty.subtitle")}</p>
      </div>
    );
  }

  const totalMem = results.instance_total_mem_gb || 0;
  const modelMem = results.model_mem_gb || 0;
  const kvAtPeak = (results.kv_per_session_gb || 0) * (results.bs_real_star || 0);
  const overhead = Math.max(0, totalMem - modelMem - kvAtPeak);

  const memBreakdown = [
    { name: t("vlm.memModel"), value: Math.round(modelMem * 100) / 100 },
    { name: t("vlm.memKv"), value: Math.round(kvAtPeak * 100) / 100 },
    ...(overhead > 0.01
      ? [{ name: t("vlm.memReserved"), value: Math.round(overhead * 100) / 100 }]
      : []),
  ];
  const DONUT_COLORS = ["#6366f1", "#10b981", "#94a3b8"];

  const slaPass = results.sla_pass;
  const showGateway =
    results.peak_rpm != null ||
    results.peak_tpm != null ||
    results.peak_tpm_input != null ||
    results.max_parallel_requests != null;

  return (
    <div className="gap-5 flex flex-col flex-1">
      <h2 className="text-lg sm:text-2xl font-semibold tracking-tight text-fg">{t("vlm.title")}</h2>

      {/* ── Primary metric tiles (3) ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-tour="vlm-result-cards">
        <div
          className="result-tile bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-4 sm:p-6 text-white shadow-lg flex flex-col sm:min-h-[170px] overflow-hidden"
        >
          <MetricLabel tooltip={t("vlm.infraRequired.tooltip")} tooltipAlign="left" onColor>
            {t("vlm.infraRequired")}
          </MetricLabel>
          <div className="flex flex-1 items-center min-h-[4.5rem]">
            <p
              className="text-4xl sm:text-5xl font-extrabold tracking-tight tabular-nums leading-none"
              title={String(results.n_servers_vlm_online || 0)}
            >
              {fmt(results.n_servers_vlm_online, 0)}
            </p>
          </div>
          <p className="text-xs sm:text-sm text-white/80 shrink-0 min-h-[2.5rem] leading-snug tabular-nums">
            {fmt(results.n_gpu_vlm_online, 0)} {t("vlm.gpus")}
          </p>
          <p className="text-xs sm:text-sm text-white/70 leading-snug tabular-nums -mt-1">
            {fmtTemplate(t("vlm.replicasSubtitle"), {
              count: results.n_repl_vlm || 0,
              gpus: results.gpus_per_server || 0,
            })}
          </p>
        </div>

        <div
          className={`result-tile bg-gradient-to-br rounded-xl p-4 sm:p-6 text-white shadow-lg flex flex-col sm:min-h-[170px] overflow-hidden ${
            slaPass ? "from-emerald-500 to-teal-600" : "from-red-500 to-rose-600"
          }`}
        >
          <MetricLabel tooltip={t("vlm.slaPerPage.tooltip")} onColor>
            {t("vlm.slaPerPage")}
          </MetricLabel>
          <div className="flex flex-1 items-center min-h-[4.5rem]">
            <p className="text-4xl sm:text-5xl font-extrabold tracking-tight tabular-nums leading-none">
              {slaPass ? t("vlm.slaPass") : t("vlm.slaFail")}
            </p>
          </div>
          <p className="text-xs sm:text-sm text-white/80 shrink-0 min-h-[2.5rem] leading-snug tabular-nums">
            {fmtTemplate(t("vlm.slaDetail"), {
              actual: fmt(results.t_page_vlm, 2),
              target: fmt(results.sla_page_target, 2),
            })}
          </p>
        </div>

        <div className="result-tile bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-4 sm:p-6 text-white shadow-lg flex flex-col sm:min-h-[170px] overflow-hidden">
          <MetricLabel tooltip={t("vlm.throughput.tooltip")} tooltipAlign="right" onColor>
            {t("vlm.throughput")}
          </MetricLabel>
          <div className="flex flex-1 items-center min-h-[4.5rem]">
            <p className="text-4xl sm:text-5xl font-extrabold tracking-tight tabular-nums leading-none">
              {fmt(results.th_pf_vlm, 0)}
              <span className="text-sm font-normal text-white/80 ml-2">{t("vlm.throughputUnit")}</span>
            </p>
          </div>
          <p className="text-xs sm:text-sm text-white/80 shrink-0 min-h-[2.5rem] leading-snug tabular-nums">
            {fmtTemplate(t("vlm.decode"), { value: fmt(results.th_dec_vlm, 0) })}
          </p>
        </div>
      </div>

      {/* ── Secondary metric tiles (4) ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="bg-gradient-to-br from-blue-400/80 to-indigo-500/80 rounded-lg p-3 sm:p-4 text-white shadow overflow-hidden">
          <div className="flex w-full items-start gap-1 text-[10px] sm:text-xs uppercase tracking-wider text-white/90 font-semibold">
            <span className="min-w-0 flex-1 leading-tight break-words">{t("vlm.bsRealStar")}</span>
            <span className="inline-flex shrink-0 self-start">
              <InfoTooltip text={t("vlm.bsRealStar.tooltip")} align="left" onColor />
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-semibold mt-1.5 tabular-nums">
            {results.bs_real_star || 0}
          </p>
        </div>
        <div className="bg-gradient-to-br from-emerald-400/80 to-teal-500/80 rounded-lg p-3 sm:p-4 text-white shadow">
          <div className="flex w-full items-start gap-1 text-[10px] sm:text-xs uppercase tracking-wider text-white/90 font-semibold">
            <span className="min-w-0 flex-1 leading-tight break-words">{t("vlm.replicas")}</span>
            <span className="inline-flex shrink-0 self-start">
              <InfoTooltip text={t("vlm.replicas.tooltip")} onColor />
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-semibold mt-1.5 tabular-nums">
            {results.n_repl_vlm || 0}
          </p>
        </div>
        <div className="bg-gradient-to-br from-violet-400/80 to-purple-500/80 rounded-lg p-3 sm:p-4 text-white shadow">
          <div className="flex w-full items-start gap-1 text-[10px] sm:text-xs uppercase tracking-wider text-white/90 font-semibold">
            <span className="min-w-0 flex-1 leading-tight break-words">{t("vlm.visualTokens")}</span>
            <span className="inline-flex shrink-0 self-start">
              <InfoTooltip text={t("vlm.visualTokens.tooltip")} onColor />
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-semibold mt-1.5 tabular-nums">{fmt(results.v_tok, 0)}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-400/80 to-orange-500/80 rounded-lg p-3 sm:p-4 text-white shadow">
          <div className="flex w-full items-start gap-1 text-[10px] sm:text-xs uppercase tracking-wider text-white/90 font-semibold">
            <span className="min-w-0 flex-1 leading-tight break-words">{t("vlm.prefillLength")}</span>
            <span className="inline-flex shrink-0 self-start">
              <InfoTooltip text={t("vlm.prefillLength.tooltip")} align="right" onColor />
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-semibold mt-1.5 tabular-nums">
            {fmt(results.sl_pf_vlm, 0)}
          </p>
        </div>
      </div>

      {showGateway && (
        <div className="bg-surface border border-border rounded-xl p-4 sm:p-5 shadow-card">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="text-lg font-semibold text-fg flex items-center gap-2">
              <Gauge className="h-4 w-4 text-muted" strokeWidth={2.25} />
              {t("results.gateway.title")}
            </h3>
            <span className="text-[11px] text-muted truncate">{t("results.gateway.subtitle")}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 items-stretch">
            <GatewayQuotaTile
              label={t("results.gateway.peakRpm")}
              tooltip={t("results.gateway.peakRpmTooltip")}
              tooltipAlign="left"
              value={fmt(results.peak_rpm, 0)}
              footer={`${t("results.gateway.sustained")} ${fmt(results.sustained_rpm, 0)}`}
            />
            <GatewayQuotaTile
              label={t("results.gateway.peakTpm")}
              tooltip={t("results.gateway.peakTpmTooltip")}
              value={fmt(results.peak_tpm, 0)}
              footer={`${t("results.gateway.sustained")} ${fmt(results.sustained_tpm, 0)}`}
            />
            <GatewayQuotaTile
              label={t("results.gateway.tpmSplit")}
              tooltip={t("results.gateway.tpmSplitTooltip")}
              value={
                <>
                  <span className="text-muted font-semibold">{t("results.gateway.in")}</span>{" "}
                  {fmt(results.peak_tpm_input, 0)}
                </>
              }
              footer={
                <>
                  <span>{t("results.gateway.out")}</span> {fmt(results.peak_tpm_output, 0)}
                </>
              }
            />
            <GatewayQuotaTile
              label={t("results.gateway.maxParallel")}
              tooltip={t("results.gateway.maxParallelTooltip")}
              tooltipAlign="right"
              value={fmt(results.max_parallel_requests, 0)}
              footer={t("results.gateway.concurrent")}
            />
          </div>
        </div>
      )}

      <MigHintBadge
        gpuId={inputData?.gpu_id}
        modelMemGb={results.model_mem_gb}
        kvAtPeakGb={results.kv_per_session_gb}
        gpusPerInstance={results.gpus_per_instance}
        tpMultiplierZ={inputData?.tp_multiplier_Z}
        servers={results.n_servers_vlm_online}
        totalGpus={results.n_gpu_vlm_online}
      />

      <div
        className="bg-surface border border-border rounded-xl p-4 sm:p-6 shadow-card"
        data-tour="vlm-donut-chart"
      >
        <h3 className="text-lg font-semibold text-fg mb-2 flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted" strokeWidth={2.25} />
          {t("results.memory.title")}
        </h3>

        <div className="flex flex-col sm:flex-row items-center gap-6">
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
                  contentStyle={{
                    borderRadius: "8px",
                    fontSize: "12px",
                    background: "rgb(var(--color-surface))",
                    border: "1px solid rgb(var(--color-border))",
                    color: "rgb(var(--color-fg))",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-semibold tracking-tight text-fg tabular-nums">
                {fmt(totalMem, 1)}
              </span>
              <span className="text-xs text-muted mt-0.5">GiB</span>
            </div>
          </div>

          <div className="space-y-3 flex-1 min-w-0 w-full">
            {memBreakdown.map((item, i) => (
              <div key={item.name} className="flex items-center gap-3">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="text-sm text-fg truncate">{item.name}</span>
                    <span className="text-sm font-semibold tabular-nums text-fg shrink-0">
                      {fmt(item.value, 2)} GiB
                    </span>
                  </div>
                  <div className="w-full bg-elevated rounded-full h-1.5 mt-1 border border-border">
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
            <p className="text-sm text-muted tabular-nums pt-1 text-left">
              {fmtTemplate(t("vlm.memTotalLine"), {
                total: fmt(totalMem, 1),
                kv: fmt(kvAtPeak, 1),
              })}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-4 sm:p-6 shadow-card">
        <h3 className="text-lg font-semibold text-fg mb-4 flex items-center gap-2">
          <Database className="h-4 w-4 text-muted" strokeWidth={2.25} />
          {t("vlm.diagnostics")}
        </h3>
        <div className="divide-y divide-border rounded-lg border border-border bg-elevated px-3">
          <Stat
            label={t("vlm.diag.gpusPerInstance")}
            value={results.gpus_per_instance}
            tooltip={t("vlm.diag.gpusPerInstance.tooltip")}
            tooltipAlign="left"
          />
          <Stat label={t("vlm.diag.sTpZ")} value={results.s_tp_z} tooltip={t("vlm.diag.sTpZ.tooltip")} />
          <Stat
            label={t("vlm.diag.instanceMem")}
            value={`${fmt(results.instance_total_mem_gb, 1)} GB`}
            tooltip={t("vlm.diag.instanceMem.tooltip")}
          />
          <Stat
            label={t("vlm.diag.gpuTflops")}
            value={results.gpu_tflops_used}
            tooltip={t("vlm.diag.gpuTflops.tooltip")}
          />
          <Stat
            label={t("vlm.diag.slPfEff")}
            value={fmt(results.sl_pf_vlm_eff, 0)}
            tooltip={t("vlm.diag.slPfEff.tooltip")}
          />
          <Stat
            label={t("vlm.diag.slDec")}
            value={results.sl_dec_vlm}
            tooltip={t("vlm.diag.slDec.tooltip")}
          />
          <Stat
            label={t("vlm.diag.kvPerPage")}
            value={`${fmt(results.kv_per_session_gb, 2)} GB`}
            tooltip={t("vlm.diag.kvPerPage.tooltip")}
          />
          <Stat
            label={t("vlm.diag.modelWeights")}
            value={`${fmt(results.model_mem_gb, 1)} GB`}
            tooltip={t("vlm.diag.modelWeights.tooltip")}
          />
          <Stat
            label={t("vlm.diag.slaTarget")}
            value={`${fmt(results.sla_page_target, 2)} s`}
            tooltip={t("vlm.diag.slaTarget.tooltip")}
            tooltipAlign="right"
          />
        </div>
      </div>
    </div>
  );
};

export default VLMResultsDisplay;
