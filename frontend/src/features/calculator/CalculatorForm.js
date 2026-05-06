import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import { getGPUs, getLLMs, probeHuggingFace } from "../../services/api";
import { useT } from "../../contexts/I18nContext";

// ── Model subtitle from Hugging Face API fields (when description is missing) ──
const getModelSubtitle = (model) => {
  if (model.description) return model.description;
  const parts = [];
  if (model.pipeline_tag) parts.push(model.pipeline_tag);
  if (model.library_name) parts.push(model.library_name);
  if (model.downloads != null) {
    const d =
      model.downloads >= 1e6
        ? (model.downloads / 1e6).toFixed(1) + "M"
        : model.downloads >= 1e3
          ? (model.downloads / 1e3).toFixed(1) + "K"
          : model.downloads;
    parts.push(`${d} downloads`);
  }
  return parts.length ? parts.join(" · ") : null;
};

// ── Spark burst helper for toggle activation ──
const useSparkBurst = () => {
  const containerRef = useRef(null);
  const fire = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const SPARK_COUNT = 8;
    for (let i = 0; i < SPARK_COUNT; i++) {
      const spark = document.createElement("span");
      spark.className = "spark";
      const angle = (360 / SPARK_COUNT) * i + (Math.random() * 30 - 15);
      const dist = 14 + Math.random() * 12;
      const rad = (angle * Math.PI) / 180;
      spark.style.setProperty("--tx", `${Math.cos(rad) * dist}px`);
      spark.style.setProperty("--ty", `${Math.sin(rad) * dist}px`);
      spark.style.left = "50%";
      spark.style.top = "50%";
      el.appendChild(spark);
      setTimeout(() => spark.remove(), 550);
    }
  }, []);
  return { containerRef, fire };
};

