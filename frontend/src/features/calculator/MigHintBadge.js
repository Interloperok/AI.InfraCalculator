import React from "react";
import { Layers } from "lucide-react";
import { findFittingSlice } from "../../data/migProfiles";
import { useT } from "../../contexts/I18nContext";

const fmtTemplate = (str, params) =>
  str.replace(/\{(\w+)\}/g, (_, key) =>
    params[key] === undefined || params[key] === null ? "" : String(params[key]),
  );

/**
 * Frontend-only MIG feasibility hint (Phase 1 per docs/mig-feasibility.md).
 *
 * Renders an info advisory tile when:
 *   - the selected GPU is MIG-capable
 *   - tp_multiplier_Z === 1 and gpus_per_instance === 1 (MIG slices are isolated)
 *   - per-instance memory (model + KV(at peak BS) + safe margin) fits in some slice
 *
 * The hint is advisory only — full MIG-aware sizing is a backend phase.
 */
const MigHintBadge = ({
  gpuId,
  modelMemGb,
  kvAtPeakGb,
  safeMarginGb = 5,
  gpusPerInstance,
  tpMultiplierZ,
  servers,
  totalGpus,
}) => {
  const t = useT();

  // MIG sizing requires single-slice instances (no NVLink across slices)
  if ((tpMultiplierZ ?? 1) !== 1) return null;
  if ((gpusPerInstance ?? 1) !== 1) return null;

  const perInstanceMem = (modelMemGb || 0) + (kvAtPeakGb || 0) + safeMarginGb;
  const fit = findFittingSlice(gpuId, perInstanceMem);
  if (!fit) return null;

  const { capability, slice, instancesPerGpu } = fit;
  const estimatedPhysicalGpus =
    totalGpus && instancesPerGpu > 0 ? Math.ceil(totalGpus / instancesPerGpu) : null;

  const title = fmtTemplate(t("mig.tipFits"), { slice: slice.name });
  const tail =
    estimatedPhysicalGpus != null && servers != null
      ? fmtTemplate(t("mig.bodyTail"), { est: estimatedPhysicalGpus, total: totalGpus })
      : t("mig.bodyTailEnd");
  const body = fmtTemplate(t("mig.body"), {
    mem: perInstanceMem.toFixed(1),
    n: instancesPerGpu,
    slice: slice.name,
    tail,
  });
  const footer = fmtTemplate(t("mig.estimateOnly"), { max: capability.maxG });

  return (
    <div
      className="rounded-lg border border-info/30 bg-info-soft/60 p-4 text-sm text-fg"
      data-testid="mig-hint-badge"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-info-soft text-info">
          <Layers className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-fg mb-1">{title}</p>
          <p className="text-muted leading-relaxed">{body}</p>
          <p className="text-xs text-subtle mt-2 italic">{footer}</p>
        </div>
      </div>
    </div>
  );
};

export default MigHintBadge;
