/**
 * English translation dictionary.
 *
 * Keys are dot-namespaced by feature area. Missing keys fall back to the
 * key itself in I18nContext, so adding a new label only requires updating
 * one file at a time during incremental migration.
 */
const en = {
  // ── App shell ────────────────────────────────────────────────────────
  "app.title": "AI Infrastructure Calculator",
  "app.subtitle": "GPU sizing for LLM, VLM and OCR workloads",
  "app.docs": "Documentation",
  "app.github": "GitHub",
  "app.theme.light": "Light",
  "app.theme.dark": "Dark",
  "app.theme.system": "System",
  "app.theme.label": "Theme",
  "app.lang.label": "Language",
  "app.lang.en": "EN",
  "app.lang.ru": "RU",
  "app.footer.version": "Version",
  "app.footer.builtWith": "Built with FastAPI + React",
  "app.tour.start": "Take a Tour",
  "app.docs.download": "Download .docx",
  "app.docs.close": "Close (Esc)",
  "app.docs.loading": "Loading methodology…",
  "app.docs.error": "Failed to load methodology",

  // ── Calculator modes ─────────────────────────────────────────────────
  "mode.label": "Calculator mode",
  "mode.llm": "LLM",
  "mode.llm.subtitle": "Chat & completion",
  "mode.vlm": "OCR (VLM)",
  "mode.vlm.subtitle": "Image → JSON",
  "mode.ocr": "OCR + LLM",
  "mode.ocr.subtitle": "Two-pass extraction",

  // ── Results: shared ──────────────────────────────────────────────────
  "results.title": "Calculation Results",
  "results.loading": "Calculating server requirements...",
  "results.warning": "Warning",
  "results.empty.title": "No results yet",
  "results.empty.subtitle": "Submit your configuration to see the server requirements",
  "results.empty": "Configure inputs and run the calculator to see results.",
  "results.servers": "Servers",
  "results.servers.subtitle": "Total physical machines",
  "results.gpus": "Total GPUs",
  "results.gpus.subtitle": "Servers × GPUs/server",
  "results.sessions": "Sessions / Server",
  "results.throughput": "Server throughput",
  "results.throughput.unit": "req/s",
  "results.gpuPerServer": "GPUs / Server",
  "results.gpuPerInstance": "GPUs / Instance",
  "results.instancesPerServer": "Instances / Server",
  "results.recalculate": "Recalculate",
  "results.dismiss": "Dismiss",

  // ── Card 1 (LLM): infrastructure ─────────────────────────────────────
  "results.card1.title": "Infrastructure",

  // ── Hero metric cards (LLM) ─────────────────────────────────────────
  "results.cost.title": "Cost Estimate",
  "results.cost.tooltip":
    "If you see an empty cost value, download the GPU reference guide and add the actual cost values there yourself.",
  "results.cost.subtitle": "GPU hardware only",
  "results.concurrentSessions": "Concurrent Sessions",
  "results.sessionContext": "Session Context",
  "results.sessionContext.unit": "tokens",
  "results.infrastructure.title": "Infrastructure Required",
  "results.infrastructure.servers": "servers",
  "results.infrastructure.gpus": "GPUs",
  "results.infrastructure.maxMemComp": "max(mem: {mem}, comp: {comp})",
  "results.sessions.title": "Sessions per Server",
  "results.sessions.subtitle": "{instances} inst × {sessions} sess each",
  "results.throughput.title": "Server Throughput",
  "results.throughput.tooltip":
    "Requests per second that one server can handle (req/s)",
  "results.throughput.detail": "prefill {pf} · decode {dec}",

  // ── Secondary metric cards ──────────────────────────────────────────
  "results.gpuPerServer.title": "GPUs per Server",
  "results.gpuPerInstance.title": "GPUs per Instance",
  "results.gpuPerInstance.tooltip":
    "One instance = one running copy of the model. This is the number of GPUs allocated to each copy (tensor parallelism degree).",
  "results.instancesPerServer.title": "Instances per Server",
  "results.instancesPerServer.tooltip":
    "How many independent model copies fit on one server, considering tensor parallelism.",

  // ── Memory / KV cards ────────────────────────────────────────────────
  "results.memory.title": "GPU Memory per Instance",
  "results.memory.headerSubtitle": "{n} GPU{plural} × {gib} GiB = {total} GiB total",
  "results.memory.modelWeights": "Model Weights",
  "results.memory.kvAvailable": "Available for KV-cache",
  "results.memory.reserved": "Reserved (1 − Kavail)",
  "results.memory.kvAtPeak": "KV at peak",
  "results.memory.free": "Free / overhead",
  "results.memory.total": "Total per instance",

  // ── Latency / SLA ────────────────────────────────────────────────────
  "results.latency.ttft": "TTFT",
  "results.latency.e2e": "End-to-end",
  "results.latency.target": "target",
  "results.latency.actual": "actual",
  "results.sla.title": "SLA Validation",
  "results.sla.notifications.title": "SLA Notifications",
  "results.sla.notifications.button": "SLA notifications",
  "results.sla.passed": "All SLA checks pass",
  "results.sla.failed": "SLA not met",
  "results.sla.passed.short": "Passed",
  "results.sla.failed.short": "Failed",
  "results.sla.passed.empty": "SLA passed. No recommendations.",
  "results.sla.empty": "No notifications.",
  "results.sla.ttft.title": "Time To First Token (TTFT)",
  "results.sla.e2e.title": "End-to-End Latency",
  "results.sla.calculated": "Calculated",
  "results.sla.target": "SLA Target",
  "results.sla.unit": "sec",
  "results.sla.pass": "PASS",
  "results.sla.fail": "FAIL — exceeds target",
  "results.sla.recommendations": "Recommendations",

  // ── Detailed results (Memory / Compute paths) ───────────────────────
  "results.detailed.title": "Detailed Results",
  "results.detailed.memoryPath": "Memory Path",
  "results.detailed.computePath": "Compute Path",
  "results.detailed.tokensPerRequest": "Tokens per Request (T)",
  "results.detailed.sessionContext": "Session Context (TS)",
  "results.detailed.sequenceLength": "Sequence Length (SL)",
  "results.detailed.modelMem": "Model Memory (Mmodel)",
  "results.detailed.kvPerSession": "KV/Session (MKV)",
  "results.detailed.freeKvInst": "Free KV/Instance",
  "results.detailed.sessionsBaseTp": "Sessions/Instance (base TP)",
  "results.detailed.sessionsZTp": "Sessions/Instance (Z x TP)",
  "results.detailed.serversByMemory": "Servers by Memory",
  "results.detailed.gpuTflops": "GPU TFLOPS (per GPU)",
  "results.detailed.fcountModel": "Fcount_model (per instance)",
  "results.detailed.flopsPerToken": "FLOP/token (FPS)",
  "results.detailed.decodeTokens": "Decode Tokens (Tdec)",
  "results.detailed.prefillThroughput": "Prefill Throughput (Th_pf)",
  "results.detailed.decodeThroughput": "Decode Throughput (Th_dec)",
  "results.detailed.cmodel": "Requests/sec per Instance (Cmodel)",
  "results.detailed.serverThroughput": "Server Throughput (Th_server)",
  "results.detailed.serversByCompute": "Servers by Compute",
  "results.detailed.tokensUnit": "tok",

  // ── Report download ─────────────────────────────────────────────────
  "results.report.download": "Download Excel Report",
  "results.report.generating": "Generating Report...",

  // ── Gateway quotas ───────────────────────────────────────────────────
  "results.gateway.title": "Gateway quotas",
  "results.gateway.subtitle": "For LiteLLM / shared vLLM rate-limits",
  "results.gateway.peakRpmTooltip":
    "How many model calls per minute hit the gateway at peak load. Use this as the rate-limit ceiling on your inference gateway (e.g. LiteLLM rpm, NGINX limit_req). The 'sustained' line below is the steady-state average without the SLA safety margin.",
  "results.gateway.peakTpmTooltip":
    "Total tokens per minute (prompt tokens going in + tokens the model generates) flowing through the gateway at peak. This is what billing dashboards and per-tenant token quotas count. Use it to size the gateway's tpm budget.",
  "results.gateway.tpmSplitTooltip":
    "Same Peak TPM, separated into the prompt (input — system + user + RAG/history) the gateway forwards to the model, and the response (output) the model streams back. Useful when input and output are billed or rate-limited separately.",
  "results.gateway.maxParallelTooltip":
    "How many requests can be in flight at the same time at peak. Set this as the gateway's concurrency cap (LiteLLM max_parallel_requests, vLLM max_num_seqs) so it queues new arrivals instead of overloading the engine and blowing the SLA.",
  "results.gateway.ocrPeakRpmTooltip":
    "Pages per minute reaching the OCR stage at peak. Zero when the OCR pipeline runs on CPU (the CPU stage doesn't go through the gateway).",
  "results.gateway.llmPeakRpmTooltip":
    "Calls per minute reaching the LLM stage at peak — one call per page. Use this as the rate-limit ceiling for the LLM pool on the gateway.",
  "results.gateway.llmPeakTpmTooltip":
    "Total tokens per minute on the LLM pool at peak (system prompt + OCR'd text + JSON the model emits). Use this for the LLM-pool tpm budget.",
  "results.gateway.peakRpm": "Peak RPM",
  "results.gateway.peakTpm": "Peak TPM",
  "results.gateway.tpmSplit": "TPM split",
  "results.gateway.maxParallel": "Max parallel",
  "results.gateway.sustained": "sustained",
  "results.gateway.in": "in",
  "results.gateway.out": "out",
  "results.gateway.concurrent": "concurrent requests",
  "results.gateway.concurrentPages": "concurrent pages",
  "results.gateway.ocrPeakRpm": "OCR peak RPM",
  "results.gateway.llmPeakRpm": "LLM peak RPM",
  "results.gateway.llmPeakTpm": "LLM peak TPM",
  "results.gateway.cpuPipeline": "CPU pipeline",
  "results.gateway.pagesPerMin": "pages/min",

  // ── Form (high-level section labels only — leaf inputs stay verbatim) ──
  "form.title": "Configuration",
  "form.calculate": "Calculate",
  "form.calculating": "Calculating…",
  "form.autoOptimize": "Auto-optimize",
  "form.autoOn": "Auto",
  "form.autoOff": "Auto",
  "form.autoTooltip": "Auto-Optimize: automatically find the best hardware configuration",
  "form.findBest": "Find Best Configs",
  "form.searching": "Searching configurations…",
  "form.report": "Download Excel report",
  "form.tab.basic": "Basic",
  "form.tab.advanced": "Advanced",
  "form.section.users": "Users & workload",
  "form.section.usersTooltip":
    "Define the total user base. Fine-tune adoption and concurrency rates in the Advanced tab.",
  "form.section.tokens": "Token profile",
  "form.section.model": "Model",
  "form.section.modelTooltip":
    "Search for a model on Hugging Face to auto-fill architecture parameters, or set them manually in the Advanced tab.",
  "form.section.kv": "KV-cache",
  "form.section.hardware": "Hardware",
  "form.section.sla": "SLA",
  "form.preset.select": "Choose a preset",
  "form.search.model": "Search model on Hugging Face",
  "form.search.placeholder": "Search for a model (e.g., llama, gpt, etc.)",
  "form.search.tooltip":
    "Search Hugging Face to find your model. Parameters like size, layers, and hidden dim are filled automatically. In 'Curated only' mode searches the bundled catalog instead.",
  "form.dataSource": "Data source",
  "form.source.auto": "Auto",
  "form.source.hf": "HuggingFace",
  "form.source.curated": "Curated",
  "form.badge.hf": "HuggingFace",
  "form.badge.curated": "Curated",
  "form.badge.unreachable": "(HF unreachable)",
  "form.input.totalUsers": "Total Users",
  "form.input.totalUsersTooltip":
    "Total number of internal users who may access the AI service. Increase manually past the slider max if needed.",
  "form.input.auto": "auto",

  // ── VLM / OCR specific ───────────────────────────────────────────────
  "vlm.title": "VLM Sizing Results",
  "vlm.empty.title": "No results yet",
  "vlm.empty.subtitle": "Submit your VLM configuration to see the sizing",
  "vlm.loading": "Calculating VLM sizing…",
  "vlm.warning": "Warning",
  "vlm.infraRequired": "Infrastructure Required",
  "vlm.servers": "servers",
  "vlm.gpus": "GPUs",
  "vlm.replicasSubtitle": "{count} replicas · {gpus} GPU/server",
  "vlm.slaPerPage": "SLA per page",
  "vlm.slaPass": "PASS",
  "vlm.slaFail": "FAIL",
  "vlm.slaDetail": "{actual}s actual · {target}s target",
  "vlm.throughput": "VLM Throughput",
  "vlm.throughputUnit": "tok/s prefill",
  "vlm.decode": "decode {value} tok/s",
  "vlm.replicas": "Replicas",
  "vlm.bsRealStar": "BS_real*",
  "vlm.visualTokens": "Visual tokens",
  "vlm.prefillLength": "Prefill length",
  "vlm.gatewayQuotas": "Gateway Quotas",
  "vlm.gatewaySubtitle": "For LiteLLM / shared vLLM rate-limits",
  "vlm.peakRpm": "Peak RPM",
  "vlm.peakRpmSub": "sustained {value} pages/min",
  "vlm.peakTpm": "Peak TPM",
  "vlm.peakTpmSub": "sustained {value}",
  "vlm.tpmSplit": "TPM Split",
  "vlm.maxParallel": "Max Parallel",
  "vlm.concurrentPages": "concurrent pages",
  "vlm.memoryTitle": "GPU memory per instance",
  "vlm.memModel": "Model Weights",
  "vlm.memKv": "KV-cache (at BS*)",
  "vlm.memReserved": "Reserved",
  "vlm.memTotalLine": "Total per instance: {total} GB · KV at BS*: {kv} GB",
  "vlm.diagnostics": "Diagnostics",
  "vlm.diag.gpusPerInstance": "GPUs / instance",
  "vlm.diag.sTpZ": "S_TP at Z",
  "vlm.diag.instanceMem": "Instance memory",
  "vlm.diag.gpuTflops": "GPU TFLOPS used",
  "vlm.diag.slPfEff": "SL_pf (eff)",
  "vlm.diag.slDec": "SL_dec",
  "vlm.diag.kvPerPage": "KV per page",
  "vlm.diag.modelWeights": "Model weights",
  "vlm.diag.slaTarget": "SLA target",

  "ocr.title": "OCR + LLM Sizing Results",
  "ocr.empty.title": "No results yet",
  "ocr.empty.subtitle": "Submit your OCR + LLM configuration to see the sizing",
  "ocr.loading": "Calculating OCR + LLM sizing…",
  "ocr.warning": "Warning",
  "ocr.infraRequired": "Infrastructure Required",
  "ocr.servers": "servers",
  "ocr.gpus": "GPUs",
  "ocr.poolSubtitle": "OCR pool: {ocr} · LLM pool: {llm}",
  "ocr.poolSubtitleCpu": "OCR on CPU",
  "ocr.slaPerPage": "SLA per page",
  "ocr.slaPass": "PASS",
  "ocr.slaFail": "FAIL",
  "ocr.slaDetail": "t_OCR {tOcr}s · LLM budget {tLlm}s · target {target}s",
  "ocr.throughput": "LLM Throughput",
  "ocr.throughputUnit": "tok/s prefill",
  "ocr.decode": "decode {value} tok/s",
  "ocr.ocrPool": "OCR pool",
  "ocr.llmPool": "LLM pool",
  "ocr.bsRealStar": "BS_real*",
  "ocr.replicas": "LLM replicas",
  "ocr.cores": "cores",
  "ocr.gpus.label": "GPUs",
  "ocr.cpu": "CPU",
  "ocr.coresLine": "{count} cores",
  "ocr.handoff": "Handoff",
  "ocr.budgetSplit": "SLA budget split",
  "ocr.gatewayQuotas": "Gateway Quotas",
  "ocr.gatewaySubtitle": "Rate-limit OCR and LLM pools independently",
  "ocr.ocrPeakRpm": "OCR Peak RPM",
  "ocr.ocrPeakRpmSub": "pages/min",
  "ocr.ocrPeakRpmCpu": "CPU pipeline",
  "ocr.llmPeakRpm": "LLM Peak RPM",
  "ocr.llmPeakRpmSub": "sustained {value}",
  "ocr.llmPeakTpm": "LLM Peak TPM",
  "ocr.llmPeakTpmSub": "in {input} · out {output}",
  "ocr.maxParallel": "Max Parallel",
  "ocr.concurrentPages": "concurrent pages",
  "ocr.memoryTitle": "GPU memory per LLM instance",
  "ocr.memModel": "Model Weights",
  "ocr.memKv": "KV-cache (at BS*)",
  "ocr.memReserved": "Reserved",
  "ocr.memTotalLine": "Total per instance: {total} GB · KV at BS*: {kv} GB",
  "ocr.diagnostics": "Diagnostics",
  "ocr.diag.pipeline": "Pipeline",
  "ocr.diag.tOcr": "t_OCR / page",
  "ocr.diag.llmBudget": "LLM SLA budget",
  "ocr.diag.lText": "L_text",
  "ocr.diag.slPfEff": "SL_pf (eff)",
  "ocr.diag.slDec": "SL_dec",
  "ocr.diag.gpusPerInstance": "GPUs / instance",
  "ocr.diag.sessionsPerInstance": "Sessions / instance",
  "ocr.diag.kvPerSession": "KV / session",
  "ocr.diag.modelWeights": "Model weights",
  "ocr.diag.gpuTflops": "GPU TFLOPS used",
  "ocr.diag.handoff": "Handoff",

  // ── MIG advisory ─────────────────────────────────────────────────────
  "mig.title": "MIG feasibility hint",
  "mig.fits": "Fits in MIG slice",
  "mig.notFits": "Requires full GPU",
  "mig.tipFits": "Tip — fits on a {slice} MIG slice",
  "mig.body":
    "This config needs ~{mem} GB per instance. On this GPU you can partition each card into {n}× {slice} slices, lifting density from 1 → {n} instances per physical GPU{tail}",
  "mig.bodyTail": ". Estimated physical GPUs: {est} (vs {total} as whole-GPU instances).",
  "mig.bodyTailEnd": ".",
  "mig.estimateOnly":
    "Estimate only — backend MIG-aware sizing (compute throughput at slice fraction) is not yet implemented. Use this as a capacity-planning hint against existing infrastructure. Max {max} slices per physical GPU.",

  // ── VLM / OCR form: shared (workload, model, hardware) ──────────────
  "vmForm.quickPresets": "Quick Presets",
  "vmForm.workloadOnline": "Workload (online)",
  "vmForm.pagesPerSecond": "Pages per second (λ)",
  "vmForm.peakConcurrent": "Peak concurrent pages",
  "vmForm.slaPerPage": "SLA per page (p95)",
  "vmForm.parameters": "Parameters",
  "vmForm.quantization": "Quantization",
  "vmForm.layers": "Layers (L)",
  "vmForm.hiddenSize": "Hidden size (H)",
  "vmForm.kvHeads": "KV heads (Nkv)",
  "vmForm.attnHeads": "Attention heads",
  "vmForm.maxContext": "Max context window",
  "vmForm.tokensSuffix": "tokens",
  "vmForm.jsonFields": "JSON fields per response",
  "vmForm.tokensPerField": "Tokens per field",
  "vmForm.tokensPerFieldHint": "typically 30-100",
  "vmForm.hardware": "Hardware",
  "vmForm.gpuModel": "GPU model",
  "vmForm.gpuPickPrompt": "Click to choose a GPU…",
  "vmForm.gpuMemory": "GPU memory",
  "vmForm.gpuTflops": "GPU TFLOPS",
  "vmForm.gpusPerServer": "GPUs per server",
  "vmForm.tp": "Tensor parallelism (Z)",
  "vmForm.tpHint": "1 = single GPU",
  "vmForm.invalidValue": "Missing or invalid value for {field}",

  // ── VLM form ────────────────────────────────────────────────────────
  "vlmForm.imageTokenProfile": "Image & token profile",
  "vlmForm.imageWidth": "Image width",
  "vlmForm.imageHeight": "Image height",
  "vlmForm.patchSize": "Effective patch size",
  "vlmForm.patchHint": "Qwen2.5-VL ≈ 28",
  "vlmForm.promptTokens": "Prompt tokens (text)",
  "vlmForm.modelTitle": "VLM model",
  "vlmForm.submit": "Calculate VLM Sizing",
  // Field-level tooltips
  "vmForm.pagesPerSecond.tooltip":
    "Average page-extraction load (pages per second) the system needs to keep up with on a long-term basis.",
  "vmForm.peakConcurrent.tooltip":
    "Peak concurrent in-flight pages — the burst the system must hold without queueing past the SLA target.",
  "vmForm.slaPerPage.tooltip":
    "Per-page latency target (p95). The whole pipeline must return JSON for one page within this many seconds.",
  "vlmForm.imageWidth.tooltip":
    "Page image width in pixels at the resolution the VLM receives. Larger pages = more visual tokens = slower prefill.",
  "vlmForm.imageHeight.tooltip":
    "Page image height in pixels. Together with width and patch size, defines how many visual tokens the encoder produces.",
  "vlmForm.patchSize.tooltip":
    "Side length of the image patch (in pixels) that the vision encoder treats as one token. The number of visual tokens scales as ⌈W/patch⌉·⌈H/patch⌉. Default ≈ 28 for Qwen2.5-VL; check your model's processor_config for the exact value.",
  "vlmForm.promptTokens.tooltip":
    "Tokens in the text prompt sent alongside the image (system instruction + extraction schema). Adds to prefill length.",
  "vmForm.jsonFields.tooltip":
    "How many fields the model must extract per page in the JSON response. More fields = longer output = more decode time.",
  "vmForm.tokensPerField.tooltip":
    "Average tokens emitted per field in the response. Multiplied by the number of fields to estimate total decode length.",

  // ── OCR form ────────────────────────────────────────────────────────
  "ocrForm.pipelineTitle": "OCR pipeline",
  "ocrForm.pipelineLabel": "OCR pipeline",
  "ocrForm.pipelineOnGpu": "OCR on GPU",
  "ocrForm.pipelineOnGpuHint": "PaddleOCR-GPU, EasyOCR-GPU",
  "ocrForm.pipelineOnCpu": "OCR on CPU",
  "ocrForm.pipelineOnCpuHint": "Tesseract; CPU pool, no GPU sizing",
  "ocrForm.throughputGpu": "OCR throughput per GPU",
  "ocrForm.empirical": "empirical",
  "ocrForm.poolUtilisation": "OCR pool utilisation (η_OCR)",
  "ocrForm.poolUtilHint": "0.7-0.85",
  "ocrForm.throughputCore": "OCR throughput per core",
  "ocrForm.cpuCores": "CPU cores for OCR",
  "ocrForm.handoff": "Handoff overhead",
  "ocrForm.handoffHint": "OCR → LLM handoff",
  "ocrForm.textProfile": "OCR text profile",
  "ocrForm.charsPerPage": "Characters per page",
  "ocrForm.charsPerToken": "Chars per token",
  "ocrForm.charsPerTokenHint": "3.5 mixed · 4.0 EN · 2.8 RU",
  "ocrForm.sysPromptTokens": "System prompt tokens",
  "ocrForm.modelTitle": "LLM model",
  "ocrForm.submit": "Calculate OCR + LLM Sizing",
  "ocrForm.errOcrGpu": "OCR-GPU throughput (pages/s/GPU) is required for ocr_gpu pipeline",
  "ocrForm.errOcrCore": "OCR-core throughput (pages/s/core) is required for ocr_cpu pipeline",
  "ocrForm.errOcrCores": "Number of OCR CPU cores must be ≥ 1 for ocr_cpu pipeline",
  // Field-level tooltips (OCR-specific)
  "ocrForm.throughputGpu.tooltip":
    "Pages per second one OCR-GPU process can handle, measured empirically (PaddleOCR-GPU / EasyOCR-GPU). Drives the OCR-pool size.",
  "ocrForm.poolUtilisation.tooltip":
    "Target average load on the OCR-GPU pool. 0.7–0.85 leaves headroom for spikes; closer to 1.0 risks queueing past the SLA.",
  "ocrForm.throughputCore.tooltip":
    "Pages per second one CPU core can OCR (e.g. Tesseract). Drives the CPU-core count for ocr_cpu pipelines.",
  "ocrForm.cpuCores.tooltip":
    "Number of CPU cores reserved for the OCR stage. Must be ≥ 1 in ocr_cpu mode.",
  "ocrForm.handoff.tooltip":
    "Fixed time spent passing OCR output to the LLM stage (network round-trip, JSON serialisation, queueing). Subtracted from the per-page SLA budget.",
  "ocrForm.charsPerPage.tooltip":
    "Average characters of recognised text per page. Combined with chars-per-token, gives the LLM stage's input length.",
  "ocrForm.charsPerToken.tooltip":
    "Tokenizer compression ratio (chars per token). Typical: ≈4 for English, ≈2.8 for Russian, 3.5 for mixed text.",
  "ocrForm.sysPromptTokens.tooltip":
    "Static instruction prompt prepended to the LLM input on every page. Adds to LLM prefill length.",

  // ── LLM Advanced tab: collapsible section titles + tooltips ─────────
  "form.section.modelArch": "Model Architecture",
  "form.section.modelArchTooltip":
    "Core architecture parameters that determine the model's memory footprint on GPU.",
  "form.section.userBehavior": "User Behavior",
  "form.section.userBehaviorTooltip":
    "Controls how many users are active simultaneously and how they generate load.",
  "form.section.tokenBudget": "Token Budget",
  "form.section.tokenBudgetTooltip":
    "Token counts that define a typical request and conversation. These determine memory and compute requirements.",
  "form.section.agentic": "Agentic / RAG / Tool-Use",
  "form.section.agenticTooltip":
    "Multi-call architectures: ReAct, RAG, function calling, multi-agent. Sets K_calls, tool overhead, and RAG context. Reduces to single-turn at K_calls=1 with all overheads at 0.",
  "form.section.kvCache": "KV-Cache",
  "form.section.kvCacheTooltip":
    "Key-Value cache stores attention states for each session. Larger contexts and more sessions require more GPU memory.",
  "form.section.compute": "Compute & Throughput",
  "form.section.computeTooltip":
    "GPU compute capacity and throughput estimation. Determines how many requests each server can handle.",
  "form.section.slaLoad": "SLA & Load",
  "form.section.slaLoadTooltip":
    "Service-level targets and per-session load. Drives the SLA validation and the safety margin used during sizing.",
  "form.section.hardwareTooltip":
    "Choose the GPU accelerator and server layout. Memory and TFLOPS are auto-filled from the GPU catalog.",

  // ── Plain-language tooltips: LLM result cards ───────────────────────
  "results.concurrentSessions.tooltip":
    "How many user chat sessions can run at the same time on the deployed cluster at peak load.",
  "results.sessionContext.tooltip":
    "How many tokens of conversation history each session keeps in memory (system prompt + user messages + model replies). Bigger context = more memory per session.",
  "results.infrastructure.tooltip":
    "How many physical servers the workload needs. Final count is max of two checks: enough memory for KV-cache, and enough compute to keep up under SLA. Hover the tile for the breakdown.",
  "results.sessions.tooltip":
    "How many concurrent user sessions one server can hold before either KV-cache memory or compute throughput is exhausted.",
  "results.gpuPerServer.tooltip":
    "Number of GPU accelerators in each physical server (1 / 2 / 4 / 6 / 8). Driven by the chassis you're targeting.",
  "results.sla.ttft.tooltip":
    "Time To First Token — how long the user waits between hitting Send and seeing the first character of the reply. Lower is better; methodology default target is 1 second.",
  "results.sla.e2e.tooltip":
    "End-to-end latency — total time from request to the final token of the reply. Includes prefill, decode, and overhead. Methodology default target is 2 seconds.",

  // ── Plain-language tooltips: VLM result cards ───────────────────────
  "vlm.infraRequired.tooltip":
    "Servers and GPUs the VLM workload needs at peak. Sized so memory holds the model + KV-cache for the peak batch and compute keeps the per-page latency under SLA.",
  "vlm.slaPerPage.tooltip":
    "Whether the per-page latency target (p95) is met for the chosen model + GPU + concurrency. If it fails, lower concurrency, pick a faster GPU, or relax the SLA.",
  "vlm.throughput.tooltip":
    "Prefill throughput per VLM instance — tokens per second the model processes from the image + prompt. Big number = small latency per page. The decode line below is the response generation rate.",
  "vlm.bsRealStar.tooltip":
    "Effective batch size used inside the engine — how many pages share one prefill pass. Larger batches improve throughput but raise memory + per-page latency.",
  "vlm.replicas.tooltip":
    "How many parallel copies of the VLM are running across the cluster. More replicas = more throughput but more GPUs needed.",
  "vlm.visualTokens.tooltip":
    "Tokens the vision encoder produces from one page image. Scales with image size and the patch size of the model. Large pages = many visual tokens = slower prefill.",
  "vlm.prefillLength.tooltip":
    "Total prefill sequence length per page = visual tokens + text prompt tokens. Longer prefill = more compute + more KV memory.",
  "vlm.diag.gpusPerInstance.tooltip":
    "Number of GPUs allocated to a single running copy of the VLM (tensor parallelism degree).",
  "vlm.diag.sTpZ.tooltip":
    "How many concurrent pages a single VLM instance can handle while staying under the SLA.",
  "vlm.diag.instanceMem.tooltip":
    "Total GPU memory available to one VLM instance, summed across the GPUs it's allocated.",
  "vlm.diag.gpuTflops.tooltip":
    "Effective compute capacity of one GPU used by the calculator (FP16/BF16 tensor TFLOPS).",
  "vlm.diag.slPfEff.tooltip":
    "Effective prefill sequence length used by the engine — visual tokens + prompt tokens, after rounding to the engine's batching granularity.",
  "vlm.diag.slDec.tooltip":
    "How many tokens the model generates on decode per page (length of the JSON response).",
  "vlm.diag.kvPerPage.tooltip":
    "GPU memory the KV-cache holds for one in-flight page. Multiplies by the number of concurrent pages per instance.",
  "vlm.diag.modelWeights.tooltip":
    "GPU memory taken by the loaded model weights, before any KV-cache or runtime overhead.",
  "vlm.diag.slaTarget.tooltip":
    "User-set per-page latency target (p95) the calculator validates against.",

  // ── Plain-language tooltips: OCR + LLM result cards ─────────────────
  "ocr.infraRequired.tooltip":
    "Total servers and GPUs needed for both stages combined (OCR + LLM). The pool split below shows how many GPUs each stage uses; OCR-on-CPU shows '—' because the CPU stage isn't sized in GPUs.",
  "ocr.slaPerPage.tooltip":
    "Whether end-to-end per-page latency stays under the SLA target. The detail line shows OCR time + LLM time used; the rest of the budget is overhead and the handoff between stages.",
  "ocr.throughput.tooltip":
    "Prefill throughput per LLM instance — tokens per second the LLM stage processes from the OCR'd text. Decode line below is response-token generation rate.",
  "ocr.ocrPool.tooltip":
    "Resources allocated to the OCR stage. GPU pool count for ocr_gpu pipelines, CPU core count for ocr_cpu pipelines (where the OCR stage runs entirely on CPU).",
  "ocr.llmPool.tooltip":
    "GPUs allocated to the LLM stage that consumes the OCR'd text and emits the JSON response.",
  "ocr.bsRealStar.tooltip":
    "Effective batch size on the LLM stage — how many pages share one prefill pass on the LLM.",
  "ocr.replicas.tooltip":
    "Parallel copies of the LLM running across the LLM pool. More replicas = more throughput.",
  "ocr.diag.pipeline.tooltip":
    "Which OCR stack the calculator sized for: ocr_gpu (PaddleOCR/EasyOCR on GPU) or ocr_cpu (Tesseract on CPU).",
  "ocr.diag.tOcr.tooltip":
    "Time the OCR stage spends per page. Subtracted from the per-page SLA budget; the LLM stage gets what's left.",
  "ocr.diag.llmBudget.tooltip":
    "Time budget the LLM stage has per page after OCR time and the handoff overhead are subtracted from the SLA target.",
  "ocr.diag.lText.tooltip":
    "Tokens the LLM stage receives — system prompt plus the OCR'd text from one page.",
  "ocr.diag.slPfEff.tooltip":
    "Effective prefill length on the LLM stage after rounding to the engine's batching granularity.",
  "ocr.diag.slDec.tooltip":
    "Tokens the LLM generates per page (the JSON response length).",
  "ocr.diag.gpusPerInstance.tooltip":
    "GPUs allocated to one running copy of the LLM (tensor parallelism degree on the LLM pool).",
  "ocr.diag.sessionsPerInstance.tooltip":
    "How many concurrent pages one LLM instance can hold while staying under the LLM-stage time budget.",
  "ocr.diag.kvPerSession.tooltip":
    "GPU memory the KV-cache holds for one in-flight page on the LLM stage.",
  "ocr.diag.modelWeights.tooltip":
    "GPU memory taken by loaded LLM weights, before KV-cache or runtime overhead.",
  "ocr.diag.gpuTflops.tooltip":
    "Effective compute capacity of one LLM-pool GPU used by the calculator (FP16/BF16 tensor TFLOPS).",
  "ocr.diag.handoff.tooltip":
    "Fixed overhead added between OCR finishing and the LLM starting (network round-trip, JSON marshal, queueing). Subtracted from the per-page budget.",

  // ── Errors / loading ─────────────────────────────────────────────────
  "error.title": "Error",
  "error.network": "Network error: unable to reach the backend.",
  "error.retry": "Retry",
  "loading.calculating": "Running calculation…",

  // ── Guided tour: Joyride locale ──────────────────────────────────────
  "tour.locale.back": "Back",
  "tour.locale.close": "Close",
  "tour.locale.last": "Finish",
  "tour.locale.next": "Next",
  "tour.locale.nextProgress": "Next (Step {step} of {steps})",
  "tour.locale.skip": "Skip tour",

  // ── Guided tour: LLM (desktop) ───────────────────────────────────────
  "tour.llm.github":
    "Visit us on GitHub — star the repo to stay updated and learn more about the project.",
  "tour.llm.docs":
    "Here is the methodology documentation — browse it in a side panel without leaving the calculator.",
  "tour.llm.presets":
    "Start quickly by picking a preset configuration with pre-filled model, GPU, and load parameters.",
  "tour.llm.basicTab":
    "Basic settings cover users, model selection, and hardware — enough for a quick estimate.",
  "tour.llm.advancedTab":
    "Fine-tune token budgets, KV-cache, tensor parallelism, compute efficiency, and SLA parameters here.",
  "tour.llm.modelSearch":
    "Search Hugging Face to find your AI model. Architecture parameters like size and layers are filled automatically.",
  "tour.llm.gpuSearch":
    "Pick a GPU from the built-in catalog or upload your own. Memory and TFLOPS specs are filled in for you.",
  "tour.llm.slaTargets":
    "Set TTFT and end-to-end latency targets (default 1s and 2s). The calculator validates your configuration against these SLA limits.",
  "tour.llm.calculate":
    "Hit Calculate to run the sizing engine, or Find Best Configs in auto mode to compare multiple options.",
  "tour.llm.costEstimate":
    "Estimated GPU hardware cost based on current market prices for the selected configuration.",
  "tour.llm.sessionCards":
    "Total concurrent sessions the infrastructure supports and the token length of each session context.",
  "tour.llm.resultCards":
    "Key results at a glance: total servers and GPUs (so you can match against existing capacity), sessions per server, and throughput capacity.",
  "tour.llm.donutChart":
    "Visual breakdown of GPU memory per model instance — model weights vs. available KV-cache space.",
  "tour.llm.detailToggle":
    "Switch between Memory Path and Compute Path to see the full calculation details.",
  "tour.llm.downloadReport":
    "Download a detailed Excel report with all inputs, intermediate values, and final results.",
  "tour.llm.autoOptimize":
    "Toggle Auto-Optimize to let the engine search across GPUs, quantization levels, and TP degrees to find the best hardware configuration automatically.",
  "tour.llm.optimizeMode":
    "Choose an optimization strategy: minimize servers, minimize cost, find the best balance, or maximize throughput.",
  "tour.llm.optimizeResults":
    "After running the optimizer, results appear in this side panel. Click to expand it and compare configurations side by side.",

  // ── Guided tour: LLM (mobile) ────────────────────────────────────────
  "tour.llmMobile.github": "Visit us on GitHub — star the repo to stay updated.",
  "tour.llmMobile.docs": "Tap to open the methodology documentation in a new tab.",
  "tour.llmMobile.presets":
    "Pick a preset to quickly fill in model, GPU, and load parameters.",
  "tour.llmMobile.modelSearch":
    "Search Hugging Face for your AI model — parameters are filled automatically.",
  "tour.llmMobile.gpuSearch":
    "Choose a GPU from the catalog. Memory and TFLOPS are filled in for you.",
  "tour.llmMobile.calculate": "Tap Calculate to run the sizing engine and see your results.",

  // ── Guided tour: VLM (desktop) ───────────────────────────────────────
  "tour.vlm.github":
    "Visit us on GitHub — star the repo to stay updated and learn more about the project.",
  "tour.vlm.docs": "Methodology documentation. Appendix И covers VLM single-pass online sizing.",
  "tour.vlm.modeSwitcher":
    "You're in VLM mode — single-pass image-to-JSON sizing. Switch to LLM or OCR+LLM here when needed.",
  "tour.vlm.presets":
    "Pick a preset to populate workload, image profile, model, and hardware in one click.",
  "tour.vlm.workload":
    "VLM is sized in pages/sec, not user sessions. Set average pages/sec, peak concurrency, and the per-page SLA target.",
  "tour.vlm.hardware":
    "Pick a GPU and tensor parallelism degree. VLMs are typically run at TP=1 unless the model is very large.",
  "tour.vlm.calculate":
    "Click to run the sizing engine and get servers + GPUs needed for your workload.",
  "tour.vlm.results":
    "Three headline cards: infrastructure (servers + GPUs), SLA pass/fail, and per-instance prefill/decode throughput.",

  // ── Guided tour: VLM (mobile) ────────────────────────────────────────
  "tour.vlmMobile.github": "Star the repo on GitHub.",
  "tour.vlmMobile.modeSwitcher": "Switch between LLM, VLM, and OCR+LLM modes here.",
  "tour.vlmMobile.presets": "Tap a preset to fill all fields.",
  "tour.vlmMobile.calculate": "Tap Calculate to run the sizing engine.",

  // ── Guided tour: OCR + LLM (desktop) ─────────────────────────────────
  "tour.ocr.github":
    "Visit us on GitHub — star the repo to stay updated and learn more about the project.",
  "tour.ocr.docs":
    "Methodology documentation. Appendix И.4.2 covers OCR+LLM two-pass online sizing with two-pool deployments.",
  "tour.ocr.modeSwitcher":
    "You're in OCR + LLM mode — two-pass extraction. Switch between LLM, VLM, and OCR+LLM here.",
  "tour.ocr.presets":
    "Pick a preset to populate workload, OCR pipeline, text profile, model, and hardware.",
  "tour.ocr.workload":
    "Same workload semantics as VLM: pages/sec, peak concurrency, per-page SLA. The SLA budget is split between OCR and LLM stages.",
  "tour.ocr.pipeline":
    "Pick OCR-on-GPU (PaddleOCR/EasyOCR) for high-volume cases, or OCR-on-CPU (Tesseract) when the GPU pool should hold only the LLM. The choice changes how the SLA budget is split.",
  "tour.ocr.hardware": "Pick a GPU and tensor parallelism degree for the LLM stage.",
  "tour.ocr.calculate": "Run sizing — backend returns separate GPU pools for OCR and LLM stages.",
  "tour.ocr.results":
    "Three cards: total infrastructure with the OCR+LLM pool split below, SLA pass/fail with t_OCR breakdown, and LLM-stage throughput.",

  // ── Guided tour: OCR + LLM (mobile) ──────────────────────────────────
  "tour.ocrMobile.github": "Star the repo on GitHub.",
  "tour.ocrMobile.modeSwitcher": "Switch between LLM, VLM, and OCR+LLM modes here.",
  "tour.ocrMobile.presets": "Tap a preset to fill all fields.",
  "tour.ocrMobile.pipeline": "Choose OCR on GPU or CPU.",
  "tour.ocrMobile.calculate": "Tap Calculate.",
};

export default en;
