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
  Image as ImageIcon,
  Layers,
  Server,
  Sparkles,
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

const VLMResultsDisplay = ({ results, loading, error, inputData }) => {
  const t = useT();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-2 border-border border-t-accent mb-4" />
          <p className="text-muted">{t("vlm.loading")}</p>
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
        <h3 className="text-base font-semibold text-fg mb-1">{t("vlm.warning")}</h3>
        <p className="text-sm text-muted">{error}</p>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-elevated text-subtle mb-4">
          <ImageIcon className="h-6 w-6" strokeWidth={2} />
        </div>
        <h3 className="text-base font-semibold text-muted">{t("vlm.empty.title")}</h3>
        <p className="text-sm text-subtle">{t("vlm.empty.subtitle")}</p>
      </div>
    );
  }

  // Compute memory breakdown for the donut: model + KV(at peak) + reserved
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

  return (
    <div className="gap-6 flex flex-col flex-1">
      <h2 className="text-lg sm:text-2xl font-semibold text-fg">{t("vlm.title")}</h2>

      {/* ── 3 Hero Metric Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-tour="vlm-result-cards">
        {/* Card 1 — Infrastructure */}
        <div className="result-tile rounded-xl border border-border bg-surface p-4 sm:p-5 shadow-card flex flex-col sm:min-h-[170px]">
          <div className="flex items-center gap-2 text-muted">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">
              <Server className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider">
              {t("vlm.infraRequired")}
            </h3>
          </div>
          <div className="flex flex-wrap items-end justify-center gap-x-4 gap-y-1 mt-auto mb-auto pt-2">
            <div className="text-center">
              <p
                className="text-3xl sm:text-4xl font-extrabold leading-none tabular-nums whitespace-nowrap text-fg"
                title={String(results.n_servers_vlm_online || 0)}
              >
                {fmt(results.n_servers_vlm_online, 0)}
              </p>
              <p className="text-[10px] sm:text-xs text-muted mt-1 uppercase tracking-wide">
                {t("vlm.servers")}
              </p>
            </div>
            <div className="text-2xl text-subtle leading-none -mt-3" aria-hidden="true">
              ·
            </div>
            <div className="text-center">
              <p
                className="text-3xl sm:text-4xl font-extrabold leading-none tabular-nums whitespace-nowrap text-fg"
                title={String(results.n_gpu_vlm_online || 0)}
              >
                {fmt(results.n_gpu_vlm_online, 0)}
              </p>
              <p className="text-[10px] sm:text-xs text-muted mt-1 uppercase tracking-wide">
                {t("vlm.gpus")}
              </p>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-2">
            {fmtTemplate(t("vlm.replicasSubtitle"), {
              count: results.n_repl_vlm || 0,
              gpus: results.gpus_per_server || 0,
            })}
          </p>
        </div>

        {/* Card 2 — SLA pass/fail */}
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
              {t("vlm.slaPerPage")}
            </h3>
          </div>
          <p
            className={`text-4xl sm:text-5xl font-extrabold leading-none mt-auto mb-auto tabular-nums ${
              slaPass ? "text-success" : "text-danger"
            }`}
          >
            {slaPass ? t("vlm.slaPass") : t("vlm.slaFail")}
          </p>
          <p className="text-xs sm:text-sm text-muted mt-2">
            {fmtTemplate(t("vlm.slaDetail"), {
              actual: fmt(results.t_page_vlm, 2),
              target: fmt(results.sla_page_target, 2),
            })}
          </p>
        </div>

        {/* Card 3 — Throughput */}
        <div className="result-tile rounded-xl border border-border bg-surface p-4 sm:p-5 shadow-card flex flex-col sm:min-h-[170px]">
          <div className="flex items-center gap-2 text-muted">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-warning-soft text-warning">
              <Zap className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider">
              {t("vlm.throughput")}
            </h3>
          </div>
          <p className="text-3xl sm:text-4xl font-extrabold mt-auto mb-auto tabular-nums text-fg leading-none">
            {fmt(results.th_pf_vlm, 0)}
            <span className="text-sm font-semibold text-muted ml-1">
              {t("vlm.throughputUnit")}
            </span>
          </p>
          <p className="text-xs sm:text-sm text-muted mt-2">
            {fmtTemplate(t("vlm.decode"), { value: fmt(results.th_dec_vlm, 0) })}
          </p>
        </div>
      </div>

      {/* ── Secondary tiles ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <SecondaryTile
          icon={<Layers className="h-3.5 w-3.5" strokeWidth={2.25} />}
          tone="accent"
          label={t("vlm.bsRealStar")}
          value={results.bs_real_star || 0}
        />
        <SecondaryTile
          icon={<Cpu className="h-3.5 w-3.5" strokeWidth={2.25} />}
          tone="success"
          label={t("vlm.replicas")}
          value={results.n_repl_vlm || 0}
        />
        <SecondaryTile
          icon={<ImageIcon className="h-3.5 w-3.5" strokeWidth={2.25} />}
          tone="info"
          label={t("vlm.visualTokens")}
          value={fmt(results.v_tok, 0)}
        />
        <SecondaryTile
          icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} />}
          tone="warning"
          label={t("vlm.prefillLength")}
          value={fmt(results.sl_pf_vlm, 0)}
        />
      </div>

      {/* ── Gateway Quotas ── */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-sm font-semibold text-fg">{t("vlm.gatewayQuotas")}</h3>
          <span className="text-[11px] text-muted">{t("vlm.gatewaySubtitle")}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuotaCell
            tone="accent"
            label={t("vlm.peakRpm")}
            value={fmt(results.peak_rpm, 0)}
            sub={fmtTemplate(t("vlm.peakRpmSub"), {
              value: fmt(results.sustained_rpm, 0),
            })}
          />
          <QuotaCell
            tone="success"
            label={t("vlm.peakTpm")}
            value={fmt(results.peak_tpm, 0)}
            sub={fmtTemplate(t("vlm.peakTpmSub"), {
              value: fmt(results.sustained_tpm, 0),
            })}
          />
          <QuotaCell
            tone="info"
            label={t("vlm.tpmSplit")}
            valueSize="sm"
            value={`in ${fmt(results.peak_tpm_input, 0)}`}
            sub={`out ${fmt(results.peak_tpm_output, 0)}`}
          />
          <QuotaCell
            tone="warning"
            label={t("vlm.maxParallel")}
            value={fmt(results.max_parallel_requests, 0)}
            sub={t("vlm.concurrentPages")}
          />
        </div>
      </div>

      {/* ── MIG feasibility hint (advisory) ── */}
      <MigHintBadge
        gpuId={inputData?.gpu_id}
        modelMemGb={results.model_mem_gb}
        kvAtPeakGb={results.kv_per_session_gb}
        gpusPerInstance={results.gpus_per_instance}
        tpMultiplierZ={inputData?.tp_multiplier_Z}
        servers={results.n_servers_vlm_online}
        totalGpus={results.n_gpu_vlm_online}
      />

      {/* ── Memory Breakdown Donut ── */}
      <div
        className="rounded-xl border border-border bg-surface p-5 shadow-card"
        data-tour="vlm-donut-chart"
      >
        <h3 className="text-sm font-semibold text-fg mb-4 uppercase tracking-wider">
          {t("vlm.memoryTitle")}
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
              {fmtTemplate(t("vlm.memTotalLine"), {
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
            {t("vlm.diagnostics")}
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <Stat label={t("vlm.diag.gpusPerInstance")} value={results.gpus_per_instance} />
          <Stat label={t("vlm.diag.sTpZ")} value={results.s_tp_z} />
          <Stat
            label={t("vlm.diag.instanceMem")}
            value={`${fmt(results.instance_total_mem_gb, 1)} GB`}
          />
          <Stat label={t("vlm.diag.gpuTflops")} value={results.gpu_tflops_used} />
          <Stat label={t("vlm.diag.slPfEff")} value={fmt(results.sl_pf_vlm_eff, 0)} />
          <Stat label={t("vlm.diag.slDec")} value={results.sl_dec_vlm} />
          <Stat
            label={t("vlm.diag.kvPerPage")}
            value={`${fmt(results.kv_per_session_gb, 2)} GB`}
          />
          <Stat
            label={t("vlm.diag.modelWeights")}
            value={`${fmt(results.model_mem_gb, 1)} GB`}
          />
          <Stat
            label={t("vlm.diag.slaTarget")}
            value={`${fmt(results.sla_page_target, 2)} s`}
          />
        </div>
      </div>
    </div>
  );
};

const TONE_CLASSES = {
  accent: { bg: "bg-accent-soft", text: "text-accent" },
  success: { bg: "bg-success-soft", text: "text-success" },
  info: { bg: "bg-info-soft", text: "text-info" },
  warning: { bg: "bg-warning-soft", text: "text-warning" },
  danger: { bg: "bg-danger-soft", text: "text-danger" },
};

const SecondaryTile = ({ icon, tone = "accent", label, value }) => {
  const tc = TONE_CLASSES[tone] || TONE_CLASSES.accent;
  return (
    <div className="rounded-lg border border-border bg-surface p-3 sm:p-4 shadow-card">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${tc.bg} ${tc.text}`}
        >
          {icon}
        </span>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          {label}
        </h3>
      </div>
      <p className="text-xl sm:text-2xl font-bold mt-2 text-fg tabular-nums">{value}</p>
    </div>
  );
};

const QuotaCell = ({ tone = "accent", label, value, sub, valueSize = "lg" }) => {
  const tc = TONE_CLASSES[tone] || TONE_CLASSES.accent;
  return (
    <div className={`rounded-md ${tc.bg} px-3 py-2.5`}>
      <p
        className={`text-[10px] uppercase font-semibold tracking-wider ${tc.text}`}
      >
        {label}
      </p>
      <p
        className={`${
          valueSize === "sm" ? "text-sm" : "text-lg"
        } font-bold text-fg mt-1 tabular-nums`}
      >
        {value}
      </p>
      {sub && <p className={`text-[10px] mt-0.5 ${tc.text} opacity-90`}>{sub}</p>}
    </div>
  );
};

const Stat = ({ label, value }) => (
  <div className="flex flex-col">
    <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
    <span className="text-sm font-mono text-fg mt-0.5 tabular-nums">{value ?? "—"}</span>
  </div>
);

export default VLMResultsDisplay;
