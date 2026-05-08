import React from "react";
import { render, screen } from "@testing-library/react";
import OCRResultsDisplay from "./OCRResultsDisplay";

jest.mock("recharts", () => {
  const React = require("react");
  return {
    PieChart: ({ children }) => <div data-testid="pie-chart">{children}</div>,
    Pie: ({ children }) => <div data-testid="pie">{children}</div>,
    Cell: () => <span data-testid="pie-cell" />,
    ResponsiveContainer: ({ children }) => <div data-testid="responsive">{children}</div>,
    Tooltip: () => <div data-testid="chart-tooltip" />,
  };
});

const baseGpuResults = {
  pipeline_used: "ocr_gpu",
  t_ocr: 0.15,
  eta_ocr_used: 0.85,
  r_ocr_used: 8.0,
  n_ocr_cores_used: null,
  n_gpu_ocr_online: 1,
  l_text: 857,
  sl_pf_llm: 1857,
  sl_pf_llm_eff: 1857,
  sl_dec_llm: 1000,
  t_llm_target: 4.85,
  t_handoff_used: 0.0,
  model_mem_gb: 14,
  kv_per_session_gb: 0.4,
  gpus_per_instance: 1,
  s_tp_z: 8,
  instance_total_mem_gb: 80,
  gpu_tflops_used: 312,
  th_pf_llm: 1500,
  th_dec_llm: 280,
  bs_real_star: 6,
  sla_pass: true,
  sla_page_target: 5.0,
  n_repl_llm: 1,
  n_gpu_llm_online: 4,
  n_gpu_total_online: 5,
  n_servers_total_online: 1,
  gpus_per_server: 8,
};

describe("OCRResultsDisplay", () => {
  it("renders empty state when no results", () => {
    render(<OCRResultsDisplay results={null} loading={false} error={null} />);
    expect(screen.getByText("No results yet")).toBeInTheDocument();
  });

  it("renders loading spinner", () => {
    render(<OCRResultsDisplay results={null} loading error={null} />);
    expect(screen.getByText(/Calculating OCR \+ LLM sizing/i)).toBeInTheDocument();
  });

  it("renders ocr_gpu pool breakdown and PASS SLA", () => {
    render(<OCRResultsDisplay results={baseGpuResults} loading={false} error={null} />);

    expect(screen.getByText("Infrastructure Required")).toBeInTheDocument();
    expect(screen.getByText("PASS")).toBeInTheDocument();
    // OCR + LLM pool subtitle
    expect(screen.getByText(/OCR pool: 1 · LLM pool: 4/)).toBeInTheDocument();
    // SLA detail with t_OCR breakdown
    expect(
      screen.getByText(/t_OCR 0\.15s · LLM budget 4\.85s · target 5\.00s/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("pie-chart")).toBeInTheDocument();
  });

  it("renders ocr_cpu pipeline with CPU pool indicator", () => {
    const cpuResults = {
      ...baseGpuResults,
      pipeline_used: "ocr_cpu",
      n_gpu_ocr_online: 0,
      n_ocr_cores_used: 16,
      eta_ocr_used: null,
      r_ocr_used: null,
      n_gpu_total_online: 4,
    };
    render(<OCRResultsDisplay results={cpuResults} loading={false} error={null} />);

    expect(screen.getByText(/OCR on CPU/i)).toBeInTheDocument();
    expect(screen.getByText("CPU")).toBeInTheDocument();
    expect(screen.getByText(/16 cores/)).toBeInTheDocument();
  });
});
