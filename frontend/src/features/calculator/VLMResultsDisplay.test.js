import React from "react";
import { render, screen } from "@testing-library/react";
import VLMResultsDisplay from "./VLMResultsDisplay";

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
  v_tok: 4096,
  sl_pf_vlm: 4296,
  sl_pf_vlm_eff: 4296,
  sl_dec_vlm: 1000,
  model_mem_gb: 14,
  kv_per_session_gb: 0.6,
  gpus_per_instance: 1,
  s_tp_z: 8,
  instance_total_mem_gb: 80,
  gpu_tflops_used: 312,
  th_pf_vlm: 1500,
  th_dec_vlm: 250,
  t_page_vlm: 4.2,
  bs_real_star: 8,
  sla_pass: true,
  sla_page_target: 5.0,
  n_repl_vlm: 1,
  n_gpu_vlm_online: 4,
  n_servers_vlm_online: 1,
  gpus_per_server: 8,
};

describe("VLMResultsDisplay", () => {
  it("renders the empty state when results are null", () => {
    render(<VLMResultsDisplay results={null} loading={false} error={null} />);
    expect(screen.getByText("No results yet")).toBeInTheDocument();
  });

  it("renders the loading spinner when loading", () => {
    render(<VLMResultsDisplay results={null} loading error={null} />);
    expect(screen.getByText(/Calculating VLM sizing/i)).toBeInTheDocument();
  });

  it("renders error state when error prop is set", () => {
    render(<VLMResultsDisplay results={null} loading={false} error="Something failed" />);
    expect(screen.getByText("Something failed")).toBeInTheDocument();
  });

  it("renders infrastructure card with servers and GPUs and PASS SLA", () => {
    render(<VLMResultsDisplay results={baseResults} loading={false} error={null} />);

    expect(screen.getByText("Infrastructure Required")).toBeInTheDocument();
    expect(screen.getByText("PASS")).toBeInTheDocument();
    // SLA detail line shows actual vs target
    expect(screen.getByText(/4\.20s actual · 5\.00s target/)).toBeInTheDocument();
    // Replicas / GPUs-per-server subtitle
    expect(screen.getByText(/1 replicas · 8 GPU\/server/)).toBeInTheDocument();
    expect(screen.getByTestId("pie-chart")).toBeInTheDocument();
  });

  it("shows FAIL when sla_pass is false", () => {
    render(
      <VLMResultsDisplay
        results={{ ...baseResults, sla_pass: false, t_page_vlm: 7.5 }}
        loading={false}
        error={null}
      />,
    );
    expect(screen.getByText("FAIL")).toBeInTheDocument();
  });
});
