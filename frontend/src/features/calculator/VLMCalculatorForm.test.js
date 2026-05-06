import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import VLMCalculatorForm, { VLM_PRESETS } from "./VLMCalculatorForm";

describe("VLMCalculatorForm", () => {
  it("renders all main sections", () => {
    render(<VLMCalculatorForm onSubmit={jest.fn()} loading={false} />);

    expect(screen.getByText("Quick Presets")).toBeInTheDocument();
    expect(screen.getByText("Workload (online)")).toBeInTheDocument();
    expect(screen.getByText("Image & token profile")).toBeInTheDocument();
    expect(screen.getByText("VLM model")).toBeInTheDocument();
    expect(screen.getByText("Hardware")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Calculate VLM Sizing/i })).toBeInTheDocument();
  });

  it("applies a preset and submits with preset values", () => {
    const onSubmit = jest.fn();
    render(<VLMCalculatorForm onSubmit={onSubmit} loading={false} />);

    fireEvent.click(screen.getByText(VLM_PRESETS[0].name));
    fireEvent.click(screen.getByRole("button", { name: /Calculate VLM Sizing/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submittedData = onSubmit.mock.calls[0][0];
    expect(submittedData.lambda_online).toBe(VLM_PRESETS[0].data.lambda_online);
    expect(submittedData.params_billions).toBe(VLM_PRESETS[0].data.params_billions);
    expect(submittedData.gpu_mem_gb).toBe(VLM_PRESETS[0].data.gpu_mem_gb);
  });

  it("blocks submit when a required field is invalid", () => {
    const onSubmit = jest.fn();
    render(<VLMCalculatorForm onSubmit={onSubmit} loading={false} />);

    // params_billions defaults to 7; clear it to trigger validation
    const paramsInput = screen.getByLabelText(/Parameters/);
    fireEvent.change(paramsInput, { target: { value: "0" } });

    fireEvent.click(screen.getByRole("button", { name: /Calculate VLM Sizing/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Missing or invalid value/i)).toBeInTheDocument();
  });

  it("opens GPU picker when the GPU selector is clicked", () => {
    const onOpenGpuPicker = jest.fn();
    render(
      <VLMCalculatorForm
        onSubmit={jest.fn()}
        loading={false}
        onOpenGpuPicker={onOpenGpuPicker}
      />,
    );

    fireEvent.click(screen.getByText(/Click to choose a GPU/i));
    expect(onOpenGpuPicker).toHaveBeenCalled();
  });
});
