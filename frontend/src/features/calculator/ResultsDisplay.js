import React, { useState, useRef, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import {
  Server,
  Cpu,
  Zap,
  Layers,
  MessageSquare,
  Users,
  DollarSign,
  Bell,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Timer,
  Database,
  Activity,
  Download,
  Loader2,
  Info,
  X,
  BarChart3,
  Gauge,
  Box,
  HardDrive,
} from "lucide-react";
import { downloadReport } from "../../services/api";
import { useT } from "../../contexts/I18nContext";
import MigHintBadge from "./MigHintBadge";

// ── Helpers ────────────────────────────────────────────────────────────
// Number formatter — compact form for large counts (16.8K, 2.3M …).
const fmt = (v, digits = 2) => {
  if (v === undefined || v === null || isNaN(v)) return "0";
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(digits);
};

// Throughput formatter — keeps sub-1 values readable instead of rounding
// small but non-zero throughputs (e.g. 0.02 req/s under heavy ReAct load)
// to "0.0" which reads as broken.
const fmtThroughput = (v) => {
  if (v === undefined || v === null || isNaN(v)) return "0";
  const abs = Math.abs(v);
  if (abs >= 100) return v.toFixed(0);
  if (abs >= 10) return v.toFixed(1);
  if (abs >= 1) return v.toFixed(2);
  if (abs >= 0.01) return v.toFixed(3);
  if (abs >= 0.001) return v.toFixed(4);
  if (abs > 0) return "<0.001";
  return "0";
};

// Simple {token} interpolator for i18n strings with placeholders.
const interp = (s, vars) =>
  s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ""));

// ── Tiny presentational sub-components ─────────────────────────────────

const InfoTooltip = ({ text, align = "center" }) => (
  <span className="relative group/tip inline-flex items-center">
    <Info className="h-3.5 w-3.5 text-subtle cursor-help" strokeWidth={2.25} />
    <span
      className={`invisible group-hover/tip:visible opacity-0 group-hover/tip:opacity-100 transition-opacity duration-200 absolute z-[9999] bottom-full ${
        align === "right"
          ? "right-0"
          : align === "left"
            ? "left-0"
            : "left-1/2 -translate-x-1/2"
      } mb-1.5 px-2.5 py-1.5 text-[11px] font-normal normal-case tracking-normal text-white bg-slate-900 dark:bg-slate-800 rounded-md shadow-elevated w-56 text-center leading-relaxed pointer-events-none`}
    >
      {text}
      <span
        className={`absolute top-full ${
          align === "right"
            ? "right-3"
            : align === "left"
              ? "left-3"
              : "left-1/2 -translate-x-1/2"
        } border-4 border-transparent border-t-slate-900 dark:border-t-slate-800`}
      />
    </span>
  </span>
);

const MetricLabel = ({ children, icon: Icon, tooltip, tooltipAlign }) => (
  <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted font-semibold">
    {Icon && <Icon className="h-3.5 w-3.5 text-subtle" strokeWidth={2.25} />}
    <span>{children}</span>
    {tooltip && <InfoTooltip text={tooltip} align={tooltipAlign} />}
  </div>
);

const StatRow = ({ label, value, divider = true }) => (
  <div
    className={`flex justify-between items-center py-2 ${
      divider ? "border-b border-border" : ""
    }`}
  >
    <span className="text-sm text-muted">{label}</span>
    <span className="text-sm font-semibold tabular-nums text-fg">{value}</span>
  </div>
);

// ── Main component ─────────────────────────────────────────────────────

