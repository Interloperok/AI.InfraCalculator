# MIG (Multi-Instance GPU) — feasibility & integration plan

## Status

- Use case: customers want to plan against **existing** infrastructure, including partitioned data-center GPUs. A 7B FP16 model + KV cache often fits on a `1g.10gb` MIG slice — sizing the whole physical GPU overstates demand by 7×.
- Catalog state today: `backend/gpu_data.json` has zero MIG fields.
- Scope of this doc: per-GPU MIG profile data, sizing constraints, and a two-phase rollout (frontend hint first, then full backend integration).

## 1. MIG profile data (per GPU)

NVIDIA MIG is supported on a subset of data-center GPUs. AMD/Intel use different partitioning models that this doc does not cover.

| GPU                       | MIG | Max instances | Slice profiles (compute / memory)                                                  |
| ------------------------- | --- | ------------- | ---------------------------------------------------------------------------------- |
| A100 PCIe/SXM 40GB        | yes | 7             | 1g.5gb, 2g.10gb, 3g.20gb, 4g.20gb, 7g.40gb                                         |
| A100 PCIe/SXM 80GB        | yes | 7             | 1g.10gb, 2g.20gb, 3g.40gb, 4g.40gb, 7g.80gb                                        |
| A30 24GB                  | yes | 4             | 1g.6gb, 2g.12gb, 4g.24gb                                                           |
| H100 PCIe/SXM 80GB        | yes | 7             | 1g.10gb, 1g.20gb, 2g.20gb, 3g.40gb, 4g.40gb, 7g.80gb                               |
| H100 NVL 94GB             | yes | 7             | 1g.12gb, 1g.24gb, 2g.24gb, 3g.47gb, 4g.47gb, 7g.94gb                               |
| H200 SXM/NVL 141GB        | yes | 7             | 1g.18gb, 1g.35gb, 2g.35gb, 3g.71gb, 4g.71gb, 7g.141gb                              |
| B200 SXM 192GB            | yes | 7             | 1g.23gb, 1g.45gb, 2g.45gb, 3g.90gb, 4g.90gb, 7g.180gb (Blackwell datasheet)        |
| B200 PCIe 180GB           | yes | 7             | scaled to 180GB                                                                    |
| B300 SXM 288GB            | yes | 7             | scaled to 288GB                                                                    |
| GH200 144GB               | yes | 7             | same as H200 141GB                                                                 |
| RTX PRO 6000 Blackwell    | no  | —             | not a data-center MIG SKU                                                          |
| RTX 5090 / 4090 / 3090    | no  | —             | consumer; MIG hardware path absent                                                 |
| AMD MI300X / MI300A       | no  | —             | uses CU-level partitioning, not MIG-equivalent                                     |

**Compute fraction per slice**: a `Ng.Mgb` slice gets `N/7` of the GPU's SMs (or `N/4` on A30). So `gpu_tflops_effective = gpu_tflops × N / 7`.

**Memory cap per slice**: the `Mgb` portion of the profile name. Slices have NVLink-isolated HBM regions; you cannot pool memory across slices on the same physical GPU.

**Profile combinations on one GPU**: not arbitrary — MIG enforces fixed slice geometries (e.g. on A100 80GB you can pick `7×1g.10gb` OR `3×1g.10gb + 1×4g.40gb` OR `1×7g.80gb`, but not e.g. `5×1g.10gb`). For sizing purposes we pick *one* profile per GPU and assume all slices on the GPU use the same profile (homogeneous partitioning), which is the typical inference deployment.

## 2. Sizing-math constraints with MIG

A MIG slice behaves like a smaller "virtual GPU" with three properties:

- `gpu_mem_gb_eff = slice_mem_gb`
- `gpu_tflops_eff = gpu_tflops × slice_compute_g / max_g` (where max_g is 7 or 4)
- `bw_gpu_gbs_eff` — slice gets a proportional share of HBM bandwidth (`× slice_g / max_g`); confirm vs NVIDIA spec when picking decode-bound throughput

Hard constraints when sizing:

