// MIG profile catalog for the frontend feasibility hint (P12e).
//
// Data source: docs/mig-feasibility.md (NVIDIA datasheets / MIG User Guide).
// This module is advisory only — full MIG-aware sizing requires a backend
// extension and is documented as Phase 2 in the same doc.
//
// gpuIds match the `id` field in `backend/gpu_data.json`.

export type MigProfile = {
  /** Profile name as NVIDIA writes it (e.g. "1g.10gb"). */
  name: string;
  /** Compute slices the profile occupies (1..maxG). */
  computeG: number;
  /** Memory cap of the slice in GiB. */
  memGb: number;
};

export type MigCapability = {
  gpuIds: string[];
  /** Maximum slice count per physical GPU (7 for most; 4 for A30). */
  maxG: number;
  profiles: MigProfile[];
};

export const MIG_CAPABILITIES: MigCapability[] = [
  {
    gpuIds: ["nvidia-a100-gpu-accelerator-pcie-card"],
    maxG: 7,
    profiles: [
      { name: "1g.10gb", computeG: 1, memGb: 10 },
      { name: "2g.20gb", computeG: 2, memGb: 20 },
      { name: "3g.40gb", computeG: 3, memGb: 40 },
      { name: "4g.40gb", computeG: 4, memGb: 40 },
      { name: "7g.80gb", computeG: 7, memGb: 80 },
    ],
  },
  {
    gpuIds: ["nvidia-a30-gpu-accelerator-pcie-card"],
    maxG: 4,
    profiles: [
      { name: "1g.6gb", computeG: 1, memGb: 6 },
      { name: "2g.12gb", computeG: 2, memGb: 12 },
      { name: "4g.24gb", computeG: 4, memGb: 24 },
    ],
  },
  {
    gpuIds: [
      "nvidia-h100-gpu-accelerator-pcie-card",
      "nvidia-h100-gpu-accelerator-sxm-card",
    ],
    maxG: 7,
    profiles: [
      { name: "1g.10gb", computeG: 1, memGb: 10 },
      { name: "1g.20gb", computeG: 1, memGb: 20 },
      { name: "2g.20gb", computeG: 2, memGb: 20 },
      { name: "3g.40gb", computeG: 3, memGb: 40 },
      { name: "4g.40gb", computeG: 4, memGb: 40 },
      { name: "7g.80gb", computeG: 7, memGb: 80 },
    ],
  },
  {
    gpuIds: [
      "nvidia-h200-gpu-accelerator-pcie-card",
      "nvidia-h200-gpu-accelerator-sxm-card",
      "nvidia-gh200-grace-hopper-superchip-144gb",
    ],
    maxG: 7,
    profiles: [
      { name: "1g.18gb", computeG: 1, memGb: 18 },
      { name: "1g.35gb", computeG: 1, memGb: 35 },
      { name: "2g.35gb", computeG: 2, memGb: 35 },
      { name: "3g.71gb", computeG: 3, memGb: 71 },
      { name: "4g.71gb", computeG: 4, memGb: 71 },
      { name: "7g.141gb", computeG: 7, memGb: 141 },
    ],
  },
  {
    gpuIds: [
      "nvidia-b200-gpu-accelerator-pcie-card",
      "nvidia-b200-gpu-accelerator-sxm-card",
    ],
    maxG: 7,
    profiles: [
      { name: "1g.23gb", computeG: 1, memGb: 23 },
      { name: "1g.45gb", computeG: 1, memGb: 45 },
      { name: "2g.45gb", computeG: 2, memGb: 45 },
      { name: "3g.90gb", computeG: 3, memGb: 90 },
      { name: "4g.90gb", computeG: 4, memGb: 90 },
      { name: "7g.180gb", computeG: 7, memGb: 180 },
    ],
  },
  {
    gpuIds: ["nvidia-b300-gpu-accelerator-sxm-card"],
    maxG: 7,
    profiles: [
      { name: "1g.36gb", computeG: 1, memGb: 36 },
      { name: "1g.72gb", computeG: 1, memGb: 72 },
      { name: "2g.72gb", computeG: 2, memGb: 72 },
      { name: "3g.144gb", computeG: 3, memGb: 144 },
      { name: "4g.144gb", computeG: 4, memGb: 144 },
      { name: "7g.288gb", computeG: 7, memGb: 288 },
    ],
  },
];

export type FittingSlice = {
  capability: MigCapability;
  slice: MigProfile;
  /** How many model instances pack onto one physical GPU at this slice size. */
  instancesPerGpu: number;
};

export function findCapability(gpuId: string | undefined | null): MigCapability | null {
  if (!gpuId) return null;
  return MIG_CAPABILITIES.find((c) => c.gpuIds.includes(gpuId)) || null;
}

/**
 * Find the smallest MIG slice on `gpuId` whose memory cap fits a per-instance
 * memory footprint of `perInstanceMemGb`. Returns `null` if the GPU is not
 * MIG-capable, no slice fits, or the model already uses the full GPU.
 */
export function findFittingSlice(
  gpuId: string | undefined | null,
  perInstanceMemGb: number,
): FittingSlice | null {
  const capability = findCapability(gpuId);
  if (!capability || !(perInstanceMemGb > 0)) return null;

  // Profiles sorted by memory ascending; pick the first that fits.
  const ordered = [...capability.profiles].sort((a, b) => a.memGb - b.memGb);
  const slice = ordered.find((p) => p.memGb >= perInstanceMemGb);
  if (!slice) return null;

  // If the smallest fitting slice IS the whole GPU (computeG === maxG),
  // there's no density gain — the hint isn't useful.
  if (slice.computeG >= capability.maxG) return null;

  const instancesPerGpu = Math.floor(capability.maxG / slice.computeG);
  return { capability, slice, instancesPerGpu };
}