// ── Auto-Optimize Toggle Switch with animations ──
const ToggleSwitch = ({ autoMode, setAutoMode }) => {
  const { containerRef, fire } = useSparkBurst();
  const [justActivated, setJustActivated] = useState(false);
  const prevMode = useRef(autoMode);

  useEffect(() => {
    if (autoMode && !prevMode.current) {
      // Just turned ON
      setJustActivated(true);
      fire();
      const t = setTimeout(() => setJustActivated(false), 650);
      return () => clearTimeout(t);
    }
    prevMode.current = autoMode;
  }, [autoMode, fire]);

  return (
    <div className="flex items-center gap-2.5">
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => setAutoMode(!autoMode)}
          className={`relative inline-flex h-8 w-[56px] shrink-0 cursor-pointer rounded-full border-2 transition-all duration-300 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
            autoMode
              ? "bg-accent border-accent toggle-electric"
              : "bg-elevated border-border toggle-shimmer"
          }`}
          title="Auto-Optimize: automatically find the best hardware configuration"
        >
          <span
            className={`pointer-events-none inline-flex h-[28px] w-[28px] items-center justify-center rounded-full bg-surface shadow-card-hover ring-0 transition-all duration-300 ease-[cubic-bezier(0.68,-0.55,0.265,1.55)] ${
              autoMode ? "translate-x-[25px]" : "translate-x-0"
            }`}
          >
            <svg
              className={`w-4 h-4 transition-all duration-200 ${
                autoMode ? "text-accent" : "text-subtle"
              } ${justActivated ? "bolt-zap" : ""} ${autoMode && !justActivated ? "bolt-glow" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </span>
        </button>
      </div>
      <span
        className={`text-sm font-semibold select-none transition-all duration-300 ${
          autoMode ? "text-accent" : "text-subtle"
        }`}
      >
        Auto
      </span>
      <InfoTooltip text="Auto-Optimize: automatically find the best hardware configuration by searching across GPUs, quantization, TP degree, and server layouts." />
    </div>
  );
};

// ── Tooltip bubble rendered via Portal (always on top of everything) ──
const TooltipBubble = ({ text, anchorRef, visible, width = 240 }) => {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (visible && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({
        top: rect.top - 8, // 8px gap above the icon
        left: rect.left + rect.width / 2,
      });
    }
  }, [visible, anchorRef]);

  if (!visible) return null;

  return ReactDOM.createPortal(
    <div
      style={{
        position: "fixed",
        zIndex: 99999,
        top: pos.top,
        left: pos.left,
        transform: "translate(-50%, -100%)",
        width: width,
        pointerEvents: "none",
      }}
    >
      <div className="px-3 py-2 text-xs font-normal text-white bg-fg rounded-lg shadow-elevated text-center leading-relaxed">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-fg" />
      </div>
    </div>,
    document.body,
  );
};

// ── Reusable tooltip wrapper ──
const useTooltip = () => {
  const ref = useRef(null);
  const [show, setShow] = useState(false);
  const onEnter = useCallback(() => setShow(true), []);
  const onLeave = useCallback(() => setShow(false), []);
  return { ref, show, onEnter, onLeave };
};

// ── Info tooltip component (for input labels) ──
const InfoTooltip = ({ text }) => {
  const { ref, show, onEnter, onLeave } = useTooltip();
  return (
    <span
      ref={ref}
      className="inline-flex ml-1.5 align-middle"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <svg
        className="w-4 h-4 text-subtle hover:text-accent cursor-help transition-colors"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <TooltipBubble text={text} anchorRef={ref} visible={show} width={240} />
    </span>
  );
};

// ── Section info tooltip (for section headers) ──
const SectionTooltip = ({ text }) => {
  const { ref, show, onEnter, onLeave } = useTooltip();
  return (
    <span
      ref={ref}
      className="inline-flex ml-2 align-middle"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={(e) => e.stopPropagation()}
    >
      <svg
        className="w-4 h-4 text-current opacity-50 hover:opacity-100 cursor-help transition-opacity"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <TooltipBubble text={text} anchorRef={ref} visible={show} width={256} />
    </span>
  );
};

// ── Agentic / RAG / Tool-use architecture presets (Appendix В.6 / Table В.1) ──
// Each preset sets the four agentic input fields (k_calls, sp_tools, c_rag_static
// + c_rag_dynamic, a_tool). Numbers chosen at the typical midpoint of the
// methodology's recommended range. Reasoning_MRT stays in the Token Budget
// section since it overlaps with non-agentic reasoning workloads.
const AGENTIC_PRESETS = [
  {
    id: "single_turn",
    name: "Single-turn chat",
    description: "1 LLM call per request, no tools, no RAG. Baseline.",
    data: { k_calls: 1, sp_tools: 0, c_rag_static: 0, c_rag_dynamic: 0, a_tool: 0 },
  },
  {
    id: "rag",
    name: "RAG",
    description: "Retrieval-augmented generation: 1-2 calls + ~3K dynamic context per call.",
    data: { k_calls: 2, sp_tools: 100, c_rag_static: 0, c_rag_dynamic: 3000, a_tool: 0 },
  },
  {
    id: "agentic_rag",
    name: "Agentic RAG",
    description: "LLM picks search queries: 3 calls × ~3K context.",
    data: { k_calls: 3, sp_tools: 100, c_rag_static: 0, c_rag_dynamic: 3000, a_tool: 0 },
  },
  {
    id: "cot_sc",
    name: "CoT-SC (self-consistency)",
    description: "Chain-of-thought with 5 sample paths, majority vote.",
    data: { k_calls: 5, sp_tools: 0, c_rag_static: 0, c_rag_dynamic: 0, a_tool: 0 },
  },
  {
    id: "self_refine",
    name: "Self-Refine",
    description: "5-7 iterative refinement calls (critique + revise loop).",
    data: { k_calls: 6, sp_tools: 0, c_rag_static: 0, c_rag_dynamic: 0, a_tool: 0 },
  },
  {
    id: "function_calling",
    name: "Function calling",
    description: "2-3 calls with tool definitions + tool_call responses.",
    data: { k_calls: 3, sp_tools: 400, c_rag_static: 0, c_rag_dynamic: 0, a_tool: 150 },
  },
  {
    id: "react_agent",
    name: "ReAct agent",
    description: "Thought→Action→Observation loop: 5 calls, ~1K tools, ~2K RAG.",
    data: { k_calls: 5, sp_tools: 1000, c_rag_static: 0, c_rag_dynamic: 2000, a_tool: 150 },
  },
  {
    id: "multi_agent",
    name: "Multi-agent system",
    description: "CrewAI / LangGraph: 10 calls between specialized agents.",
    data: { k_calls: 10, sp_tools: 1500, c_rag_static: 0, c_rag_dynamic: 3000, a_tool: 150 },
  },
  {
    id: "coding_agent",
    name: "Coding agent",
    description: "10 calls with rich tool defs and large code context (Cursor / Aider style).",
    data: { k_calls: 10, sp_tools: 2000, c_rag_static: 0, c_rag_dynamic: 6000, a_tool: 350 },
  },
];

// ── Presets ──
const PRESETS = [
  {
    id: "excel_32b_500k",
    name: "32B / 500K users",
    subtitle: "A100 80GB  |  Z = 4",
    description: "Reference example from Excel calculator (MRT=0, 23 servers)",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
        />
      </svg>
    ),
    color: "indigo",
    model: { id: "preset-32b", modelId: "Custom 32B (FP16, L=64, H=4096)" },
    gpu: {
      id: "preset-a100-80",
      vendor: "NVIDIA",
      model: "A100 80GB PCIe",
      full_name: "NVIDIA A100 80GB PCIe",
      memory_gb: 80,
      tflops: 312,
      tdp_watts: "300 W",
      cores: 6912,
    },
    data: {
      internal_users: 500000,
      penetration_internal: 0.1,
      concurrency_internal: 0.05,
      external_users: 0,
      penetration_external: 0.0,
      concurrency_external: 0.0,
      sessions_per_user_J: 1,
      system_prompt_tokens_SP: 1000,
      user_prompt_tokens_Prp: 200,
      reasoning_tokens_MRT: 0,
      answer_tokens_A: 400,
      dialog_turns: 5,
      params_billions: 32,
      bytes_per_param: 2,
      safe_margin: 5.0,
      emp_model: 1.0,
      layers_L: 64,
      hidden_size_H: 4096,
      num_kv_heads: 32,
      num_attention_heads: 32,
      bytes_per_kv_state: 2,
      emp_kv: 1.0,
      max_context_window_TSmax: 32768,
      gpu_mem_gb: 80,
      gpus_per_server: 8,
      kavail: 0.9,
      tp_multiplier_Z: 4,
      saturation_coeff_C: 10.0,
      gpu_flops_Fcount: 312,
      eta_prefill: 0.2,
      eta_decode: 0.15,
      th_prefill_empir: null,
      th_decode_empir: null,
      rps_per_session_R: 0.02,
      sla_reserve_KSLA: 1.25,
    },
  },
  {
    id: "small_7b",
    name: "7B / 2K users",
    subtitle: "A100 80GB  |  Z = 1",
    description: "Small model, low workload",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
      </svg>
    ),
    color: "emerald",
    model: { id: "preset-7b", modelId: "Llama-2 7B (FP16, L=32, H=4096)" },
    gpu: {
      id: "preset-a100-80",
      vendor: "NVIDIA",
      model: "A100 80GB PCIe",
      full_name: "NVIDIA A100 80GB PCIe",
      memory_gb: 80,
      tflops: 312,
      tdp_watts: "300 W",
      cores: 6912,
    },
    data: {
      internal_users: 2000,
      penetration_internal: 0.4,
      concurrency_internal: 0.1,
      external_users: 0,
      penetration_external: 0.0,
      concurrency_external: 0.0,
      sessions_per_user_J: 1,
      system_prompt_tokens_SP: 1000,
      user_prompt_tokens_Prp: 200,
      reasoning_tokens_MRT: 4096,
      answer_tokens_A: 400,
      dialog_turns: 5,
      params_billions: 7,
      bytes_per_param: 2,
      safe_margin: 5.0,
      emp_model: 1.0,
      layers_L: 32,
      hidden_size_H: 4096,
      num_kv_heads: 32,
      num_attention_heads: 32,
      bytes_per_kv_state: 2,
      emp_kv: 1.0,
      max_context_window_TSmax: 32768,
      gpu_mem_gb: 80,
      gpus_per_server: 8,
      kavail: 0.9,
      tp_multiplier_Z: 1,
      saturation_coeff_C: 8.0,
      gpu_flops_Fcount: 312,
      eta_prefill: 0.2,
      eta_decode: 0.15,
      th_prefill_empir: null,
      th_decode_empir: null,
      rps_per_session_R: 0.02,
      sla_reserve_KSLA: 1.25,
    },
  },
  {
    id: "large_70b",
    name: "70B / 10K users",
    subtitle: "H100 80GB  |  Z = 2",
    description: "Large model with reasoning, medium workload",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"
        />
      </svg>
    ),
    color: "amber",
    model: { id: "preset-70b", modelId: "Llama-2 70B (FP16, L=80, H=8192)" },
    gpu: {
      id: "preset-h100-80",
      vendor: "NVIDIA",
      model: "H100 80GB PCIe",
      full_name: "NVIDIA H100 80GB PCIe",
      memory_gb: 80,
      tflops: 756,
      tdp_watts: "350 W",
      cores: 16896,
    },
    data: {
      internal_users: 10000,
      penetration_internal: 0.3,
      concurrency_internal: 0.1,
      external_users: 0,
      penetration_external: 0.0,
      concurrency_external: 0.0,
      sessions_per_user_J: 1,
      system_prompt_tokens_SP: 1000,
      user_prompt_tokens_Prp: 200,
      reasoning_tokens_MRT: 4096,
      answer_tokens_A: 400,
      dialog_turns: 5,
      params_billions: 70,
      bytes_per_param: 2,
      safe_margin: 5.0,
      emp_model: 1.0,
      layers_L: 80,
      hidden_size_H: 8192,
      num_kv_heads: 8,
      num_attention_heads: 64,
      bytes_per_kv_state: 2,
      emp_kv: 1.0,
      max_context_window_TSmax: 32768,
      gpu_mem_gb: 80,
      gpus_per_server: 8,
      kavail: 0.9,
      tp_multiplier_Z: 2,
      saturation_coeff_C: 8.0,
      gpu_flops_Fcount: 756,
      eta_prefill: 0.2,
      eta_decode: 0.15,
      th_prefill_empir: null,
      th_decode_empir: null,
      rps_per_session_R: 0.02,
      sla_reserve_KSLA: 1.25,
    },
  },
];

// ── Optimization Mode Cards ──
const OPTIMIZATION_MODES_GRID = [
  {
    id: "min_servers",
    name: "Min Servers",
    description: "Minimize the number of physical servers",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"
        />
      </svg>
    ),
    color: "blue",
  },
  {
    id: "min_cost",
    name: "Min Cost",
    description: "Minimize total GPU infrastructure cost",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    color: "emerald",
  },
  {
    id: "max_performance",
    name: "Max Performance",
    description: "Maximize throughput per server",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
    color: "amber",
  },
  {
    id: "best_sla",
    name: "Best SLA",
    description: "Minimize end-to-end latency (TTFT + decode)",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    color: "rose",
  },
];

const OPTIMIZATION_MODE_BALANCED = {
  id: "balanced",
  name: "Balanced",
  description: "Best balance of cost, performance & latency",
  icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
      />
    </svg>
  ),
  color: "violet",
};

const CARD_COLOR_MAP = {
  blue: { selected: "border-info bg-info-soft text-info" },
  emerald: { selected: "border-success bg-success-soft text-success" },
  rose: { selected: "border-danger bg-danger-soft text-danger" },
  violet: { selected: "border-accent bg-accent-soft text-accent" },
  amber: { selected: "border-warning bg-warning-soft text-warning" },
  indigo: { selected: "border-accent bg-accent-soft text-accent" },
};

const ALLOWED_DISCRETE = [1, 2, 4, 6, 8];

const INITIAL_FORM_DATA = {
  // Users & behavior (Section 2.1)
  internal_users: 100,
  penetration_internal: 0.1,
  concurrency_internal: 0.2,
  external_users: 0,
  penetration_external: 0.05,
  concurrency_external: 0.1,
  sessions_per_user_J: 1,

  // Tokens (Section 2.2)
  system_prompt_tokens_SP: 1000,
  user_prompt_tokens_Prp: 200,
  reasoning_tokens_MRT: 4096,
  answer_tokens_A: 400,
  dialog_turns: 5,

  // Agentic / RAG / Tool-use overhead (Appendix В) — neutral defaults so
  // single-call workloads behave like before. Set via the Agentic section
  // or one of the architecture presets.
  k_calls: 1,
  sp_tools: 0,
  c_rag_static: 0,
  c_rag_dynamic: 0,
  a_tool: 0,
  // Prefix-cache hit fraction (§3.1 H-5). 0.3 = conservative default for
  // vLLM/SGLang automatic prefix caching (system prompt + tool defs reuse).
  // Adjust higher (0.5–0.8) for stable agent system prompts, lower (0.1) for
  // RAG with highly variable contexts.
  eta_cache: 0.3,

  // Model (Section 3.1)
  params_billions: 7,
  params_active: null, // MoE: active params per token; null = treat as dense (=params_billions)
  bytes_per_param: 2,
  safe_margin: 5.0,
  emp_model: 1.0,
  layers_L: 32,
  hidden_size_H: 4096,

  // KV-cache (Section 3.2)
  num_kv_heads: 32,
  num_attention_heads: 32,
  head_dim: null, // null → backend computes H/N_attn fallback; non-null → universal head_dim formula
  bytes_per_kv_state: 2,
  emp_kv: 1.0,
  max_context_window_TSmax: 32768,

  // Hardware & TP (Section 4)
  gpu_mem_gb: 0, // No GPU selected by default
  gpus_per_server: 8,
  kavail: 0.9,
  tp_multiplier_Z: 1,
  saturation_coeff_C: 8.0,

  // Compute (Section 6)
  gpu_flops_Fcount: null,
  eta_prefill: 0.2,
  eta_decode: 0.15,
  th_prefill_empir: null,
  th_decode_empir: null,

  // SLA (Section 6.4)
  rps_per_session_R: 0.02,
  sla_reserve_KSLA: 1.25,

  // SLA targets (Section 7)
  ttft_sla: 1,
  e2e_latency_sla: 2,
};

const CalculatorForm = ({
  onSubmit,
  loading,
  autoMode,
  setAutoMode,
  optimizeMode,
  setOptimizeMode,
  gpuFilter,
  onOpenGpuFilter,
  onOpenGpuPicker,
  gpuPickerResult,
  onClearGpuPickerResult,
  appliedConfig,
  onAppliedConfigConsumed,
}) => {
  const t = useT();
  // Initial form values based on the SizingInput (Methodology v2)
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);

  // State for model search
  const [modelSearch, setModelSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedModel, setSelectedModel] = useState(null);

  // ── Curated LLM catalog (enterprise fallback for offline/firewalled HF) ──
  // Three-way mode: 'auto' picks HF when reachable, else curated.
  // 'hf' forces HF (errors visibly if down). 'curated' forces local catalog.
  const [llmCatalog, setLlmCatalog] = useState([]);
  const [llmSourceMode, setLlmSourceMode] = useState(
    () => (typeof window !== "undefined" && localStorage.getItem("llmSourceMode")) || "auto",
  );
  // null = "not probed yet"; toggles to true/false after first probe
  const [hfReachable, setHfReachable] = useState(null);

  // State for GPU selection
  const [selectedGpu, setSelectedGpu] = useState(null);

  // State for tracking which sections are expanded in the Advanced tab
  const [expandedSections, setExpandedSections] = useState({
    model: false,
    users: false,
    tokens: false,
    kv: false,
    compute: false,
    sla: false,
    agentic: false,
  });
  const [selectedAgenticPreset, setSelectedAgenticPreset] = useState(null);

  const [activeTab, setActiveTab] = useState("basic"); // 'basic' or 'advanced'
  const [selectedPreset, setSelectedPreset] = useState(null);

  // Load curated LLM catalog from /v1/llms once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resp = await getLLMs({ per_page: 200 });
      if (cancelled) return;
      if (resp && !resp.error && Array.isArray(resp.models)) {
        setLlmCatalog(resp.models);
      } else if (resp && resp.error) {
        console.warn("Failed to load curated LLM catalog:", resp.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Probe HuggingFace reachability once on mount; downstream effective-source
  // logic uses this to decide between HF live and curated fallback.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await probeHuggingFace();
      if (!cancelled) setHfReachable(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist user's chosen source mode across sessions
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("llmSourceMode", llmSourceMode);
    }
  }, [llmSourceMode]);

  // Resolve the *effective* source given user's mode + probe result
  const effectiveLlmSource =
    llmSourceMode === "hf"
      ? "hf"
      : llmSourceMode === "curated"
        ? "curated"
        : hfReachable === false
          ? "curated"
          : "hf"; // 'auto' default to hf if unknown or reachable

  // Load GPU data on component mount
  useEffect(() => {
    const loadGpuData = async () => {
      try {
        await getGPUs({ per_page: 100 });
      } catch (error) {
        console.error("Error loading GPU data:", error);
      }
    };
    loadGpuData();
  }, []);

  // Handle GPU selection (used when applying from modal or elsewhere) — must be before useEffect that uses it
  const handleGpuSelect = useCallback((gpu) => {
    setSelectedGpu(gpu);
    setFormData((prev) => ({
      ...prev,
      gpu_id: gpu.id,
      gpu_mem_gb: gpu.memory_gb,
      gpus_per_server: gpu.recommended_gpus_per_server || 8,
      gpu_flops_Fcount: gpu.tflops ?? prev.gpu_flops_Fcount,
    }));
  }, []);

  // Apply GPU picked from modal (single-selection mode; modal passes full object)
  useEffect(() => {
    if (!gpuPickerResult || !onClearGpuPickerResult) return;
    const gpu = {
      ...gpuPickerResult,
      recommended_gpus_per_server: gpuPickerResult.recommended_gpus_per_server ?? 8,
      memory_size_formatted:
        gpuPickerResult.memory_size_formatted || `${gpuPickerResult.memory_gb} GB`,
    };
    handleGpuSelect(gpu);
    onClearGpuPickerResult();
  }, [gpuPickerResult, onClearGpuPickerResult, handleGpuSelect]);

  // Apply config from Auto-Optimize
  useEffect(() => {
    if (appliedConfig && typeof appliedConfig === "object") {
      // Map applied SizingInput fields onto form data
      const mapped = {};
      const formKeys = Object.keys(formData);
      for (const key of formKeys) {
        if (
          key in appliedConfig &&
          appliedConfig[key] !== null &&
          appliedConfig[key] !== undefined
        ) {
          mapped[key] = appliedConfig[key];
        }
      }
      if (Object.keys(mapped).length > 0) {
        setFormData((prev) => ({ ...prev, ...mapped }));
        // Reconstruct selectedGpu from auto-optimize GPU info if available
        if (appliedConfig._gpuInfo) {
          setSelectedGpu(appliedConfig._gpuInfo);
        }
        // Don't clear selectedModel — LLM model stays the same across configs
      }
      // Signal that we consumed the config
      if (onAppliedConfigConsumed) {
        onAppliedConfigConsumed();
      }
    }
  }, [appliedConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Normalize GPUs per Server and TP (Z) to allowed values: 1, 2, 4, 6, 8
  useEffect(() => {
    setFormData((prev) => {
      const clampToAllowed = (v) => {
        if (ALLOWED_DISCRETE.includes(v)) return v;
        return ALLOWED_DISCRETE.reduce((best, x) =>
          Math.abs(x - v) < Math.abs(best - v) ? x : best,
        );
      };
      const gpu = clampToAllowed(prev.gpus_per_server);
      const tp = clampToAllowed(prev.tp_multiplier_Z);
      if (gpu !== prev.gpus_per_server || tp !== prev.tp_multiplier_Z) {
        return { ...prev, gpus_per_server: gpu, tp_multiplier_Z: tp };
      }
      return prev;
    });
  }, [formData.gpus_per_server, formData.tp_multiplier_Z]);

  const handleChange = (name, value) => {
    const integerFields = [
      "internal_users",
      "external_users",
      "layers_L",
      "hidden_size_H",
      "gpus_per_server",
      "bytes_per_param",
      "bytes_per_kv_state",
      "dialog_turns",
      "tp_multiplier_Z",
      "max_context_window_TSmax",
      "num_kv_heads",
      "num_attention_heads",
      "head_dim",
      "k_calls",
      "sp_tools",
      "c_rag_static",
      "c_rag_dynamic",
      "a_tool",
    ];

    const parsedValue = parseFloat(value) || 0;
    const finalValue = integerFields.includes(name) ? Math.round(parsedValue) : parsedValue;

    setFormData((prev) => ({
      ...prev,
      [name]: finalValue,
    }));
  };

  const buildPayload = () => {
    const payload = { ...formData };
    if (
      payload.gpu_flops_Fcount === null ||
      payload.gpu_flops_Fcount === "" ||
      payload.gpu_flops_Fcount === 0
    ) {
      delete payload.gpu_flops_Fcount;
    }
    // head_dim=0 / null / "" → drop so backend uses the H/N_attn fallback
    if (
      payload.head_dim === null ||
      payload.head_dim === "" ||
      payload.head_dim === 0
    ) {
      delete payload.head_dim;
    }
    // params_active=0 / null / "" → drop so backend treats model as dense
    // (compute uses params_billions for FPS / memory bandwidth math)
    if (
      payload.params_active === null ||
      payload.params_active === "" ||
      payload.params_active === 0
    ) {
      delete payload.params_active;
    }
    // Strip optional MoE / MLA fields when null/0/"" so Pydantic confloat(gt=0)
    // constraints don't reject them. Backend treats absent fields as "not set".
    for (const field of [
      "params_dense",
      "params_moe",
      "n_experts",
      "k_experts",
      "kv_lora_rank",
      "qk_rope_head_dim",
    ]) {
      if (
        payload[field] === null ||
        payload[field] === "" ||
        payload[field] === 0
      ) {
        delete payload[field];
      }
    }
    if (
      payload.th_prefill_empir === null ||
      payload.th_prefill_empir === "" ||
      payload.th_prefill_empir === 0
    ) {
      delete payload.th_prefill_empir;
    }
    if (
      payload.th_decode_empir === null ||
      payload.th_decode_empir === "" ||
      payload.th_decode_empir === 0
    ) {
      delete payload.th_decode_empir;
    }
    if (payload.ttft_sla === null || payload.ttft_sla === "" || payload.ttft_sla === 0) {
      delete payload.ttft_sla;
    }
    if (
      payload.e2e_latency_sla === null ||
      payload.e2e_latency_sla === "" ||
      payload.e2e_latency_sla === 0
    ) {
      delete payload.e2e_latency_sla;
    }
    return payload;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(buildPayload());
  };

  const applyPreset = (preset) => {
    setFormData({
      ...INITIAL_FORM_DATA,
      ...preset.data,
    });
    setSelectedGpu(preset.gpu || null);
    setSelectedModel(preset.model || null);
    setSelectedPreset(preset.id);
    setModelSearch("");
    setSearchResults([]);
  };

  const toggleSection = (sectionKey) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  // Function to search for models on Hugging Face
  // Format curated catalog entries to the same shape HF search returns so
  // the result-row UI doesn't need to branch on source.
  const curatedSearch = (query) => {
    const q = query.toLowerCase();
    return llmCatalog
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.hf_id || "").toLowerCase().includes(q) ||
          (m.family || "").toLowerCase().includes(q) ||
          (m.vendor || "").toLowerCase().includes(q),
      )
      .slice(0, 10)
      .map((m) => ({
        id: m.hf_id || `curated:${m.name}`,
        modelId: m.hf_id || m.name,
        _curated: m, // attach the full catalog entry for handleModelSelect
        downloads: 0,
        likes: 0,
        pipeline_tag: m.architecture,
        library_name: m.vendor,
      }));
  };

  const searchModels = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    // Curated mode (forced or auto-fallback) — local substring search
    if (effectiveLlmSource === "curated") {
      setSearchResults(curatedSearch(query));
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&limit=10`,
      );
      const models = await response.json();

      const relevantModels = models.filter((model) => {
        return (
          model.tags &&
          Array.isArray(model.tags) &&
          (model.tags.includes("transformers") ||
            model.tags.includes("gpt") ||
            model.tags.includes("llama") ||
            model.tags.includes("pytorch") ||
            model.config)
        );
      });

      setSearchResults(relevantModels);
    } catch (error) {
      console.error("Error searching for models:", error);
      // HF unreachable mid-session — fall back to curated even in 'hf'/'auto' mode
      setHfReachable(false);
      setSearchResults(curatedSearch(query));
    } finally {
      setIsSearching(false);
    }
  };

  // State for model warning
  const [modelWarning, setModelWarning] = useState(null);

  // Apply a curated-catalog entry to formData. Sets all known architecture
  // fields directly — no HF call needed. Used both for (a) curated-mode
  // selection and (b) auto-fallback when HF fetch fails in hf/auto mode.
  const applyCuratedModel = (entry) => {
    if (!entry) return;
    const updates = {
      params_billions: entry.params_total_b,
      params_active: entry.is_moe ? entry.params_active_b : null,
      layers_L: entry.layers,
      hidden_size_H: entry.hidden_size,
      num_attention_heads: entry.num_attention_heads,
      num_kv_heads: entry.num_kv_heads,
      head_dim: entry.head_dim,
      max_context_window_TSmax: Math.min(entry.max_context, 131072),
      n_experts: entry.n_experts ?? null,
      k_experts: entry.k_moe ?? null,
      params_dense: entry.params_dense_b ?? null,
      params_moe: entry.params_moe_b ?? null,
      kv_lora_rank: entry.kv_lora_rank ?? null,
      qk_rope_head_dim: entry.qk_rope_head_dim ?? null,
    };
    setFormData((prev) => ({ ...prev, ...updates }));
    if (entry.is_moe && !entry.verified) {
      setModelWarning(
        `Curated entry for ${entry.name} is not verified against HF config.json — re-check params if accuracy matters.`,
      );
    }
  };

  // Handle model selection
  const handleModelSelect = async (model) => {
    setSelectedModel(model);
    setModelSearch("");
    setModelWarning(null);

    // Curated-mode selection: catalog entry was attached to the search
    // result; apply directly without any HF traffic.
    if (model._curated) {
      applyCuratedModel(model._curated);
      return;
    }

    try {
      const modelId = model.modelId || model.id;

      // Fetch HF API metadata (params from safetensors) and the model's
      // config.json (full architecture) in parallel. config.json fetch may
      // 404 for gated/private models — auto-fill is best-effort.
      const [metaResp, configResp] = await Promise.all([
        fetch(`https://huggingface.co/api/models/${modelId}`),
        fetch(`https://huggingface.co/${modelId}/resolve/main/config.json`),
      ]);

      const modelDetails = await metaResp.json();
      let modelConfig = null;
      if (configResp.ok) {
        try {
          modelConfig = await configResp.json();
        } catch {
          /* ignore — config.json may be missing or non-standard */
        }
      }

      const updatedData = { ...formData };

      // ── params_billions: prefer safetensors → cardData tags → name match ──
      if (modelDetails.safetensors && modelDetails.safetensors.parameters) {
        const paramsObj = modelDetails.safetensors.parameters;
        if (paramsObj && typeof paramsObj === "object") {
          const paramCounts = Object.values(paramsObj);
          if (paramCounts.length > 0) {
            const paramCount = paramCounts[0];
            if (typeof paramCount === "number") {
              const paramsInBillions = Math.round((paramCount / 1e9) * 10) / 10;
              if (!isNaN(paramsInBillions) && paramsInBillions > 0) {
                updatedData.params_billions = paramsInBillions;
              }
            }
          }
        }
      }

      if (
        updatedData.params_billions === formData.params_billions &&
        modelDetails.cardData &&
        modelDetails.cardData.tags
      ) {
        const paramTag = modelDetails.cardData.tags.find(
          (tag) => (tag.includes("b") || tag.includes("m")) && !isNaN(tag.replace(/[a-zA-Z]/g, "")),
        );
        if (paramTag) {
          const paramValue = parseFloat(paramTag.replace(/[a-zA-Z]/g, ""));
          if (!isNaN(paramValue)) {
            const unit = paramTag.toLowerCase().includes("b") ? 1 : 0.001;
            updatedData.params_billions = paramValue * unit;
          }
        }
      }

      if (updatedData.params_billions === formData.params_billions) {
        const modelName = modelId.toLowerCase();
        const paramMatch = modelName.match(/(\d+\.?\d*)([b|m])/i);
        if (paramMatch) {
          const paramValue = parseFloat(paramMatch[1]);
          const unit = paramMatch[2].toLowerCase();
          if (unit === "b") {
            updatedData.params_billions = paramValue;
          } else if (unit === "m") {
            updatedData.params_billions = paramValue * 0.001;
          }
        }
      }

      // ── params_active: parse from model name "A<N>B" pattern (Qwen3 convention).
      // Examples: "Qwen3-30B-A3B-Thinking" → 3, "Qwen3-Next-80B-A3B" → 3.
      // Reset on every model select so a non-MoE model picked after an MoE
      // one doesn't carry a stale active-params value.
      updatedData.params_active = null;
      const activeMatch = modelId.match(/-A(\d+(?:\.\d+)?)B\b/i);
      if (activeMatch) {
        const activeVal = parseFloat(activeMatch[1]);
        if (!isNaN(activeVal) && activeVal > 0) {
          updatedData.params_active = activeVal;
        }
      }

      // ── Architecture from config.json — fixes the "Qwen3 doesn't fit"
      // class of errors caused by stale form defaults vs real model spec.
      if (modelConfig) {
        const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

        const layers = num(modelConfig.num_hidden_layers);
        if (layers && layers > 0) updatedData.layers_L = layers;

        const hidden = num(modelConfig.hidden_size);
        if (hidden && hidden > 0) updatedData.hidden_size_H = hidden;

        const nAttn = num(modelConfig.num_attention_heads);
        if (nAttn && nAttn > 0) updatedData.num_attention_heads = nAttn;

        // Older MHA models omit num_key_value_heads → equals num_attention_heads
        const nKv = num(modelConfig.num_key_value_heads) ?? nAttn;
        if (nKv && nKv > 0) updatedData.num_kv_heads = nKv;

        // head_dim: explicit if present (Qwen3, Mistral); else H/N_attn fallback
        const headDim =
          num(modelConfig.head_dim) ??
          (hidden && nAttn && nAttn > 0 ? Math.floor(hidden / nAttn) : null);
        if (headDim && headDim > 0) updatedData.head_dim = headDim;

        const maxCtx = num(modelConfig.max_position_embeddings);
        if (maxCtx && maxCtx > 0) {
          // Cap auto-fill at the form's slider max so the UI stays usable;
          // user can still type a larger value manually if needed.
          updatedData.max_context_window_TSmax = Math.min(maxCtx, 131072);
        }

        // ── MoE: num_experts + num_experts_per_tok ──
        // Reset on every model select so a non-MoE model after an MoE one
        // doesn't carry stale expert counts.
        const nExperts = num(modelConfig.num_experts);
        const kExperts = num(modelConfig.num_experts_per_tok);
        updatedData.n_experts = nExperts ?? null;
        updatedData.k_experts = kExperts ?? null;

        // ── params_dense / params_moe ──
        // Backend activates "MoE detailed" mode (BS-dependent P_effective)
        // only when all four of {params_dense, params_moe, n_experts,
        // k_experts} are set. Compute P_moe from config geometry and derive
        // P_dense = total - P_moe. Keeps the xlsx-faithful statistical
        // coverage formula: P_eff = P_dense + P_moe·(1 − (1 − k/n)^BS).
        updatedData.params_dense = null;
        updatedData.params_moe = null;
        if (nExperts && nExperts > 1 && layers && layers > 0 && hidden && hidden > 0) {
          // Qwen3 uses moe_intermediate_size; Mixtral uses intermediate_size
          // for its expert FFN. Prefer the explicit MoE field when present.
          const moeInter =
            num(modelConfig.moe_intermediate_size) ?? num(modelConfig.intermediate_size);
          if (moeInter && moeInter > 0) {
            const pMoeB = (nExperts * layers * 3 * hidden * moeInter) / 1e9;
            const pDenseB = updatedData.params_billions - pMoeB;
            // Sanity guard: only auto-fill when the arithmetic produces
            // sensible positive values for both. Partial-MoE configs
            // (e.g., DeepSeek V3 keeps the first few layers dense) make
            // the all-layers formula over-estimate P_moe; skip those and
            // let the warning fire instead so the user sets values manually.
            if (pMoeB > 0.5 && pDenseB > 0.5 && pMoeB < updatedData.params_billions) {
              updatedData.params_moe = Math.round(pMoeB * 100) / 100;
              updatedData.params_dense = Math.round(pDenseB * 100) / 100;
            }
          }
        }

        // ── MLA (DeepSeek V2/V3/R1): kv_lora_rank triggers MLA mode in backend ──
        updatedData.kv_lora_rank = num(modelConfig.kv_lora_rank) ?? null;
        updatedData.qk_rope_head_dim = num(modelConfig.qk_rope_head_dim) ?? null;

        // ── MoE warning: experts detected but detailed-mode fields couldn't
        // be derived (non-standard config layout, missing moe_intermediate_size
        // and intermediate_size, etc.). Without detailed-mode fields the
        // backend falls back to params_active (or params_billions for dense),
        // which inflates compute load 5–10× for typical MoE models.
        if (
          updatedData.n_experts &&
          updatedData.n_experts > 1 &&
          !updatedData.params_dense &&
          !updatedData.params_active
        ) {
          setModelWarning(
            `MoE model detected (${updatedData.n_experts} experts, ${updatedData.k_experts || "?"} active per token), ` +
              "but params_dense / params_moe could not be derived from config.json. " +
              "Set params_active manually for accurate compute sizing — otherwise the calc " +
              "treats the model as dense at total params and overstates compute load.",
          );
        }
      }

      setFormData(updatedData);
      setSearchResults([]);
    } catch (error) {
      console.error("Error fetching model details:", error);
      setSelectedModel(model);
      setSearchResults([]);
      // HF fetch failed — try matching to a curated catalog entry by hf_id
      // before falling back to "fill manually". Updates the source-mode
      // probe so subsequent searches use curated automatically.
      const modelId = (model.modelId || model.id || "").toLowerCase();
      const curatedMatch = llmCatalog.find(
        (m) => (m.hf_id || "").toLowerCase() === modelId,
      );
      if (curatedMatch) {
        setHfReachable(false);
        applyCuratedModel(curatedMatch);
        setModelWarning(
          `HuggingFace unreachable — used curated catalog entry for ${curatedMatch.name}. Switch source to 'Curated only' if HF is permanently blocked.`,
        );
      } else {
        setModelWarning(
          "Could not automatically extract model parameters and no curated catalog match found. Please adjust values manually.",
        );
      }
    }
  };

  // Handle search input change with debounce
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setModelSearch(value);

    if (value.length > 2) {
      setTimeout(() => {
        searchModels(value);
      }, 500);
    } else {
      setSearchResults([]);
    }
  };

  // Helper function to render a collapsible section
  const renderCollapsibleSection = (key, title, inputs, isExpanded, tooltip = "") => (
    <div className="bg-elevated rounded-lg border border-border mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => toggleSection(key)}
        className="w-full flex justify-between items-center p-4 text-left text-fg font-medium rounded-lg hover:bg-elevated/70 transition-colors"
      >
        <span className="font-semibold flex items-center">
          {title}
          {tooltip && <SectionTooltip text={tooltip} />}
        </span>
        <svg
          className={`w-5 h-5 transform transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isExpanded ? "max-h-screen opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="p-4 pt-2 border-t border-border">{inputs}</div>
      </div>
    </div>
  );

  // Fields locked when auto-mode is active
  const AUTO_LOCKED_FIELDS = [
    "gpu_mem_gb",
    "gpu_flops_Fcount",
    "gpus_per_server",
    "tp_multiplier_Z",
    "saturation_coeff_C",
    "bytes_per_param",
    "kavail",
  ];

  const isFieldLocked = (name) => autoMode && AUTO_LOCKED_FIELDS.includes(name);

  // Helper function to create slider with text input
  const renderSliderInput = (name, label, min, max, step, value, unit = "", tooltip = "") => {
    const integerFields = [
      "internal_users",
      "external_users",
      "layers_L",
      "hidden_size_H",
      "gpus_per_server",
      "bytes_per_param",
      "bytes_per_kv_state",
      "dialog_turns",
      "tp_multiplier_Z",
      "max_context_window_TSmax",
      "num_kv_heads",
      "num_attention_heads",
    ];

    const isInteger = integerFields.includes(name);
    const disabled = isFieldLocked(name);

    const handleSliderChange = (e) => {
      if (disabled) return;
      const newValue = isInteger ? Math.round(e.target.value) : e.target.value;
      handleChange(name, newValue);
    };

    const handleInputChange = (e) => {
      if (disabled) return;
      let newValue = e.target.value;
      if (newValue !== "") {
        if (isInteger) {
          newValue = Math.round(parseFloat(newValue) || 0);
        } else {
          newValue = parseFloat(newValue) || 0;
        }
        if (!isNaN(newValue)) {
          newValue = Math.min(Math.max(newValue, min), max);
          handleChange(name, newValue);
        }
      } else {
        handleChange(name, 0);
      }
    };

    return (
      <div className={`mb-6 ${disabled ? "opacity-50 pointer-events-none" : ""}`} key={name}>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium text-fg flex items-center">
            {label}
            {disabled && (
              <span className="ml-1.5 text-xs text-warning bg-warning-soft px-1.5 py-0.5 rounded font-normal">
                auto
              </span>
            )}
            {tooltip && <InfoTooltip text={tooltip} />}
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              min={min}
              max={max}
              step={isInteger ? 1 : "any"}
              value={value}
              onChange={handleInputChange}
              disabled={disabled}
              className={`px-2 py-1 text-sm border border-border-strong rounded-md text-right bg-surface text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent ${max >= 1000000 ? "w-28" : "w-20"} ${disabled ? "bg-elevated text-subtle" : ""}`}
              inputMode={isInteger ? "numeric" : "decimal"}
              placeholder="0"
            />
            <span className="text-sm text-muted font-medium">{unit}</span>
          </div>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleSliderChange}
          disabled={disabled}
          className="w-full rounded-lg appearance-none cursor-pointer accent-accent"
        />
        <div className="flex justify-between text-xs text-muted mt-1">
          <span>
            {typeof min === "number" && min >= 1000 ? min.toLocaleString() : min}
            {unit}
          </span>
          <span>
            {typeof max === "number" && max >= 1000 ? max.toLocaleString() : max}
            {unit}
          </span>
        </div>
      </div>
    );
  };

  // Basic configuration inputs
  const basicInputs = (
    <div className="space-y-6">
      <div className="bg-info-soft rounded-lg p-4 border border-info/30">
        <h3 className="text-lg font-medium text-info mb-4 flex items-center">
          {t("form.section.users")}
          <SectionTooltip text="Define the total user base. Fine-tune adoption and concurrency rates in the Advanced tab." />
        </h3>
        {renderSliderInput(
          "internal_users",
          "Total Users",
          0,
          100000,
          100,
          formData.internal_users,
          "",
          "Total number of internal users who may access the AI service. Increase manually past slider max if needed.",
        )}
      </div>

      <div className="bg-success-soft rounded-lg p-4 border border-success/30" data-tour="model-search">
        <h3 className="text-lg font-medium text-success mb-4 flex items-center">
          {t("form.section.model")}
          <SectionTooltip text="Search for a model on Hugging Face to auto-fill architecture parameters, or set them manually in the Advanced tab." />
        </h3>

        {/* Source toggle: Auto / HF live / Curated only */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted font-medium">Data source:</span>
          {[
            { id: "auto", label: t("form.source.auto"), title: "Use HuggingFace if reachable, fall back to curated catalog" },
            { id: "hf", label: t("form.source.hf"), title: "Force HuggingFace; errors visibly when unreachable" },
            { id: "curated", label: t("form.source.curated"), title: "Use bundled curated catalog only — no outbound HF traffic" },
          ].map((opt) => {
            const active = llmSourceMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setLlmSourceMode(opt.id)}
                title={opt.title}
                className={`px-2.5 py-1 rounded-md border transition-all ${
                  active
                    ? "bg-success border-success text-white"
                    : "bg-surface border-border-strong text-fg hover:border-success/50"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
          {/* Effective-source badge */}
          <span
            className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
              effectiveLlmSource === "hf"
                ? "bg-info-soft text-info"
                : "bg-warning-soft text-warning"
            }`}
            title={
              effectiveLlmSource === "hf"
                ? "Currently reading from HuggingFace API"
                : "Currently reading from bundled curated catalog"
            }
          >
            {effectiveLlmSource === "hf" ? "🌐 HuggingFace" : "📁 Curated"}
            {hfReachable === false && llmSourceMode !== "curated" && (
              <span className="ml-1 normal-case opacity-70">(HF unreachable)</span>
            )}
          </span>
        </div>

        {/* Model search */}
        <div className="mb-4 relative">
          <label className="block text-sm font-medium text-fg mb-2 flex items-center">
            {t("form.search.model")}
            <InfoTooltip text="Search Hugging Face to find your model. Parameters like size, layers, and hidden dim will be filled automatically. In 'Curated only' mode searches the bundled catalog instead." />
          </label>
          <input
            type="text"
            value={modelSearch}
            onChange={handleSearchChange}
            placeholder="Search for a model (e.g., llama, gpt, etc.)"
            className="w-full px-3 py-2 border border-border-strong rounded-md shadow-sm bg-surface text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
          />

          {isSearching && (
            <div className="absolute right-3 top-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent"></div>
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-surface border border-border shadow-elevated rounded-md max-h-60 overflow-auto">
              {searchResults.map((model, index) => (
                <div
                  key={index}
                  onClick={() => handleModelSelect(model)}
                  className="px-4 py-2 text-sm text-fg hover:bg-accent-soft cursor-pointer border-b border-border last:border-b-0"
                >
                  <div className="font-medium">{model.modelId || model.id}</div>
                  <div className="text-xs text-muted truncate">
                    {getModelSubtitle(model) || "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedModel && (
          <div className="mt-4 mb-4">
            <div className="p-3 bg-success-soft border-2 border-success/50 rounded-md shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center min-w-0">
                  <svg
                    className="w-5 h-5 text-success mr-2 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-success uppercase tracking-wide mb-0.5">
                      Selected Model
                    </div>
                    <div className="text-sm font-semibold text-fg truncate">
                      {selectedModel.modelId || selectedModel.id}
                    </div>
                  </div>
                </div>
                <a
                  href={`https://huggingface.co/${selectedModel.modelId || selectedModel.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 p-1 rounded-lg hover:bg-warning-soft transition-colors flex-shrink-0"
                  title="Open on Hugging Face"
                >
                  <img src="/huggingface-color.png" alt="Hugging Face" className="w-6 h-6" />
                </a>
              </div>
            </div>

            {modelWarning && (
              <div className="mt-2 p-3 bg-warning-soft border border-warning/30 rounded-md flex justify-between items-start">
                <div className="text-sm text-warning">{modelWarning}</div>
                <button
                  type="button"
                  onClick={() => setModelWarning(null)}
                  className="text-warning hover:text-warning/80"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-accent-soft rounded-lg p-4 border border-accent/30" data-tour="gpu-search">
        <h3 className="text-lg font-medium text-accent mb-4 flex items-center">
          {t("form.section.hardware")}
          <SectionTooltip text="Choose the GPU accelerator and server layout. Memory and TFLOPS are auto-filled from the GPU catalog." />
        </h3>

        {/* GPU Selection with Search — or GPU Filter in autoMode */}
        {autoMode ? (
          <div className="mb-4">
            <label className="block text-sm font-medium text-fg mb-2 flex items-center">
              GPU Selection
              <span className="ml-1.5 text-xs text-warning bg-warning-soft px-1.5 py-0.5 rounded font-normal">
                auto
              </span>
              <InfoTooltip text="In auto-optimize mode GPUs are selected automatically. Use the filter to restrict which GPUs to consider." />
            </label>
            <button
              type="button"
              onClick={onOpenGpuFilter}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-accent/40 rounded-lg text-sm font-medium text-accent hover:bg-accent-soft/80 hover:border-accent/60 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              GPU Filter
              {gpuFilter && gpuFilter.length > 0
                ? ` (${gpuFilter.length} selected)`
                : " (all GPUs)"}
            </button>
          </div>
        ) : (
          <div className="mb-4">
            <label className="block text-sm font-medium text-fg mb-2 flex items-center">
              GPU
              <InfoTooltip text="Open the catalog to choose one GPU. Memory and compute specs will be filled in automatically." />
            </label>
            <button
              type="button"
              onClick={() => onOpenGpuPicker(selectedGpu?.id)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-accent/40 rounded-lg text-sm font-medium text-accent hover:bg-accent-soft/60 hover:border-accent/60 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              {selectedGpu
                ? selectedGpu.full_name || `${selectedGpu.vendor} ${selectedGpu.model}`
                : "Select GPU"}
            </button>
            {selectedGpu && (
              <div className="mt-3 p-3 bg-accent-soft border border-accent/30 rounded-lg">
                <div className="flex items-center">
                  <svg
                    className="w-5 h-5 text-accent mr-2 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-accent uppercase tracking-wide mb-0.5">
                      Selected GPU
                    </div>
                    <div className="text-sm font-semibold text-fg">
                      {selectedGpu.full_name || `${selectedGpu.vendor} ${selectedGpu.model}`}
                      <span className="text-accent font-normal ml-1">
                        ({selectedGpu.memory_size_formatted || `${selectedGpu.memory_gb} GB`})
                        {selectedGpu.tflops ? ` | ${selectedGpu.tflops} TFLOPS` : ""}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {(() => {
          const gpuPerServerAllowed = [1, 2, 4, 6, 8];
          const gpuLocked = isFieldLocked("gpus_per_server");
          const currentVal = formData.gpus_per_server;
          const currentIdx = Math.max(
            0,
            gpuPerServerAllowed.indexOf(currentVal) !== -1
              ? gpuPerServerAllowed.indexOf(currentVal)
              : gpuPerServerAllowed.reduce(
                  (best, v, i) =>
                    Math.abs(v - currentVal) < Math.abs(gpuPerServerAllowed[best] - currentVal)
                      ? i
                      : best,
                  0,
                ),
          );
          const displayVal = gpuPerServerAllowed[currentIdx];
          return (
            <div
              className={`mb-6 ${gpuLocked ? "opacity-50 pointer-events-none" : ""}`}
              key="gpus_per_server"
            >
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-fg flex items-center">
                  GPUs per Server
                  {gpuLocked && (
                    <span className="ml-1.5 text-xs text-warning bg-warning-soft px-1.5 py-0.5 rounded font-normal">
                      auto
                    </span>
                  )}
                  <InfoTooltip text="Number of GPU accelerators installed in each physical server. Allowed: 1, 2, 4, 6, 8." />
                </label>
                <div className="flex items-center space-x-2">
                  <span
                    className={`px-2 py-1 text-sm border border-border-strong rounded-md text-right w-20 inline-block text-center font-medium ${gpuLocked ? "bg-elevated text-subtle" : "bg-surface text-fg"}`}
                  >
                    {displayVal}
                  </span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={gpuPerServerAllowed.length - 1}
                step={1}
                value={currentIdx}
                onChange={(e) =>
                  !gpuLocked &&
                  handleChange("gpus_per_server", gpuPerServerAllowed[parseInt(e.target.value)])
                }
                disabled={gpuLocked}
                className="w-full rounded-lg appearance-none cursor-pointer accent-accent"
              />
              <div className="flex justify-between text-xs text-muted mt-1">
                <span>{gpuPerServerAllowed[0]}</span>
                <span>{gpuPerServerAllowed[gpuPerServerAllowed.length - 1]}</span>
              </div>
            </div>
          );
        })()}
        {renderSliderInput(
          "kavail",
          "Usable Memory Fraction",
          0.5,
          1.0,
          0.01,
          formData.kavail,
          "",
          "Fraction of GPU memory available after OS/driver overhead. Typically 0.85–0.95.",
        )}
      </div>

      <div className="bg-warning-soft rounded-lg p-4 border border-warning/30">
        <h3 className="text-lg font-medium text-warning mb-4 flex items-center">
          Tensor Parallelism
          <SectionTooltip text="Tensor parallelism splits one model across multiple GPUs, increasing available memory per instance." />
        </h3>
        {(() => {
          const tpAllowed = [1, 2, 4, 6, 8];
          const tpLocked = isFieldLocked("tp_multiplier_Z");
          const currentIdx = Math.max(
            0,
            tpAllowed.indexOf(formData.tp_multiplier_Z) !== -1
              ? tpAllowed.indexOf(formData.tp_multiplier_Z)
              : tpAllowed.reduce(
                  (best, v, i) =>
                    Math.abs(v - formData.tp_multiplier_Z) <
                    Math.abs(tpAllowed[best] - formData.tp_multiplier_Z)
                      ? i
                      : best,
                  0,
                ),
          );
          return (
            <div className={`mb-6 ${tpLocked ? "opacity-50 pointer-events-none" : ""}`}>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-fg flex items-center">
                  TP Degree (Z)
                  {tpLocked && (
                    <span className="ml-1.5 text-xs text-warning bg-warning-soft px-1.5 py-0.5 rounded font-normal">
                      auto
                    </span>
                  )}
                  <InfoTooltip text="Number of GPUs across which the model is split. Z=1 means no parallelism; higher even values increase memory per instance but add inter-GPU communication." />
                </label>
                <div className="flex items-center space-x-2">
                  <span
                    className={`px-2 py-1 text-sm border border-border-strong rounded-md text-right w-20 inline-block text-center font-medium ${tpLocked ? "bg-elevated text-subtle" : "bg-surface text-fg"}`}
                  >
                    {formData.tp_multiplier_Z}
                  </span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={tpAllowed.length - 1}
                step={1}
                value={currentIdx}
                onChange={(e) =>
                  !tpLocked && handleChange("tp_multiplier_Z", tpAllowed[parseInt(e.target.value)])
                }
                disabled={tpLocked}
                className="w-full rounded-lg appearance-none cursor-pointer accent-accent"
              />
              <div className="flex justify-between text-xs text-muted mt-1">
                <span>{tpAllowed[0]}</span>
                <span>{tpAllowed[tpAllowed.length - 1]}</span>
              </div>
            </div>
          );
        })()}
        {renderSliderInput(
          "saturation_coeff_C",
          "Saturation Coefficient",
          1,
          32,
          1,
          formData.saturation_coeff_C,
          "",
          "Controls diminishing returns of batch processing. Higher C = throughput saturates at larger batch sizes.",
        )}
      </div>

      <div className="bg-warning-soft rounded-lg p-4 border border-warning/30" data-tour="sla-targets">
        <h3 className="text-lg font-medium text-warning mb-4 flex items-center">
          {t("form.section.sla")}
          <SectionTooltip text="Time To First Token (TTFT) and end-to-end latency limits used to validate the configuration against your service-level requirements." />
        </h3>
        {renderSliderInput(
          "ttft_sla",
          "TTFT Target (SLA)",
          0,
          60,
          0.5,
          formData.ttft_sla ?? 1,
          "sec",
          "Maximum acceptable Time To First Token (seconds). Set to 0 to skip this check.",
        )}
        {renderSliderInput(
          "e2e_latency_sla",
          "e2e Latency Target (SLA)",
          0,
          1000,
          1,
          formData.e2e_latency_sla ?? 2,
          "sec",
          "Maximum acceptable end-to-end latency (seconds). Set to 0 to skip this check.",
        )}
      </div>
    </div>
  );

  // Advanced configuration inputs
  const advancedInputs = (
    <div className="space-y-6">
      {/* Model Section */}
      {renderCollapsibleSection(
        "model",
        "Model Architecture",
        <>
          {renderSliderInput(
            "params_billions",
            "Parameters (total)",
            0.1,
            200,
            0.1,
            formData.params_billions,
            "B",
            "Total number of trainable parameters in the model (in billions). Used for memory sizing — full weights must fit in GPU memory.",
          )}
          {renderSliderInput(
            "params_active",
            "Parameters (active, MoE)",
            0,
            200,
            0.1,
            formData.params_active || 0,
            "B",
            "MoE only: parameters activated per token. Auto-filled from model name pattern (e.g., 'Qwen3-30B-A3B' → 3). For Mixtral-8x7B set to ~13. Leave 0 for dense models — backend treats as dense at total params. Wrong value here drives a runaway in §6.4 server count.",
          )}
          {renderSliderInput(
            "bytes_per_param",
            "Precision (bytes/param)",
            1,
            4,
            0.5,
            formData.bytes_per_param,
            "",
            "Bytes per parameter after quantization. FP16 = 2, INT8 = 1, FP32 = 4.",
          )}
          {renderSliderInput(
            "safe_margin",
            "Safe Margin (SM)",
            0,
            20,
            0.5,
            formData.safe_margin,
            "GiB",
            "Fixed memory reserve for framework buffers, CUDA graphs, memory fragmentation, etc. Default 5 GiB.",
          )}
          {renderSliderInput(
            "emp_model",
            "Empirical Correction",
            1.0,
            1.5,
            0.01,
            formData.emp_model,
            "",
            "Empirical correction factor if measured model memory differs from the theoretical estimate.",
          )}
          {renderSliderInput(
            "layers_L",
            "Transformer Layers",
            1,
            128,
            1,
            formData.layers_L,
            "",
            "Number of transformer blocks in the model (e.g. 32 for 7B, 80 for 70B).",
          )}
          {renderSliderInput(
            "hidden_size_H",
            "Hidden Dimension",
            512,
            16384,
            256,
            formData.hidden_size_H,
            "",
            "Size of the hidden representation (embedding dimension). Found in model config as hidden_size.",
          )}
        </>,
        expandedSections.model,
        "Core architecture parameters that determine the model's memory footprint on GPU.",
      )}

      {/* Users & Behavior */}
      {renderCollapsibleSection(
        "users",
        "User Behavior",
        <>
          {renderSliderInput(
            "penetration_internal",
            "Adoption Rate",
            0,
            1,
            0.01,
            formData.penetration_internal,
            "",
            "Fraction of total users who actively use the AI service. 0.1 = 10% adoption.",
          )}
          {renderSliderInput(
            "concurrency_internal",
            "Concurrency Rate",
            0,
            1,
            0.01,
            formData.concurrency_internal,
            "",
            "Fraction of active users sending requests at the same time. 0.05 = 5% concurrency.",
          )}
          {renderSliderInput(
            "sessions_per_user_J",
            "Sessions per User",
            1,
            10,
            1,
            formData.sessions_per_user_J,
            "",
            "Average number of parallel chat sessions each active user keeps open.",
          )}
        </>,
        expandedSections.users,
        "Controls how many users are active simultaneously and how they generate load.",
      )}

      {/* Tokens Section */}
      {renderCollapsibleSection(
        "tokens",
        "Token Budget",
        <>
          {renderSliderInput(
            "system_prompt_tokens_SP",
            "System Prompt",
            0,
            10000,
            100,
            formData.system_prompt_tokens_SP,
            "tok",
            "Tokens in the system prompt — instructions and context prepended to every request.",
          )}
          {renderSliderInput(
            "user_prompt_tokens_Prp",
            "User Message",
            0,
            5000,
            10,
            formData.user_prompt_tokens_Prp,
            "tok",
            "Average number of tokens in a single user message.",
          )}
          {renderSliderInput(
            "reasoning_tokens_MRT",
            "Reasoning Tokens",
            0,
            16384,
            256,
            formData.reasoning_tokens_MRT,
            "tok",
            "Token budget for chain-of-thought / reasoning. Set to 0 if the model does not use reasoning.",
          )}
          {renderSliderInput(
            "answer_tokens_A",
            "Response Length",
            0,
            5000,
            10,
            formData.answer_tokens_A,
            "tok",
            "Average number of tokens the model generates per response.",
          )}
          {renderSliderInput(
            "dialog_turns",
            "Dialog Turns",
            1,
            20,
            1,
            formData.dialog_turns,
            "",
            "Number of user↔model turns in a typical conversation session.",
          )}
        </>,
        expandedSections.tokens,
        "Token counts that define a typical request and conversation. These determine memory and compute requirements.",
      )}

      {/* Agentic / RAG / Tool-Use Section */}
      {renderCollapsibleSection(
        "agentic",
        "Agentic / RAG / Tool-Use",
        <>
          {/* Architecture pattern presets — Appendix В Table В.1 */}
          <div>
            <label className="block text-xs font-medium text-muted mb-2">
              Architecture pattern
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {AGENTIC_PRESETS.map((preset) => {
                const isActive = selectedAgenticPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({ ...prev, ...preset.data }));
                      setSelectedAgenticPreset(preset.id);
                    }}
                    title={preset.description}
                    className={`text-left px-2.5 py-1.5 rounded-md border text-xs transition-all ${
                      isActive
                        ? "bg-accent border-accent text-accent-fg shadow-card"
                        : "bg-surface border-border text-fg hover:border-accent/40 hover:bg-accent-soft"
                    }`}
                  >
                    <span className="font-semibold leading-tight">{preset.name}</span>
                    <span
                      className={`block text-[10px] mt-0.5 ${
                        isActive ? "opacity-80" : "text-muted"
                      }`}
                    >
                      k={preset.data.k_calls}
                      {preset.data.sp_tools ? `, tools=${preset.data.sp_tools}` : ""}
                      {preset.data.c_rag_dynamic ? `, rag=${preset.data.c_rag_dynamic}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {renderSliderInput(
            "k_calls",
            "K_calls (LLM calls per request)",
            1,
            20,
            1,
            formData.k_calls,
            "",
            "Number of LLM calls per user request. 1=single-turn / RAG. 3-10=ReAct, Self-Refine. 6-20=multi-agent. Multiplies request rate (R_eff = R × K_calls).",
          )}
          {renderSliderInput(
            "sp_tools",
            "Tool definitions",
            0,
            5000,
            50,
            formData.sp_tools,
            "tok",
            "Tokens for tool definitions added to system prompt (Appendix В.1). 0=no tools. ReAct typically 500-2000. Coding agent 1000-3000.",
          )}
          {renderSliderInput(
            "c_rag_static",
            "RAG context (static)",
            0,
            10000,
            100,
            formData.c_rag_static,
            "tok",
            "Static RAG context loaded once per session (Appendix В.1). E.g., a long document the agent reasons over.",
          )}
          {renderSliderInput(
            "c_rag_dynamic",
            "RAG context (dynamic)",
            0,
            10000,
            100,
            formData.c_rag_dynamic,
            "tok",
            "Dynamic RAG context fetched per call (Appendix В.2). Typical 500-5000 per retrieval.",
          )}
          {renderSliderInput(
            "a_tool",
            "Tool-call response tokens",
            0,
            1000,
            10,
            formData.a_tool,
            "tok",
            "Extra response tokens for tool_call JSON (Appendix В.3). Typical 50-200 for function-calling, 200-500 for coding agents.",
          )}
          {renderSliderInput(
            "eta_cache",
            "Prefix cache hit (η_cache)",
            0,
            1,
            0.05,
            formData.eta_cache,
            "",
            "Fraction of prefill served from prefix-cache (§3.1 H-5). 0 = no caching. 0.3 = vLLM/SGLang auto prefix-cache default. 0.5–0.8 for stable agent prompts. 0.1–0.3 for RAG with variable context.",
          )}

          {/* Effective values preview */}
          <div className="mt-3 p-3 rounded-lg bg-accent-soft border border-accent/30">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent mb-2">
              Effective values applied to sizing
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono text-fg">
              <div>
                SP_eff ={" "}
                <span className="text-accent font-semibold">
                  {(formData.system_prompt_tokens_SP || 0) + (formData.sp_tools || 0) + (formData.c_rag_static || 0)}
                </span>{" "}
                tok
              </div>
              <div>
                Prp_eff ={" "}
                <span className="text-accent font-semibold">
                  {(formData.user_prompt_tokens_Prp || 0) + (formData.c_rag_dynamic || 0)}
                </span>{" "}
                tok
              </div>
              <div>
                A_eff ={" "}
                <span className="text-accent font-semibold">
                  {(formData.answer_tokens_A || 0) + (formData.a_tool || 0)}
                </span>{" "}
                tok
              </div>
              <div>
                R_eff ={" "}
                <span className="text-accent font-semibold">
                  {((formData.rps_per_session_R || 0) * (formData.k_calls || 1)).toFixed(4)}
                </span>{" "}
                req/s
              </div>
              <div className="col-span-2">
                TS_agent ={" "}
                <span className="text-accent font-semibold">
                  {((formData.system_prompt_tokens_SP || 0) +
                    (formData.sp_tools || 0) +
                    (formData.c_rag_static || 0) +
                    (formData.dialog_turns || 0) *
                      (formData.k_calls || 1) *
                      ((formData.user_prompt_tokens_Prp || 0) +
                        (formData.c_rag_dynamic || 0) +
                        (formData.reasoning_tokens_MRT || 0) +
                        (formData.answer_tokens_A || 0) +
                        (formData.a_tool || 0))).toLocaleString()}
                </span>{" "}
                tok &nbsp;
                <span className="text-muted">
                  (full session, drives KV-cache via SL = min(TS, max_context))
                </span>
              </div>
            </div>
            <p className="text-[10px] text-muted mt-2 leading-snug">
              These derive from your token + agentic inputs. Backend recomputes them per
              §2.2 / Appendix В when you Calculate — no need to re-enter values manually.
            </p>
          </div>
        </>,
        expandedSections.agentic,
        "Multi-call architectures: ReAct, RAG, function calling, multi-agent. Sets K_calls, tool overhead, and RAG context. Reduces to single-turn at K_calls=1 with all overheads at 0.",
      )}

      {/* KV-Cache Section */}
      {renderCollapsibleSection(
        "kv",
        "KV-Cache",
        <>
          {renderSliderInput(
            "num_kv_heads",
            "KV Heads (Nkv)",
            1,
            128,
            1,
            formData.num_kv_heads,
            "",
            "Number of KV-cache heads. For GQA/MQA architectures this is less than attention heads (e.g. 8 for Llama-2 70B).",
          )}
          {renderSliderInput(
            "num_attention_heads",
            "Attention Heads (Nattention)",
            1,
            128,
            1,
            formData.num_attention_heads,
            "",
            "Number of attention heads in the transformer. Found in model config as num_attention_heads.",
          )}
          {renderSliderInput(
            "head_dim",
            "Head Dim",
            0,
            256,
            1,
            formData.head_dim || 0,
            "",
            "Per-head dimension. For most models head_dim = hidden_size / num_attention_heads, but Qwen3, Mistral, and some others use a non-standard value. Leave at 0 to fall back to H/Nattention; set explicitly when the model config specifies head_dim.",
          )}
          {renderSliderInput(
            "bytes_per_kv_state",
            "KV Precision (bytes)",
            1,
            4,
            0.5,
            formData.bytes_per_kv_state,
            "",
            "Bytes per KV-cache element. FP16 = 2, INT8 = 1. Lower values save memory per session.",
          )}
          {renderSliderInput(
            "emp_kv",
            "KV Empirical Factor",
            1.0,
            1.5,
            0.01,
            formData.emp_kv,
            "",
            "Empirical correction if measured KV-cache size differs from theoretical estimate.",
          )}
          {renderSliderInput(
            "max_context_window_TSmax",
            "Max Context Length",
            1024,
            131072,
            1024,
            formData.max_context_window_TSmax,
            "tok",
            "Maximum sequence length (context window) the model supports, in tokens.",
          )}
        </>,
        expandedSections.kv,
        "Key-Value cache stores attention states for each session. Larger contexts and more sessions require more GPU memory.",
      )}

      {/* Compute Section */}
      {renderCollapsibleSection(
        "compute",
        "Compute & Throughput",
        <>
          {renderSliderInput(
            "gpu_flops_Fcount",
            "GPU Performance",
            0,
            2000,
            10,
            formData.gpu_flops_Fcount || 0,
            "TFLOPS",
            "Peak half-precision (FP16/BF16) TFLOPS of the selected GPU. Auto-filled from GPU catalog.",
          )}
          {renderSliderInput(
            "eta_prefill",
            "Prefill Efficiency",
            0.05,
            0.5,
            0.01,
            formData.eta_prefill,
            "",
            "GPU utilization during the prefill phase (processing the prompt). Typically 0.15–0.30.",
          )}
          {renderSliderInput(
            "eta_decode",
            "Decode Efficiency",
            0.05,
            0.5,
            0.01,
            formData.eta_decode,
            "",
            "GPU utilization during the decode phase (generating tokens). Typically 0.10–0.20.",
          )}
          <div className="text-xs text-muted mb-4 p-2 bg-info-soft rounded flex items-center">
            <svg
              className="w-4 h-4 mr-1.5 text-info flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            If you have benchmark data, set measured throughput below to override analytical
            estimates.
          </div>
          {renderSliderInput(
            "th_prefill_empir",
            "Measured Prefill Speed",
            0,
            100000,
            100,
            formData.th_prefill_empir || 0,
            "tok/s",
            "Actual measured prefill throughput from benchmarks. Overrides analytical calculation when set.",
          )}
          {renderSliderInput(
            "th_decode_empir",
            "Measured Decode Speed",
            0,
            100000,
            100,
            formData.th_decode_empir || 0,
            "tok/s",
            "Actual measured decode throughput from benchmarks. Overrides analytical calculation when set.",
          )}
        </>,
        expandedSections.compute,
        "GPU compute capacity and throughput estimation. Determines how many requests each server can handle.",
      )}

      {/* SLA Section */}
      {renderCollapsibleSection(
        "sla",
        "SLA & Load",
        <>
          {renderSliderInput(
            "rps_per_session_R",
            "Request Rate",
            0.001,
            1,
            0.001,
            formData.rps_per_session_R,
            "",
            "Average requests per second generated by each active session. A typical chat session ≈ 0.02 req/s.",
          )}
          {renderSliderInput(
            "sla_reserve_KSLA",
            "SLA Headroom",
            1,
            3,
            0.05,
            formData.sla_reserve_KSLA,
            "",
            "Safety multiplier to ensure capacity meets SLA targets. 1.25 = 25% extra headroom.",
          )}
        </>,
        expandedSections.sla,
        "Service-level parameters that add safety margin to the final server count.",
      )}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="gap-6 flex flex-col flex-1">
      {/* Header with toggle switch */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-lg sm:text-2xl font-semibold text-fg min-w-0 truncate">
          Configuration Parameters
        </h2>
        <div data-tour="auto-optimize" className="shrink-0">
          <ToggleSwitch autoMode={autoMode} setAutoMode={setAutoMode} />
        </div>
      </div>

      {/* Presets (normal mode) or Optimization Mode cards (auto mode) */}
      {autoMode ? (
        <div className="mb-2" data-tour="optimize-mode">
          <label className="block text-sm font-medium text-muted mb-2">Optimization Mode</label>
          <div className="grid grid-cols-2 gap-2">
            {OPTIMIZATION_MODES_GRID.map((mode) => {
              const isSelected = optimizeMode === mode.id;
              const colors = CARD_COLOR_MAP[mode.color];
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setOptimizeMode(mode.id)}
                  className={`p-2.5 rounded-lg border-2 text-left transition-all duration-200 ${
                    isSelected
                      ? `${colors.selected} border-current shadow-card`
                      : "border-border text-muted hover:border-border-strong hover:bg-elevated"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    {mode.icon}
                    <span className="text-sm font-semibold">{mode.name}</span>
                  </div>
                  <p className="text-xs opacity-75 leading-relaxed">{mode.description}</p>
                </button>
              );
            })}
          </div>
          {(() => {
            const mode = OPTIMIZATION_MODE_BALANCED;
            const isSelected = optimizeMode === mode.id;
            const colors = CARD_COLOR_MAP[mode.color];
            return (
              <button
                type="button"
                onClick={() => setOptimizeMode(mode.id)}
                className={`mt-2 w-full p-2.5 rounded-lg border-2 text-left transition-all duration-200 ${
                  isSelected
                    ? `${colors.selected} border-current shadow-card`
                    : "border-border text-muted hover:border-border-strong hover:bg-elevated"
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  {mode.icon}
                  <span className="text-sm font-semibold">{mode.name}</span>
                  <span className="ml-auto text-xs opacity-50">recommended</span>
                </div>
                <p className="text-xs opacity-75 leading-relaxed">{mode.description}</p>
              </button>
            );
          })()}
        </div>
      ) : (
        <div className="mb-2" data-tour="presets">
          <label className="block text-sm font-medium text-muted mb-2">{t("form.preset.select")}</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {PRESETS.map((preset) => {
              const isActive = selectedPreset === preset.id;
              const colors = CARD_COLOR_MAP[preset.color] || CARD_COLOR_MAP.indigo;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  title={preset.description}
                  className={`p-2.5 rounded-lg border-2 text-left transition-all duration-200 ${
                    isActive
                      ? `${colors.selected} border-current shadow-card`
                      : "border-border text-muted hover:border-border-strong hover:bg-elevated"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    {preset.icon}
                    <span className="text-sm font-semibold leading-tight">{preset.name}</span>
                  </div>
                  <p className="text-xs opacity-60 leading-snug">{preset.subtitle}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-border">
        <button
          type="button"
          data-tour="basic-tab"
          className={`py-2 px-4 font-medium text-sm ${
            activeTab === "basic"
              ? "text-accent border-b-2 border-accent"
              : "text-muted hover:text-fg"
          }`}
          onClick={() => setActiveTab("basic")}
        >
          Basic Configuration
        </button>
        <button
          type="button"
          data-tour="advanced-tab"
          className={`py-2 px-4 font-medium text-sm ${
            activeTab === "advanced"
              ? "text-fg border-b-2 border-fg bg-elevated"
              : "text-subtle hover:text-fg bg-elevated"
          }`}
          onClick={() => setActiveTab("advanced")}
        >
          Advanced
        </button>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "basic" && basicInputs}
        {activeTab === "advanced" && advancedInputs}
      </div>

      {/* Calculate / Find Best Configs button */}
      <button
        type="submit"
        data-tour="calculate-btn"
        disabled={loading}
        className={`mt-auto w-full py-3 px-4 rounded-lg font-semibold text-lg transition-colors text-accent-fg ${
          loading
            ? "bg-accent/60 cursor-not-allowed"
            : "bg-accent hover:bg-accent/90 calc-btn-glow"
        }`}
      >
        {loading ? (
          <span className="flex items-center justify-center">
            <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-current mr-2"></span>
            {autoMode ? "Searching configurations..." : t("form.calculating")}
          </span>
        ) : autoMode ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            Find Best Configs
          </span>
        ) : (
          t("form.calculate")
        )}
      </button>
    </form>
  );
};

export default CalculatorForm;
