import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  FileText,
  Layers,
  Server,
  XCircle,
  Zap,
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

const OCRResultsDisplay = ({ results, loading, error, inputData }) => {
  const t = useT();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-2 border-border border-t-accent mb-4" />
          <p className="text-muted">{t("ocr.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl border border-warning/30 bg-warning-soft/60 p-6 text-center"
        role="alert"
      >
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-warning-soft text-warning mb-2">
          <AlertTriangle className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <h3 className="text-base font-semibold text-fg mb-1">{t("ocr.warning")}</h3>
        <p className="text-sm text-muted">{error}</p>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-elevated text-subtle mb-4">
          <FileText className="h-6 w-6" strokeWidth={2} />
        </div>
        <h3 className="text-base font-semibold text-muted">{t("ocr.empty.title")}</h3>
        <p className="text-sm text-subtle">{t("ocr.empty.subtitle")}</p>
      </div>
    );
  }

  // LLM-stage memory breakdown
  const totalMem = results.instance_total_mem_gb || 0;
  const modelMem = results.model_mem_gb || 0;
  const kvAtPeak = (results.kv_per_session_gb || 0) * (results.bs_real_star || 0);
  const overhead = Math.max(0, totalMem - modelMem - kvAtPeak);

  const memBreakdown = [
    { name: t("ocr.memModel"), value: Math.round(modelMem * 100) / 100 },
    { name: t("ocr.memKv"), value: Math.round(kvAtPeak * 100) / 100 },
    ...(overhead > 0.01
      ? [{ name: t("ocr.memReserved"), value: Math.round(overhead * 100) / 100 }]
      : []),
  ];
  const DONUT_COLORS = ["#6366f1", "#10b981", "#94a3b8"];

  const slaPass = results.sla_pass;
  const isCpuPipeline = results.pipeline_used === "ocr_cpu";

  // Pool subtitle: "OCR pool: X · LLM pool: Y" + optional " · OCR on CPU"
  const poolSubtitle = isCpuPipeline
    ? fmtTemplate(t("ocr.poolSubtitle"), {
        ocr: results.n_gpu_ocr_online || 0,
        llm: results.n_gpu_llm_online || 0,
      }) + " · " + t("ocr.poolSubtitleCpu")
    : fmtTemplate(t("ocr.poolSubtitle"), {
        ocr: results.n_gpu_ocr_online || 0,
        llm: results.n_gpu_llm_online || 0,
      });

  return (
    <div className="gap-6 flex flex-col flex-1">
      <h2 className="text-lg sm:text-2xl font-semibold text-fg">{t("ocr.title")}</h2>

      {/* ── 3 Hero Metric Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-tour="ocr-result-cards">
        {/* Card 1 — Infrastructure */}
        <div className="result-tile rounded-xl border border-border bg-surface p-4 sm:p-5 shadow-card flex flex-col sm:min-h-[170px]">
          <div className="flex items-center gap-2 text-muted">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">
              <Server className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider">
              {t("ocr.infraRequired")}
            </h3>
          </div>
          <div className="flex flex-wrap items-end justify-center gap-x-4 gap-y-1 mt-auto mb-auto pt-2">
            <div className="text-center">
              <p
                className="text-3xl sm:text-4xl font-extrabold leading-none tabular-nums whitespace-nowrap text-fg"
                title={String(results.n_servers_total_online || 0)}
              >
                {fmt(results.n_servers_total_online, 0)}
              </p>
              <p className="text-[10px] sm:text-xs text-muted mt-1 uppercase tracking-wide">
                {t("ocr.servers")}
              </p>
            </div>
            <div className="text-2xl text-subtle leading-none -mt-3" aria-hidden="true">
              ·
            </div>
            <div className="text-center">
              <p
                className="text-3xl sm:text-4xl font-extrabold leading-none tabular-nums whitespace-nowrap text-fg"
                title={String(results.n_gpu_total_online || 0)}
              >
                {fmt(results.n_gpu_total_online, 0)}
              </p>
              <p className="text-[10px] sm:text-xs text-muted mt-1 uppercase tracking-wide">
                {t("ocr.gpus")}
              </p>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-2">{poolSubtitle}</p>
        </div>

        {/* Card 2 — SLA */}
        <div className="result-tile rounded-xl border border-border bg-surface p-4 sm:p-5 shadow-card flex flex-col sm:min-h-[170px]">
          <div className="flex items-center gap-2 text-muted">
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${
                slaPass
                  ? "bg-success-soft text-success"
                  : "bg-danger-soft text-danger"
              }`}
            >
              {slaPass ? (
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.25} />
              ) : (
                <XCircle className="h-3.5 w-3.5" strokeWidth={2.25} />
              )}
            </span>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider">
              {t("ocr.slaPerPage")}
            </h3>
          </div>
          <p
            className={`text-4xl sm:text-5xl font-extrabold leading-none mt-auto mb-auto tabular-nums ${
              slaPass ? "text-success" : "text-danger"
            }`}
          >
            {slaPass ? t("ocr.slaPass") : t("ocr.slaFail")}
          </p>
          <p className="text-xs sm:text-sm text-muted mt-2">
            {fmtTemplate(t("ocr.slaDetail"), {
              tOcr: fmt(results.t_ocr, 2),
              tLlm: fmt(results.t_llm_target, 2),
              target: fmt(results.sla_page_target, 2),
            })}
          </p>
        </div>

        {/* Card 3 — LLM throughput */}
        <div className="result-tile rounded-xl border border-border bg-surface p-4 sm:p-5 shadow-card flex flex-col sm:min-h-[170px]">
          <div className="flex items-center gap-2 text-muted">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-warning-soft text-warning">
              <Zap className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider">
              {t("ocr.throughput")}
            </h3>
          </div>
          <p className="text-3xl sm:text-4xl font-extrabold mt-auto mb-auto tabular-nums text-fg leading-none">
            {fmt(results.th_pf_llm, 0)}
            <span className="text-sm font-semibold text-muted ml-1">
              {t("ocr.throughputUnit")}
            </span>
          </p>
          <p className="text-xs sm:text-sm text-muted mt-2">
            {fmtTemplate(t("ocr.decode"), { value: fmt(results.th_dec_llm, 0) })}
          </p>
        </div>
      </div>

      {/* ── Pool breakdown ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <SecondaryTile
          icon={<FileText className="h-3.5 w-3.5" strokeWidth={2.25} />}
          tone="danger"
          label={t("ocr.ocrPool")}
          value={isCpuPipeline ? t("ocr.cpu") : results.n_gpu_ocr_online || 0}
          sub={
            isCpuPipeline
              ? fmtTemplate(t("ocr.coresLine"), { count: results.n_ocr_cores_used || 0 })
              : t("ocr.gpus.label")
          }
        />
        <SecondaryTile
          icon={<Server className="h-3.5 w-3.5" strokeWidth={2.25} />}
          tone="accent"
          label={t("ocr.llmPool")}
          value={results.n_gpu_llm_online || 0}
          sub={t("ocr.gpus.label")}
        />
        <SecondaryTile
          icon={<Layers className="h-3.5 w-3.5" strokeWidth={2.25} />}
          tone="success"
          label={t("ocr.bsRealStar")}
          value={results.bs_real_star || 0}
        />
        <SecondaryTile
          icon={<Cpu className="h-3.5 w-3.5" strokeWidth={2.25} />}
          tone="info"
          label={t("ocr.replicas")}
          value={results.n_repl_llm || 0}
        />
      </div>

      {/* ── Gateway Quotas (two-pool: OCR + LLM) ── */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-sm font-semibold text-fg">{t("ocr.gatewayQuotas")}</h3>
          <span className="text-[11px] text-muted">{t("ocr.gatewaySubtitle")}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuotaCell
            tone="danger"
            label={t("ocr.ocrPeakRpm")}
            value={isCpuPipeline ? "—" : fmt(results.ocr_peak_rpm, 0)}
            sub={isCpuPipeline ? t("ocr.ocrPeakRpmCpu") : t("ocr.ocrPeakRpmSub")}
            tooltip={t("results.gateway.ocrPeakRpmTooltip")}
          />
          <QuotaCell
            tone="accent"
            label={t("ocr.llmPeakRpm")}
            value={fmt(results.llm_peak_rpm, 0)}
            sub={fmtTemplate(t("ocr.llmPeakRpmSub"), {
              value: fmt(results.llm_sustained_rpm, 0),
            })}
            tooltip={t("results.gateway.llmPeakRpmTooltip")}
          />
          <QuotaCell
            tone="success"
            label={t("ocr.llmPeakTpm")}
            value={fmt(results.llm_peak_tpm, 0)}
            sub={fmtTemplate(t("ocr.llmPeakTpmSub"), {
              input: fmt(results.llm_peak_tpm_input, 0),
              output: fmt(results.llm_peak_tpm_output, 0),
            })}
            tooltip={t("results.gateway.llmPeakTpmTooltip")}
          />
          <QuotaCell
            tone="warning"
            label={t("ocr.maxParallel")}
            value={fmt(results.max_parallel_requests, 0)}
            sub={t("ocr.concurrentPages")}
            tooltip={t("results.gateway.maxParallelTooltip")}
          />
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
      <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
        <h3 className="text-sm font-semibold text-fg mb-4 uppercase tracking-wider">
          {t("ocr.memoryTitle")}
        </h3>
        <div className="flex flex-col sm:flex-row items-center gap-6">
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
                  stroke="none"
                >
                  {memBreakdown.map((_, i) => (
                    <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(value, name) => [`${value} GB`, name]}
                  contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 min-w-0 space-y-2 w-full">
            {memBreakdown.map((entry, i) => (
              <div key={entry.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
                  />
                  <span className="text-muted">{entry.name}</span>
                </span>
                <span className="font-mono text-fg">{entry.value} GB</span>
              </div>
            ))}
            <div className="text-xs text-subtle pt-2 border-t border-border">
              {fmtTemplate(t("ocr.memTotalLine"), {
                total: fmt(totalMem, 1),
                kv: fmt(kvAtPeak, 1),
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Diagnostics ── */}
      <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-accent-soft text-accent">
            <Clock className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <h3 className="text-sm font-semibold text-fg uppercase tracking-wider">
            {t("ocr.diagnostics")}
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <Stat label={t("ocr.diag.pipeline")} value={results.pipeline_used || "—"} />
          <Stat label={t("ocr.diag.tOcr")} value={`${fmt(results.t_ocr, 2)} s`} />
          <Stat label={t("ocr.diag.llmBudget")} value={`${fmt(results.t_llm_target, 2)} s`} />
          <Stat label={t("ocr.diag.lText")} value={`${fmt(results.l_text, 0)} tok`} />
          <Stat label={t("ocr.diag.slPfEff")} value={fmt(results.sl_pf_llm_eff, 0)} />
          <Stat label={t("ocr.diag.slDec")} value={results.sl_dec_llm} />
          <Stat label={t("ocr.diag.gpusPerInstance")} value={results.gpus_per_instance} />
          <Stat label={t("ocr.diag.sessionsPerInstance")} value={results.s_tp_z} />
          <Stat
            label={t("ocr.diag.kvPerSession")}
            value={`${fmt(results.kv_per_session_gb, 2)} GB`}
          />
          <Stat
            label={t("ocr.diag.modelWeights")}
            value={`${fmt(results.model_mem_gb, 1)} GB`}
          />
          <Stat label={t("ocr.diag.gpuTflops")} value={results.gpu_tflops_used} />
          <Stat label={t("ocr.diag.handoff")} value={`${fmt(results.t_handoff_used, 2)} s`} />
        </div>
      </div>
    </div>
  );
};

const TONE_DOTS = {
  accent: "bg-accent",
  success: "bg-success",
  info: "bg-info",
  warning: "bg-warning",
  danger: "bg-danger",
};

const TONE_ICON_BG = {
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

const SecondaryTile = ({ icon, tone = "accent", label, value, sub }) => {
  const iconClass = TONE_ICON_BG[tone] || TONE_ICON_BG.accent;
  return (
    <div className="rounded-lg border border-border bg-surface p-3 sm:p-4 shadow-card">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${iconClass}`}
        >
          {icon}
        </span>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          {label}
        </h3>
      </div>
      <p className="text-xl sm:text-2xl font-bold mt-2 text-fg tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
};

const QuotaCell = ({ tone = "accent", label, value, sub, tooltip }) => {
  const dot = TONE_DOTS[tone] || TONE_DOTS.accent;
  return (
    <div
      className="rounded-lg border border-border bg-elevated px-3 py-2.5"
      title={tooltip}
    >
      <p className="flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider text-muted">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
        {label}
      </p>
      <p className="text-lg font-semibold text-fg mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-[10px] mt-0.5 text-muted">{sub}</p>}
    </div>
  );
};

const Stat = ({ label, value }) => (
  <div className="flex flex-col">
    <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
    <span className="text-sm font-mono text-fg mt-0.5 tabular-nums">{value ?? "—"}</span>
  </div>
);

export default OCRResultsDisplay;