1. **TP=1 only.** MIG instances are isolated — no NVLink/NVSwitch between slices on one GPU and no MIG-aware NCCL collective. `tp_multiplier_Z=1` is enforced.
2. **No multi-GPU instance.** `gpus_per_instance` collapses to 1 (one slice = one logical GPU for the model).
3. **Per-physical-GPU multiplexing.** A single physical GPU now hosts up to `(max_g / slice_g)` model instances. For sizing accounting:
   - `instances_per_physical_gpu = max_g / slice_g`
   - `instances_per_server = gpus_per_server × instances_per_physical_gpu`
4. **Throughput aggregation.** Per-slice throughput uses the scaled tflops and bandwidth. Server-level throughput sums across all slices on the server.

## 3. Phase 1 — frontend feasibility hint (P12e)

**Goal**: surface "this fits on a MIG slice" advice without changing the backend. Static lookup table baked into the frontend.

**Where**: results panel in `ResultsDisplay.js`, after the SLA card. Shows a yellow advisory tile only when **all** of the following hold:

- Selected GPU is in the MIG-capable set (lookup against bundled `frontend/src/data/migProfiles.ts`).
- `tp_multiplier_Z === 1` and `gpus_per_instance === 1`.
- `model_mem_gb + kv_per_session_gb + safe_margin_gb ≤ smallest_fitting_slice.mem_gb`.

**Tile copy** (example):

> **Tip — fits on a MIG slice.** This 7B FP16 config needs ~14 GB per instance. On A100 80GB you could partition each GPU into **4 × `2g.20gb` slices**, lifting density from 1 → 4 instances per physical GPU and reducing total servers from 12 → 3.
>
> *Estimate only — full MIG-aware sizing (compute throughput at slice fraction) is not implemented yet. Use this as a capacity-planning hint against existing infrastructure.*

**Frontend module shape** (`frontend/src/data/migProfiles.ts`, ~80 LOC):

```ts
export type MigProfile = { name: string; computeG: number; memGb: number };
export type MigCapability = { gpuIds: string[]; maxG: number; profiles: MigProfile[] };

export const MIG_CAPABILITIES: MigCapability[] = [
  {
    gpuIds: ["nvidia-h100-80gb-pcie", "nvidia-h100-80gb-sxm"],
    maxG: 7,
    profiles: [
      { name: "1g.10gb", computeG: 1, memGb: 10 },
      { name: "1g.20gb", computeG: 1, memGb: 20 },
      // ...
    ],
  },
  // ...
];

export function findFittingSlice(
  gpuId: string,
  perInstanceMemGb: number,
): { capability: MigCapability; slice: MigProfile; instancesPerGpu: number } | null { ... }
```

**Limits**:
- Hint shows whole-GPU server count first, MIG-density estimate as advisory math.
- No claim about throughput — only memory feasibility. We say so explicitly in the tile.
- GPU IDs must match `gpu_data.json` `id` field exactly; a small drift list keeps the lookup correct as the catalog updates.

## 4. Phase 2 — backend MIG-aware sizing (later)

When the user is ready to commit to MIG-aware sizing in the engine:

### 4.1 Catalog schema

Add to GPU records in `gpu_data.json` and `gpu_catalog_service.py` schema:

```json
{
  "id": "nvidia-h100-80gb-sxm",
  "memory_gb": 80,
  "tflops_fp16": 989,
  "memory_bandwidth_gbs": 3350,
  "mig": {
    "max_g": 7,
    "profiles": [
      { "name": "1g.10gb", "compute_g": 1, "mem_gb": 10 },
      { "name": "2g.20gb", "compute_g": 2, "mem_gb": 20 }
      // ...
    ]
  }
}
```

Backfill: A100 (40/80), A30, H100 (PCIe/SXM/NVL), H200, GH200, B200, B300. Source: NVIDIA MIG User Guide + each GPU datasheet.

### 4.2 Sizing input

Add to `SizingInput`:

