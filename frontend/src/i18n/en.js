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

  // ── Calculator modes ─────────────────────────────────────────────────
  "mode.label": "Calculator mode",
  "mode.llm": "LLM",
  "mode.llm.subtitle": "Chat & completion",
  "mode.vlm": "VLM",
  "mode.vlm.subtitle": "Image → structured JSON",
  "mode.ocr": "OCR + LLM",
  "mode.ocr.subtitle": "Two-pass extraction",

  // ── Results: shared ──────────────────────────────────────────────────
  "results.title": "Calculation results",
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

  // ── Card 1 (LLM): infrastructure ─────────────────────────────────────
  "results.card1.title": "Infrastructure",

  // ── Memory / KV cards ────────────────────────────────────────────────
  "results.memory.title": "GPU memory per instance",
  "results.memory.modelWeights": "Model weights",
  "results.memory.kvAtPeak": "KV at peak",
  "results.memory.free": "Free / overhead",
  "results.memory.total": "Total per instance",

  // ── Latency / SLA ────────────────────────────────────────────────────
  "results.latency.ttft": "TTFT",
  "results.latency.e2e": "End-to-end",
  "results.latency.target": "target",
  "results.latency.actual": "actual",
  "results.sla.passed": "All SLA checks pass",
  "results.sla.failed": "SLA not met",
  "results.sla.recommendations": "Recommendations",

  // ── Gateway quotas ───────────────────────────────────────────────────
  "results.gateway.title": "Gateway quotas",
  "results.gateway.subtitle": "For LiteLLM / shared vLLM rate-limits",
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
  "form.calculate": "Calculate",
  "form.calculating": "Calculating…",
  "form.autoOptimize": "Auto-optimize",
  "form.report": "Download Excel report",
  "form.section.users": "Users & workload",
  "form.section.tokens": "Token profile",
  "form.section.model": "Model",
  "form.section.kv": "KV-cache",
  "form.section.hardware": "Hardware",
  "form.section.compute": "Compute",
  "form.section.sla": "SLA",
  "form.section.agentic": "Agentic / RAG",
  "form.preset.select": "Choose a preset",
  "form.search.model": "Search model on Hugging Face",
  "form.source.auto": "Auto",
  "form.source.hf": "HuggingFace",
  "form.source.curated": "Curated catalog",

  // ── VLM / OCR specific ───────────────────────────────────────────────
  "vlm.replicas": "Replicas",
  "vlm.bsRealStar": "BS_real*",
  "vlm.visualTokens": "Visual tokens",
  "vlm.prefillLength": "Prefill length",
  "ocr.ocrPool": "OCR pool",
  "ocr.llmPool": "LLM pool",
  "ocr.bsRealStar": "BS_real*",
  "ocr.replicas": "LLM replicas",
  "ocr.cores": "cores",
  "ocr.gpus": "GPUs",
  "ocr.handoff": "Handoff",
  "ocr.budgetSplit": "SLA budget split",

  // ── MIG advisory ─────────────────────────────────────────────────────
  "mig.title": "MIG feasibility hint",
  "mig.fits": "Fits in MIG slice",
  "mig.notFits": "Requires full GPU",

  // ── Errors / loading ─────────────────────────────────────────────────
  "error.title": "Error",
  "error.network": "Network error: unable to reach the backend.",
  "error.retry": "Retry",
  "loading.calculating": "Running calculation…",
};

export default en;
