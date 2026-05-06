import React from "react";
import { findFittingSlice } from "../../data/migProfiles";

/**
 * Frontend-only MIG feasibility hint (Phase 1 per docs/mig-feasibility.md).
 *
 * Renders a yellow advisory tile when:
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
  // MIG sizing requires single-slice instances (no NVLink across slices)
  if ((tpMultiplierZ ?? 1) !== 1) return null;
  if ((gpusPerInstance ?? 1) !== 1) return null;

  const perInstanceMem = (modelMemGb || 0) + (kvAtPeakGb || 0) + safeMarginGb;
  const fit = findFittingSlice(gpuId, perInstanceMem);
  if (!fit) return null;

  const { capability, slice, instancesPerGpu } = fit;
  const estimatedPhysicalGpus =
    totalGpus && instancesPerGpu > 0 ? Math.ceil(totalGpus / instancesPerGpu) : null;

  return (
    <div
      className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 text-sm text-yellow-900"
      data-testid="mig-hint-badge"
    >
      <div className="flex items-start gap-3">
        <svg
          className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M12 21a9 9 0 110-18 9 9 0 010 18z"
          />
        </svg>
        <div className="flex-1">
          <p className="font-semibold mb-1">
            Tip — fits on a {slice.name} MIG slice
          </p>
          <p className="text-yellow-800 leading-relaxed">
            This config needs ~{perInstanceMem.toFixed(1)} GB per instance.
            On this GPU you can partition each card into{" "}
            <span className="font-mono font-semibold">{instancesPerGpu}× {slice.name}</span>{" "}
            slices, lifting density from <span className="font-semibold">1</span> →{" "}
            <span className="font-semibold">{instancesPerGpu}</span> instances per physical GPU
            {estimatedPhysicalGpus != null && servers != null
              ? `. Estimated physical GPUs: ${estimatedPhysicalGpus} (vs ${totalGpus} as whole-GPU instances).`
              : "."}
          </p>
          <p className="text-xs text-yellow-700 mt-2 italic">
            Estimate only — backend MIG-aware sizing (compute throughput at slice fraction) is
            not yet implemented. Use this as a capacity-planning hint against existing
            infrastructure. Max {capability.maxG} slices per physical GPU.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MigHintBadge;