```python
mig_profile: Optional[str] = Field(
    None,
    description="MIG slice name (e.g. '1g.10gb'). When set, gpu_mem_gb, "
                "gpu_flops_Fcount and bw_gpu_gbs are overridden by the slice's "
                "compute/memory fraction. Forces tp_multiplier_Z=1.",
)
```

Validation: if set, look up the profile in the GPU's MIG entry; reject if GPU isn't MIG-capable or profile name unknown; reject if `tp_multiplier_Z != 1`.

### 4.3 Sizing service overrides

In `services/sizing_service.py`, before the core math:

```python
if input_data.mig_profile:
    cap = lookup_mig_capability(gpu_id)
    slice = next(p for p in cap.profiles if p.name == input_data.mig_profile)
    fraction = slice.compute_g / cap.max_g
    effective_mem = slice.mem_gb
    effective_tflops = catalog_tflops * fraction
    effective_bw = catalog_bw * fraction  # confirm vs NVIDIA whitepaper
    instances_per_physical_gpu = cap.max_g // slice.compute_g
else:
    effective_mem = input_data.gpu_mem_gb
    effective_tflops = catalog_tflops
    effective_bw = catalog_bw
    instances_per_physical_gpu = 1
```

Then:
- All memory math uses `effective_mem`.
- All compute math uses `effective_tflops`.
- All bandwidth math uses `effective_bw`.
- `instances_per_server = gpus_per_server × instances_per_physical_gpu`.
- Output adds `mig_profile_used`, `instances_per_physical_gpu`, `total_mig_slices = total_gpu_count × instances_per_physical_gpu`.

### 4.4 Auto-optimize integration

`auto_optimize_service.py` gains a search axis: for each MIG-capable GPU in the candidate list, also try each profile. Filter early: if `model_mem_gb > slice.mem_gb`, skip. This roughly multiplies the search space by ~5 for MIG-capable GPUs (5 profiles average); acceptable.

Scoring stays the same; the optimizer naturally picks small slices for small models because servers-required drops.

### 4.5 Tests

- Unit: `core/sizing_math.py` is unchanged (pure functions). `services/sizing_service.py` gets new tests asserting overrides apply correctly.
- Goldens: add MIG-specific fixtures (e.g. 7B FP16 on A100 1g.10gb) that exercise compute fraction × memory cap × instances-per-GPU.
- Stress: extend `tests/test_web_calculator_stress.py` with MIG scenarios; reference Python should match within tolerance.

### 4.6 Frontend wiring

When backend lands:
- Form gains a "MIG slice" dropdown (only enabled when GPU is MIG-capable).
- Auto-optimize results table column: "MIG slice" (— if none).
- Results card: "Total slices" alongside "Total GPUs" when MIG is in use.
- The Phase 1 hint becomes redundant and can be replaced by direct workflow.

## 5. Open questions

1. **Bandwidth per slice** — confirm the NVIDIA whitepaper figure for `bw_per_slice = bw_total × g/max_g` exactly. Some sources suggest it's not strictly linear on H100 due to L2 partitioning. Affects decode-bound throughput accuracy.
2. **Heterogeneous slices** — Phase 2 assumes homogeneous partitioning per GPU. Allowing mixed slice sizes (e.g. `1×4g.40gb + 3×1g.10gb`) within one GPU multiplies catalog complexity ~10×; defer unless customers ask.
3. **Calibration** — MIG slice utilization (`η_pf`, `η_dec`) might differ from full-GPU values due to L2 cache pressure and SM scheduling. Phase 2 should default to current `η_*` values but flag in docs that empirical calibration is recommended.
4. **OCR/VLM with MIG** — the same hint/sizing logic applies to VLM and OCR (single-GPU, no TP). Phase 2 backend should extend `VLMSizingInput` and `OCRSizingInput` symmetrically.

## 6. Decision snapshot

- Phase 1 (frontend hint): ship in P12e — a few hundred LOC, no backend changes, advisory only.
- Phase 2 (backend MIG-aware sizing): planned but not scoped into this branch. Estimated ~3–5 days of backend work + tests + frontend wiring.