const ResultsDisplay = ({ results, loading, error, inputData }) => {
  const t = useT();
  const [detailTab, setDetailTab] = useState("memory"); // 'memory' | 'compute'
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);
  const [slaNotificationsOpen, setSlaNotificationsOpen] = useState(false);
  const [slaDropdownPos, setSlaDropdownPos] = useState(null);
  const slaNotificationsRef = useRef(null);
  const slaBellRef = useRef(null);

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

  // ── Loading / error / empty states ───────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2
            className="mx-auto h-10 w-10 text-accent animate-spin mb-4"
            strokeWidth={2.25}
          />
          <p className="text-muted">{t("results.loading")}</p>
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

  // ── Donut data ───────────────────────────────────────────────────────
  const totalMem = results.instance_total_mem_gb || 0;
  const modelMem = results.model_mem_gb || 0;
  const kvFree = results.kv_free_per_instance_tp_gb || 0;
  const overhead = Math.max(0, totalMem - modelMem - kvFree);

  const memBreakdown = [
    { name: t("results.memory.modelWeights"), value: Math.round(modelMem * 100) / 100 },
    { name: t("results.memory.kvAvailable"), value: Math.round(kvFree * 100) / 100 },
    ...(overhead > 0.01
      ? [{ name: t("results.memory.reserved"), value: Math.round(overhead * 100) / 100 }]
      : []),
  ];
  // Recharts paints in this order — use semantic CSS variables so the donut
  // re-tints automatically when the user toggles dark mode.
  const DONUT_COLORS = [
    "rgb(var(--color-accent))",
    "rgb(var(--color-info))",
    "rgb(var(--color-subtle))",
  ];

  const gpusInst = results.gpus_per_instance_tp || results.gpus_per_instance || 0;
  const showGateway =
    results.peak_rpm != null ||
    results.peak_tpm != null ||
    results.peak_tpm_input != null ||
    results.max_parallel_requests != null;

  return (
    <div className="gap-5 flex flex-col flex-1">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent shadow-card">
          <BarChart3 className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <h2 className="text-lg sm:text-2xl font-semibold tracking-tight text-fg">
          {t("results.title")}
        </h2>
      </div>

      {/* ── Download error toast ───────────────────────────────────── */}
      {downloadError && (
        <div className="bg-danger-soft border border-danger/30 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <XCircle className="h-4 w-4 text-danger shrink-0" strokeWidth={2.25} />
            <p className="text-sm text-danger break-words">{downloadError}</p>
          </div>
          <button
            type="button"
            onClick={() => setDownloadError(null)}
            className="text-danger/70 hover:text-danger transition-colors shrink-0"
            title={t("results.dismiss")}
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
      )}

      {/* ── Cost estimate hero ─────────────────────────────────────── */}
      <div
        data-tour="cost-estimate"
        className="result-tile bg-surface border border-border rounded-xl p-4 sm:p-5 shadow-card flex items-center justify-between gap-3"
      >
        <div className="min-w-0">
          <MetricLabel icon={DollarSign} tooltip={t("results.cost.tooltip")} tooltipAlign="left">
            {t("results.cost.title")}
          </MetricLabel>
          <p className="text-3xl sm:text-4xl font-semibold tracking-tight text-fg mt-1.5 truncate tabular-nums">
            {results.cost_estimate_usd != null && results.cost_estimate_usd > 0
              ? `$${Number(results.cost_estimate_usd).toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}`
              : "—"}
          </p>
          {results.cost_estimate_usd != null && results.cost_estimate_usd > 0 && (
            <p className="text-xs text-muted mt-0.5">{t("results.cost.subtitle")}</p>
          )}
        </div>
        <span className="hidden sm:inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent shrink-0">
          <DollarSign className="h-6 w-6" strokeWidth={2.25} />
        </span>
      </div>

      {/* ── Concurrent sessions + session context ───────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-tour="session-cards">
        <div className="bg-surface border border-border rounded-xl p-4 sm:p-5 shadow-card flex items-center justify-between gap-3 overflow-hidden">
          <div className="min-w-0">
            <MetricLabel
              icon={Users}
              tooltip={t("results.concurrentSessions.tooltip")}
              tooltipAlign="left"
            >
              {t("results.concurrentSessions")}
            </MetricLabel>
            <p className="text-3xl sm:text-4xl font-semibold tracking-tight text-fg mt-1.5 tabular-nums truncate">
              {fmt(results.Ssim_concurrent_sessions, 0)}
            </p>
          </div>
          <span className="hidden sm:inline-flex h-11 w-11 items-center justify-center rounded-xl bg-info-soft text-info shrink-0">
            <Users className="h-5 w-5" strokeWidth={2.25} />
          </span>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 sm:p-5 shadow-card flex items-center justify-between gap-3 overflow-hidden">
          <div className="min-w-0">
            <MetricLabel
              icon={MessageSquare}
              tooltip={t("results.sessionContext.tooltip")}
              tooltipAlign="right"
            >
              {t("results.sessionContext")}
            </MetricLabel>
            <p className="text-3xl sm:text-4xl font-semibold tracking-tight text-fg mt-1.5 tabular-nums truncate">
              {fmt(results.TS_session_context, 0)}
              <span className="text-sm font-normal text-muted ml-1.5">
                {t("results.sessionContext.unit")}
              </span>
            </p>
          </div>
          <span className="hidden sm:inline-flex h-11 w-11 items-center justify-center rounded-xl bg-info-soft text-info shrink-0">
            <MessageSquare className="h-5 w-5" strokeWidth={2.25} />
          </span>
        </div>
      </div>

      {/* ── Primary metric tiles (3) ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-tour="result-cards">
        {/* Card 1 — Infrastructure: stacked layout so big values can't
             clip the label. max(mem,comp) breakdown moved to hover
             tooltip — too noisy on the front of the card. */}
        <div
          className="result-tile bg-surface border border-accent/40 rounded-xl p-4 sm:p-5 shadow-card flex flex-col sm:min-h-[170px] overflow-hidden"
          title={interp(t("results.infrastructure.maxMemComp"), {
            mem: results.servers_by_memory || 0,
            comp: results.servers_by_compute || 0,
          })}
        >
          <MetricLabel
            icon={Server}
            tooltip={t("results.infrastructure.tooltip")}
            tooltipAlign="left"
          >
            {t("results.infrastructure.title")}
          </MetricLabel>
          <div className="mt-auto mb-auto pt-2">
            <p
              className="text-4xl sm:text-5xl font-semibold tracking-tight text-fg tabular-nums leading-none"
              title={String(results.servers_final || 0)}
            >
              {fmt(results.servers_final, 0)}
            </p>
            <p className="text-[11px] uppercase tracking-wide text-muted mt-2 font-semibold">
              {t("results.infrastructure.servers")}
            </p>
          </div>
          <p className="text-xs text-muted mt-2 tabular-nums">
            {fmt(results.total_gpu_count, 0)} {t("results.infrastructure.gpus")}
          </p>
        </div>

        {/* Card 2 — Sessions per Server */}
        <div className="result-tile bg-surface border border-border rounded-xl p-4 sm:p-6 shadow-card flex flex-col sm:min-h-[170px] overflow-hidden">
          <MetricLabel icon={Users} tooltip={t("results.sessions.tooltip")}>
            {t("results.sessions.title")}
          </MetricLabel>
          <p className="text-4xl sm:text-5xl font-semibold tracking-tight text-fg mt-auto mb-auto tabular-nums">
            {results.sessions_per_server || 0}
          </p>
          <p className="text-xs sm:text-sm text-muted mt-2 tabular-nums">
            {interp(t("results.sessions.subtitle"), {
              instances: results.instances_per_server_tp || 0,
              sessions: results.S_TP_z || 0,
            })}
          </p>
        </div>

        {/* Card 3 — Server Throughput */}
        <div className="result-tile bg-surface border border-border rounded-xl p-4 sm:p-6 shadow-card flex flex-col sm:min-h-[170px]">
          <MetricLabel
            icon={Zap}
            tooltip={t("results.throughput.tooltip")}
            tooltipAlign="right"
          >
            {t("results.throughput.title")}
          </MetricLabel>
          <p className="text-4xl sm:text-5xl font-semibold tracking-tight text-fg mt-auto mb-auto tabular-nums">
            {fmtThroughput(results.th_server_comp)}
            <span className="text-sm font-normal text-muted ml-2">
              {t("results.throughput.unit")}
            </span>
          </p>
          <p className="text-xs sm:text-sm text-muted mt-2 tabular-nums">
            {interp(t("results.throughput.detail"), {
              pf: fmt(results.th_prefill, 0),
              dec: fmt(results.th_decode, 0),
            })}
          </p>
        </div>
      </div>

      {/* ── Secondary metric tiles (3 small) ──────────────────────────── */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="bg-surface border border-border rounded-lg p-3 sm:p-4 shadow-card">
          <div className="flex items-start gap-1 text-[10px] sm:text-xs uppercase tracking-wider text-muted font-semibold">
            <Cpu className="h-3 w-3 text-subtle mt-px shrink-0" strokeWidth={2.25} />
            <span className="leading-tight break-words">{t("results.gpuPerServer.title")}</span>
            <span className="ml-auto shrink-0">
              <InfoTooltip text={t("results.gpuPerServer.tooltip")} align="left" />
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-semibold text-fg mt-1.5 tabular-nums">
            {results.gpus_per_server || 0}
          </p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3 sm:p-4 shadow-card">
          <div className="flex items-start gap-1 text-[10px] sm:text-xs uppercase tracking-wider text-muted font-semibold">
            <Box className="h-3 w-3 text-subtle mt-px shrink-0" strokeWidth={2.25} />
            <span className="leading-tight break-words">{t("results.gpuPerInstance.title")}</span>
            <span className="ml-auto shrink-0">
              <InfoTooltip text={t("results.gpuPerInstance.tooltip")} />
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-semibold text-fg mt-1.5 tabular-nums">{gpusInst}</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3 sm:p-4 shadow-card">
          <div className="flex items-start gap-1 text-[10px] sm:text-xs uppercase tracking-wider text-muted font-semibold">
            <Layers className="h-3 w-3 text-subtle mt-px shrink-0" strokeWidth={2.25} />
            <span className="leading-tight break-words">{t("results.instancesPerServer.title")}</span>
            <span className="ml-auto shrink-0">
              <InfoTooltip text={t("results.instancesPerServer.tooltip")} align="right" />
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-semibold text-fg mt-1.5 tabular-nums">
            {results.instances_per_server_tp || 0}
          </p>
        </div>
      </div>

      {/* ── Gateway Quotas ───────────────────────────────────────────── */}
      {showGateway && (
        <div className="bg-surface border border-border rounded-xl p-4 sm:p-5 shadow-card">
          <div className="flex items-baseline justify-between mb-3 gap-2">
            <h3 className="text-sm font-semibold text-fg flex items-center gap-1.5">
              <Gauge className="h-4 w-4 text-muted" strokeWidth={2.25} />
              {t("results.gateway.title")}
            </h3>
            <span className="text-[11px] text-muted truncate">
              {t("results.gateway.subtitle")}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <div className="bg-elevated border border-border rounded-lg py-2.5 px-3">
              <p className="flex items-center gap-1 text-[10px] uppercase font-semibold text-muted tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                <span>{t("results.gateway.peakRpm")}</span>
                <span className="ml-auto">
                  <InfoTooltip text={t("results.gateway.peakRpmTooltip")} align="left" />
                </span>
              </p>
              <p className="text-lg font-semibold text-fg mt-1 tabular-nums">
                {fmt(results.peak_rpm, 0)}
              </p>
              <p className="text-[10px] text-muted mt-0.5 tabular-nums">
                {t("results.gateway.sustained")} {fmt(results.sustained_rpm, 0)}
              </p>
            </div>
            <div className="bg-elevated border border-border rounded-lg py-2.5 px-3">
              <p className="flex items-center gap-1 text-[10px] uppercase font-semibold text-muted tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                <span>{t("results.gateway.peakTpm")}</span>
                <span className="ml-auto">
                  <InfoTooltip text={t("results.gateway.peakTpmTooltip")} />
                </span>
              </p>
              <p className="text-lg font-semibold text-fg mt-1 tabular-nums">
                {fmt(results.peak_tpm, 0)}
              </p>
              <p className="text-[10px] text-muted mt-0.5 tabular-nums">
                {t("results.gateway.sustained")} {fmt(results.sustained_tpm, 0)}
              </p>
            </div>
            <div className="bg-elevated border border-border rounded-lg py-2.5 px-3">
              <p className="flex items-center gap-1 text-[10px] uppercase font-semibold text-muted tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-info" aria-hidden />
                <span>{t("results.gateway.tpmSplit")}</span>
                <span className="ml-auto">
                  <InfoTooltip text={t("results.gateway.tpmSplitTooltip")} />
                </span>
              </p>
              <p className="text-sm font-semibold text-fg mt-1 tabular-nums">
                <span className="text-muted">{t("results.gateway.in")}</span> {fmt(results.peak_tpm_input, 0)}
              </p>
              <p className="text-[11px] text-muted tabular-nums">
                <span>{t("results.gateway.out")}</span> {fmt(results.peak_tpm_output, 0)}
              </p>
            </div>
            <div className="bg-elevated border border-border rounded-lg py-2.5 px-3">
              <p className="flex items-center gap-1 text-[10px] uppercase font-semibold text-muted tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />
                <span>{t("results.gateway.maxParallel")}</span>
                <span className="ml-auto">
                  <InfoTooltip text={t("results.gateway.maxParallelTooltip")} align="right" />
                </span>
              </p>
              <p className="text-lg font-semibold text-fg mt-1 tabular-nums">
                {fmt(results.max_parallel_requests, 0)}
              </p>
              <p className="text-[10px] text-muted mt-0.5">
                {t("results.gateway.concurrent")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── MIG feasibility hint (advisory) ──────────────────────────── */}
      <MigHintBadge
        gpuId={inputData?.gpu_id}
        modelMemGb={results.model_mem_gb}
        kvAtPeakGb={results.kv_per_session_gb}
        gpusPerInstance={results.gpus_per_instance_tp || results.gpus_per_instance}
        tpMultiplierZ={inputData?.tp_multiplier_Z}
        servers={results.servers_final}
        totalGpus={results.total_gpu_count}
      />

      {/* ── SLA Validation ───────────────────────────────────────────── */}
      {(results.ttft_analyt != null || results.e2e_latency_analyt != null) && (
        <div
          className="bg-surface border border-border rounded-xl p-4 sm:p-6 shadow-card"
          data-tour="sla-validation"
        >
          <div className="flex items-center justify-between mb-4 gap-2">
            <h3 className="text-lg font-semibold text-fg flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted" strokeWidth={2.25} />
              {t("results.sla.title")}
            </h3>
            <div className="flex items-center gap-2">
              {results.sla_passed !== true && (
                <div className="relative" ref={slaNotificationsRef}>
                  <button
                    ref={slaBellRef}
                    type="button"
                    onClick={() => {
                      setSlaNotificationsOpen((prev) => {
                        if (!prev && slaBellRef.current) {
                          const rect = slaBellRef.current.getBoundingClientRect();
                          setSlaDropdownPos({
                            top: rect.bottom + 8,
                            right: window.innerWidth - rect.right,
                          });
                        }
                        return !prev;
                      });
                    }}
                    className="relative p-1.5 rounded-lg hover:bg-elevated transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-warning"
                    title={t("results.sla.notifications.button")}
                  >
                    <Bell
                      className="h-5 w-5 text-muted bell-shake"
                      strokeWidth={2.25}
                    />
                    {results.sla_passed === false && results.sla_recommendations?.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">
                        {results.sla_recommendations.length}
                      </span>
                    )}
                  </button>
                  {slaNotificationsOpen && (
                    <div
                      className="fixed z-50 w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-surface shadow-elevated overflow-hidden"
                      style={
                        slaDropdownPos
                          ? {
                              top: slaDropdownPos.top,
                              right: Math.max(slaDropdownPos.right, 8),
                            }
                          : {}
                      }
                    >
                      <div className="px-4 py-3 bg-elevated border-b border-border">
                        <h4 className="text-sm font-semibold text-fg flex items-center gap-1.5">
                          <Bell className="h-3.5 w-3.5 text-muted" strokeWidth={2.25} />
                          {t("results.sla.notifications.title")}
                        </h4>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        {results.sla_recommendations?.length > 0 ? (
                          <ul className="p-4 space-y-2">
                            {results.sla_recommendations.map((rec, i) => (
                              <li
                                key={i}
                                className="text-sm text-fg flex items-start gap-2"
                              >
                                <AlertTriangle
                                  className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0"
                                  strokeWidth={2.25}
                                />
                                <span>{rec}</span>
                              </li>
                            ))}
                          </ul>
                        ) : results.sla_passed === true ? (
                          <div className="p-4 text-sm text-success flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                            {t("results.sla.passed.empty")}
                          </div>
                        ) : (
                          <div className="p-4 text-sm text-muted">{t("results.sla.empty")}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {results.sla_passed != null && (
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${
                    results.sla_passed
                      ? "bg-success-soft text-success"
                      : "bg-danger-soft text-danger"
                  }`}
                >
                  {results.sla_passed ? (
                    <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} />
                  ) : (
                    <XCircle className="h-4 w-4" strokeWidth={2.25} />
                  )}
                  {results.sla_passed
                    ? t("results.sla.passed.short")
                    : t("results.sla.failed.short")}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* TTFT */}
            <div
              className={`rounded-xl p-4 border ${
                results.ttft_sla_pass === true
                  ? "bg-success-soft border-success/30"
                  : results.ttft_sla_pass === false
                    ? "bg-danger-soft border-danger/30"
                    : "bg-elevated border-border"
              }`}
            >
              <h4 className="text-sm font-semibold text-fg mb-3 flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5 text-muted" strokeWidth={2.25} />
                <span>{t("results.sla.ttft.title")}</span>
                <InfoTooltip text={t("results.sla.ttft.tooltip")} />
              </h4>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted">{t("results.sla.calculated")}</span>
                  <span className="text-sm font-semibold tabular-nums text-fg">
                    {fmt(results.ttft_analyt, 2)} {t("results.sla.unit")}
                  </span>
                </div>
                {results.ttft_sla_target != null && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted">{t("results.sla.target")}</span>
                    <span className="text-sm font-semibold tabular-nums text-muted">
                      {fmt(results.ttft_sla_target, 2)} {t("results.sla.unit")}
                    </span>
                  </div>
                )}
                {results.ttft_sla_pass != null && (
                  <div
                    className={`text-center py-1.5 rounded-md text-xs font-semibold mt-2 inline-flex items-center justify-center gap-1.5 w-full ${
                      results.ttft_sla_pass
                        ? "bg-success/20 text-success"
                        : "bg-danger/20 text-danger"
                    }`}
                  >
                    {results.ttft_sla_pass ? (
                      <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" strokeWidth={2.5} />
                    )}
                    {results.ttft_sla_pass ? t("results.sla.pass") : t("results.sla.fail")}
                  </div>
                )}
              </div>
            </div>

            {/* e2e Latency */}
            <div
              className={`rounded-xl p-4 border ${
                results.e2e_latency_sla_pass === true
                  ? "bg-success-soft border-success/30"
                  : results.e2e_latency_sla_pass === false
                    ? "bg-danger-soft border-danger/30"
                    : "bg-elevated border-border"
              }`}
            >
              <h4 className="text-sm font-semibold text-fg mb-3 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted" strokeWidth={2.25} />
                <span>{t("results.sla.e2e.title")}</span>
                <InfoTooltip text={t("results.sla.e2e.tooltip")} align="right" />
              </h4>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted">{t("results.sla.calculated")}</span>
                  <span className="text-sm font-semibold tabular-nums text-fg">
                    {fmt(results.e2e_latency_analyt, 2)} {t("results.sla.unit")}
                  </span>
                </div>
                {results.e2e_latency_sla_target != null && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted">{t("results.sla.target")}</span>
                    <span className="text-sm font-semibold tabular-nums text-muted">
                      {fmt(results.e2e_latency_sla_target, 2)} {t("results.sla.unit")}
                    </span>
                  </div>
                )}
                {results.e2e_latency_sla_pass != null && (
                  <div
                    className={`text-center py-1.5 rounded-md text-xs font-semibold mt-2 inline-flex items-center justify-center gap-1.5 w-full ${
                      results.e2e_latency_sla_pass
                        ? "bg-success/20 text-success"
                        : "bg-danger/20 text-danger"
                    }`}
                  >
                    {results.e2e_latency_sla_pass ? (
                      <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" strokeWidth={2.5} />
                    )}
                    {results.e2e_latency_sla_pass
                      ? t("results.sla.pass")
                      : t("results.sla.fail")}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── GPU Memory donut ─────────────────────────────────────────── */}
      <div
        className="bg-surface border border-border rounded-xl p-4 sm:p-6 shadow-card"
        data-tour="donut-chart"
      >
        <h3 className="text-lg font-semibold text-fg mb-1 flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted" strokeWidth={2.25} />
          {t("results.memory.title")}
        </h3>
        <p className="text-sm text-muted mb-4 tabular-nums">
          {interp(t("results.memory.headerSubtitle"), {
            n: gpusInst,
            plural: gpusInst !== 1 ? "s" : "",
            gib: results.gpu_mem_gb || 0,
            total: fmt(totalMem, 1),
          })}
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

          {/* Legend */}
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
          </div>
        </div>
      </div>

      {/* ── Detailed results — tabbed ────────────────────────────────── */}
      <div
        className="bg-surface border border-border rounded-xl p-4 sm:p-6 shadow-card"
        data-tour="detail-toggle"
      >
        <div className="flex items-center justify-between mb-5 gap-2">
          <h3 className="text-lg font-semibold text-fg flex items-center gap-2">
            <Database className="h-4 w-4 text-muted" strokeWidth={2.25} />
            {t("results.detailed.title")}
          </h3>
          <div className="inline-flex rounded-lg bg-elevated border border-border p-0.5">
            <button
              type="button"
              onClick={() => setDetailTab("memory")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors duration-150 ${
                detailTab === "memory"
                  ? "bg-surface text-accent shadow-card"
                  : "text-muted hover:text-fg"
              }`}
            >
              <HardDrive className="h-3.5 w-3.5" strokeWidth={2.25} />
              {t("results.detailed.memoryPath")}
            </button>
            <button
              type="button"
              onClick={() => setDetailTab("compute")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors duration-150 ${
                detailTab === "compute"
                  ? "bg-surface text-success shadow-card"
                  : "text-muted hover:text-fg"
              }`}
            >
              <Zap className="h-3.5 w-3.5" strokeWidth={2.25} />
              {t("results.detailed.computePath")}
            </button>
          </div>
        </div>

        {/* Memory Path */}
        {detailTab === "memory" && (
          <div className="bg-elevated rounded-lg p-4 border-l-2 border-accent">
            <div>
              <StatRow
                label={t("results.detailed.tokensPerRequest")}
                value={fmt(results.T_tokens_per_request, 0)}
              />
              <StatRow
                label={t("results.detailed.sessionContext")}
                value={`${fmt(results.TS_session_context, 0)} ${t("results.detailed.tokensUnit")}`}
              />
              <StatRow
                label={t("results.detailed.sequenceLength")}
                value={`${fmt(results.SL_sequence_length, 0)} ${t("results.detailed.tokensUnit")}`}
              />
              <StatRow
                label={t("results.detailed.modelMem")}
                value={`${fmt(results.model_mem_gb)} GiB`}
              />
              <StatRow
                label={t("results.detailed.kvPerSession")}
                value={`${fmt(results.kv_per_session_gb, 4)} GiB`}
              />
              <StatRow
                label={t("results.detailed.freeKvInst")}
                value={`${fmt(results.kv_free_per_instance_gb)} GiB`}
              />
              <StatRow
                label={t("results.detailed.sessionsBaseTp")}
                value={results.S_TP_base || 0}
              />
              <StatRow
                label={t("results.detailed.sessionsZTp")}
                value={results.S_TP_z || 0}
              />
              <div className="flex justify-between items-center py-2">
                <span className="text-sm font-semibold text-fg">
                  {t("results.detailed.serversByMemory")}
                </span>
                <span className="text-sm font-semibold tabular-nums text-accent">
                  {results.servers_by_memory || 0}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Compute Path */}
        {detailTab === "compute" && (
          <div className="bg-elevated rounded-lg p-4 border-l-2 border-success">
            <div>
              <StatRow
                label={t("results.detailed.gpuTflops")}
                value={`${fmt(results.gpu_tflops_used)} TFLOPS`}
              />
              <StatRow
                label={t("results.detailed.fcountModel")}
                value={`${fmt(results.Fcount_model_tflops)} TFLOPS`}
              />
              <StatRow
                label={t("results.detailed.flopsPerToken")}
                value={fmt(results.FPS_flops_per_token)}
              />
              <StatRow
                label={t("results.detailed.decodeTokens")}
                value={`${fmt(results.Tdec_tokens, 0)} ${t("results.detailed.tokensUnit")}`}
              />
              <StatRow
                label={t("results.detailed.prefillThroughput")}
                value={`${fmt(results.th_prefill)} tok/s`}
              />
              <StatRow
                label={t("results.detailed.decodeThroughput")}
                value={`${fmt(results.th_decode)} tok/s`}
              />
              <StatRow
                label={t("results.detailed.cmodel")}
                value={fmt(results.Cmodel_rps, 4)}
              />
              <StatRow
                label={t("results.detailed.serverThroughput")}
                value={`${fmt(results.th_server_comp, 4)} req/s`}
              />
              <div className="flex justify-between items-center py-2">
                <span className="text-sm font-semibold text-fg">
                  {t("results.detailed.serversByCompute")}
                </span>
                <span className="text-sm font-semibold tabular-nums text-success">
                  {results.servers_by_compute || 0}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Download report ──────────────────────────────────────────── */}
      {inputData && (
        <button
          type="button"
          data-tour="download-report"
          onClick={handleDownloadReport}
          disabled={downloading}
          className={`mt-auto w-full py-3 px-4 rounded-xl font-semibold text-base transition-colors inline-flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
            downloading
              ? "bg-success/60 text-white cursor-not-allowed"
              : "bg-success text-white hover:brightness-110 download-btn-glow"
          }`}
        >
          {downloading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.25} />
              {t("results.report.generating")}
            </>
          ) : (
            <>
              <Download className="h-5 w-5" strokeWidth={2.25} />
              {t("results.report.download")}
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default ResultsDisplay;
