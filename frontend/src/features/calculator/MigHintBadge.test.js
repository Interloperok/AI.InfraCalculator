import React from "react";
import { render, screen } from "@testing-library/react";
import MigHintBadge from "./MigHintBadge";

describe("MigHintBadge", () => {
  it("returns null when GPU is not MIG-capable", () => {
    const { container } = render(
      <MigHintBadge
        gpuId="nvidia-rtx-a1000"
        modelMemGb={4}
        kvAtPeakGb={1}
        gpusPerInstance={1}
        tpMultiplierZ={1}
        servers={2}
        totalGpus={4}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("returns null when TP > 1 (MIG slices cannot share NVLink)", () => {
    const { container } = render(
      <MigHintBadge
        gpuId="nvidia-h100-gpu-accelerator-sxm-card"
        modelMemGb={14}
        kvAtPeakGb={1}
        gpusPerInstance={1}
        tpMultiplierZ={2}
        servers={2}
        totalGpus={4}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("returns null when gpusPerInstance > 1", () => {
    const { container } = render(
      <MigHintBadge
        gpuId="nvidia-h100-gpu-accelerator-sxm-card"
        modelMemGb={14}
        kvAtPeakGb={1}
        gpusPerInstance={4}
        tpMultiplierZ={1}
        servers={2}
        totalGpus={4}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders advisory hint for a 7B model on H100 SXM (fits 1g.20gb)", () => {
    render(
      <MigHintBadge
        gpuId="nvidia-h100-gpu-accelerator-sxm-card"
        modelMemGb={14}
        kvAtPeakGb={0.5}
        gpusPerInstance={1}
        tpMultiplierZ={1}
        servers={2}
        totalGpus={4}
      />,
    );

    expect(screen.getByTestId("mig-hint-badge")).toBeInTheDocument();
    expect(screen.getByText(/fits on a 1g\.20gb MIG slice/i)).toBeInTheDocument();
    // Density estimate: 7 / 1 = 7 instances per physical GPU
    expect(screen.getByText(/7× 1g\.20gb/)).toBeInTheDocument();
  });

  it("returns null when even the largest slice can't fit", () => {
    // 200 GB per instance won't fit on any single A100 80GB slice
    const { container } = render(
      <MigHintBadge
        gpuId="nvidia-a100-gpu-accelerator-pcie-card"
        modelMemGb={200}
        kvAtPeakGb={0}
        gpusPerInstance={1}
        tpMultiplierZ={1}
        servers={2}
        totalGpus={4}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("returns null when only the full GPU slice fits (no density gain)", () => {
    // 70 GB on A100 80GB: only 7g.80gb (full GPU) fits → no hint
    const { container } = render(
      <MigHintBadge
        gpuId="nvidia-a100-gpu-accelerator-pcie-card"
        modelMemGb={70}
        kvAtPeakGb={0}
        gpusPerInstance={1}
        tpMultiplierZ={1}
        servers={2}
        totalGpus={4}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
