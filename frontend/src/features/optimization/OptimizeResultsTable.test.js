import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import OptimizeResultsTable from "./OptimizeResultsTable";

const baseConfig = {
  rank: 1,
  gpu_name: "NVIDIA A100",
  gpu_mem_gb: 80,
  gpu_tflops: 312,
  bytes_per_param: 2,
  tp_multiplier_Z: 4,
  gpus_per_server: 8,
  servers_final: 22,
  total_gpus: 176,
  sessions_per_server: 114,
  th_server_comp: 3.77,
  cost_estimate_usd: 1100000,
  gpu_price_usd: 25000,
};

const baseStats = {
  mode: "min_servers",
  total_evaluated: 1024,
  total_valid: 98,
};

describe("OptimizeResultsTable", () => {
  it("renders loading state", () => {
    render(<OptimizeResultsTable loading results={null} error={null} />);

    expect(screen.getByText("Evaluating configurations...")).toBeInTheDocument();
  });

  it("renders error state", () => {
    render(<OptimizeResultsTable loading={false} results={null} error="Failed to optimize" />);

    expect(screen.getByText("Failed to optimize")).toBeInTheDocument();
  });

  it("renders empty state when no results", () => {
    render(<OptimizeResultsTable loading={false} results={null} error={null} />);

    expect(screen.getByText("No results yet")).toBeInTheDocument();
    expect(screen.getByText('Click "Find Best Configs" to start')).toBeInTheDocument();
  });

  it("renders results table and selects a row", () => {
    const onSelectRow = jest.fn();
    render(
      <OptimizeResultsTable
        loading={false}
        error={null}
        results={[baseConfig, { ...baseConfig, rank: 2, gpu_name: "H100", servers_final: 18 }]}
        stats={baseStats}
        selectedIdx={null}
        onSelectRow={onSelectRow}
      />,
    );

    expect(screen.getByText("Optimization Results")).toBeInTheDocument();
    expect(screen.getByText("Min Servers")).toBeInTheDocument();
    expect(screen.getByText("NVIDIA A100")).toBeInTheDocument();
    expect(screen.getByText("H100")).toBeInTheDocument();
    expect(screen.queryByText("INT8")).not.toBeInTheDocument();
    expect(screen.getAllByText("FP16")).toHaveLength(2);

    fireEvent.click(screen.getByText("H100"));
    expect(onSelectRow).toHaveBeenCalledWith(1);
  });

  it("renders no-valid-results state for empty array", () => {
    render(<OptimizeResultsTable loading={false} error={null} results={[]} />);

    expect(screen.getByText("No valid configurations found")).toBeInTheDocument();
  });
});
