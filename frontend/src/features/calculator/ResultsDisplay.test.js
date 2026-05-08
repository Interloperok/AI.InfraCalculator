import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ResultsDisplay from "./ResultsDisplay";
import { downloadReport } from "../../services/api";

jest.mock("../../services/api", () => ({
  downloadReport: jest.fn(),
}));

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

const baseResults = {
  instance_total_mem_gb: 640,
  model_mem_gb: 128,
  kv_free_per_instance_tp_gb: 384,
  cost_estimate_usd: 125000,
  Ssim_concurrent_sessions: 560,
  TS_session_context: 8192,
  servers_final: 12,
  servers_by_memory: 10,
  servers_by_compute: 12,
  sessions_per_server: 112,
  instances_per_server_tp: 2,
  S_TP_z: 56,
  th_server_comp: 3.8,
  th_prefill: 3210,
  th_decode: 980,
  gpus_per_server: 8,
  gpus_per_instance: 1,
  gpus_per_instance_tp: 2,
  total_gpu_count: 96,
  ttft_analyt: 0.92,
  ttft_sla_target: 1.0,
  ttft_sla_pass: true,
  e2e_latency_analyt: 1.8,
  e2e_latency_sla_target: 2.0,
  e2e_latency_sla_pass: true,
  sla_passed: true,
  sla_recommendations: [],
  T_tokens_per_request: 1600,
  SL_sequence_length: 4000,
  kv_per_session_gb: 3.9,
  kv_free_per_instance_gb: 220,
  Kbatch_tokens_per_batch: 9.3,
  S_TP_base: 1,
  gpu_tflops_used: 312,
  Fcount_model_tflops: 65.5,
  FPS_flops_per_token: 31300,
  Tdec_tokens: 400,
  Cmodel_rps: 1.9,
};

describe("ResultsDisplay", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders loading state", () => {
    render(<ResultsDisplay results={null} loading error={null} inputData={null} />);

    expect(screen.getByText("Calculating server requirements...")).toBeInTheDocument();
  });

  it("renders warning and empty states", () => {
    const { rerender } = render(
      <ResultsDisplay results={null} loading={false} error="Sizing warning" inputData={null} />,
    );
    expect(screen.getByText("Sizing warning")).toBeInTheDocument();

    rerender(<ResultsDisplay results={null} loading={false} error={null} inputData={null} />);
    expect(screen.getByText("No results yet")).toBeInTheDocument();
  });

  it("renders detailed results, switches tabs, and downloads report", async () => {
    downloadReport.mockResolvedValueOnce({ success: true });
    const inputData = { params_billions: 70 };

    render(
      <ResultsDisplay results={baseResults} loading={false} error={null} inputData={inputData} />,
    );

    expect(screen.getByText("Calculation Results")).toBeInTheDocument();
    expect(screen.getByText("Infrastructure Required")).toBeInTheDocument();
    expect(screen.getByText(/96 GPUs/i)).toBeInTheDocument(); // total_gpu_count
    expect(screen.getByText("SLA Validation")).toBeInTheDocument();
    expect(screen.getByTestId("pie-chart")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Compute Path" }));
    expect(screen.getByText("Server Throughput (Th_server)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Download Excel Report/i }));
    await waitFor(() => expect(downloadReport).toHaveBeenCalledWith(inputData));
  });

  it("shows backend message when report generation returns error payload", async () => {
    downloadReport.mockResolvedValueOnce({ error: "Template is missing" });

    render(
      <ResultsDisplay
        results={{ ...baseResults, sla_passed: false, sla_recommendations: ["Increase TP"] }}
        loading={false}
        error={null}
        inputData={{ params_billions: 13 }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Download Excel Report/i }));
    expect(await screen.findByText("Template is missing")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("SLA notifications"));
    expect(screen.getByText("SLA Notifications")).toBeInTheDocument();
    expect(screen.getByText("Increase TP")).toBeInTheDocument();
  });

  it("handles report download exceptions", async () => {
    downloadReport.mockRejectedValueOnce(new Error("Network down"));

    render(
      <ResultsDisplay results={baseResults} loading={false} error={null} inputData={{ p: 1 }} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Download Excel Report/i }));
    expect(await screen.findByText("Network down")).toBeInTheDocument();
  });
});
