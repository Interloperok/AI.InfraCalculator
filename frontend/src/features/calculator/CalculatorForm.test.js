import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import CalculatorForm, { parseSafetensorsParamsBillions } from "./CalculatorForm";

// The catalog probes fired on mount never settle here: the tests do not need
// their data and a pending promise cannot trigger a state update after the
// test has finished. Plain functions rather than jest.fn(): CRA's jest config
// resets mock implementations before every test.
const pending = () => new Promise(() => {});
jest.mock("../../services/api", () => ({
  getGPUs: pending,
  getLLMs: pending,
  probeHuggingFace: pending,
}));

const renderForm = (props = {}) => {
  const onSubmit = jest.fn();
  render(
    <CalculatorForm
      onSubmit={onSubmit}
      loading={false}
      autoMode={false}
      setAutoMode={jest.fn()}
      optimizeMode="min_servers"
      setOptimizeMode={jest.fn()}
      gpuFilter={null}
      onOpenGpuFilter={jest.fn()}
      onOpenGpuPicker={jest.fn()}
      gpuPickerResult={null}
      onClearGpuPickerResult={jest.fn()}
      appliedConfig={null}
      onAppliedConfigConsumed={jest.fn()}
      {...props}
    />,
  );
  return { onSubmit };
};

const submit = () => fireEvent.click(screen.getByRole("button", { name: /Calculate/i }));

describe("parseSafetensorsParamsBillions", () => {
  const fp8Buckets = { BF16: 636948480, F8_E4M3: 29896998912 };

  it("uses the total instead of the first dtype bucket", () => {
    expect(parseSafetensorsParamsBillions({ parameters: fp8Buckets, total: 30533947392 })).toBe(
      30.5,
    );
  });

  it("sums the buckets when no total is reported", () => {
    expect(parseSafetensorsParamsBillions({ parameters: fp8Buckets })).toBe(30.5);
  });

  it("keeps working for single-dtype checkpoints", () => {
    expect(parseSafetensorsParamsBillions({ parameters: { BF16: 30532122624 } })).toBe(30.5);
  });

  it("returns null without a usable count", () => {
    expect(parseSafetensorsParamsBillions(undefined)).toBeNull();
    expect(parseSafetensorsParamsBillions({})).toBeNull();
    expect(parseSafetensorsParamsBillions({ parameters: { BF16: "n/a" } })).toBeNull();
  });
});

describe("CalculatorForm GPUs per server", () => {
  it("submits any count between 1 and 8", () => {
    const { onSubmit } = renderForm();

    fireEvent.change(screen.getByLabelText(/GPUs per Server/i), { target: { value: "3" } });
    submit();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].gpus_per_server).toBe(3);
    expect(onSubmit.mock.calls[0][0].tp_multiplier_Z).toBe(1);
  });

  it("keeps an applied odd count while TP still snaps to its allowed degrees", () => {
    const { onSubmit } = renderForm({
      appliedConfig: { gpus_per_server: 5, tp_multiplier_Z: 3 },
    });

    submit();

    expect(onSubmit.mock.calls[0][0].gpus_per_server).toBe(5);
    expect(onSubmit.mock.calls[0][0].tp_multiplier_Z).toBe(2);
  });

  it("blocks submit when the count is emptied", () => {
    const { onSubmit } = renderForm();

    fireEvent.change(screen.getByLabelText(/GPUs per Server/i), { target: { value: "" } });
    submit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/GPUs per Server must be at least 1/i)).toBeInTheDocument();
  });
});

describe("CalculatorForm model parameters", () => {
  it("blocks submit when active parameters exceed total parameters", () => {
    const { onSubmit } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    fireEvent.click(screen.getByRole("button", { name: /Model Architecture/i }));
    fireEvent.change(screen.getByLabelText(/Parameters \(active, MoE\)/i), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText(/Parameters \(total\)/i), {
      target: { value: "0.6" },
    });
    submit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Active parameters \(MoE\) cannot exceed/i)).toBeInTheDocument();
  });
});

describe("CalculatorForm advanced sections", () => {
  it("expands the agentic section without a height cap", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    fireEvent.click(screen.getByRole("button", { name: /App Architecture pattern/i }));

    // The clipping bug lived in the wrapper's classes, so the assertion has to
    // look at the wrapper element itself.
    // eslint-disable-next-line testing-library/no-node-access
    const body = screen.getByText("Prefix cache hit (η_cache)").closest(".grid");
    expect(body).toHaveClass("grid-rows-[1fr]");
    expect(body.className).not.toMatch(/max-h-/);
    expect(screen.getByText("Effective values applied to sizing")).toBeInTheDocument();
  });
});
