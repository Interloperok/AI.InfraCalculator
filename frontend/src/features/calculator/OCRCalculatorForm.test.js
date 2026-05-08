import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import OCRCalculatorForm, { OCR_PRESETS } from "./OCRCalculatorForm";

describe("OCRCalculatorForm", () => {
  it("renders all main sections with default ocr_gpu pipeline", () => {
    render(<OCRCalculatorForm onSubmit={jest.fn()} loading={false} />);

    expect(screen.getByText("Quick Presets")).toBeInTheDocument();
    expect(screen.getByText("Workload (online)")).toBeInTheDocument();
    // "OCR pipeline" appears as both a section heading and a field label,
    // so assert presence via getAllByText.
    expect(screen.getAllByText("OCR pipeline").length).toBeGreaterThan(0);
    expect(screen.getByText("OCR text profile")).toBeInTheDocument();
    expect(screen.getByText("LLM model")).toBeInTheDocument();
    expect(screen.getByText("Hardware")).toBeInTheDocument();
    expect(screen.getByLabelText(/OCR throughput per GPU/)).toBeInTheDocument();
  });

  it("toggles pipeline to ocr_cpu and shows core fields", () => {
    render(<OCRCalculatorForm onSubmit={jest.fn()} loading={false} />);

    fireEvent.click(screen.getByText("OCR on CPU"));
    expect(screen.getByLabelText(/OCR throughput per core/)).toBeInTheDocument();
    expect(screen.getByLabelText(/CPU cores for OCR/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/OCR throughput per GPU/)).not.toBeInTheDocument();
  });

  it("applies a preset and submits with preset values", () => {
    const onSubmit = jest.fn();
    render(<OCRCalculatorForm onSubmit={onSubmit} loading={false} />);

    fireEvent.click(screen.getByText(OCR_PRESETS[0].name));
    fireEvent.click(screen.getByRole("button", { name: /Calculate OCR \+ LLM Sizing/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submitted = onSubmit.mock.calls[0][0];
    expect(submitted.lambda_online).toBe(OCR_PRESETS[0].data.lambda_online);
    expect(submitted.pipeline).toBe("ocr_gpu");
    expect(submitted.r_ocr_gpu).toBe(OCR_PRESETS[0].data.r_ocr_gpu);
  });

  it("strips ocr_cpu fields from payload when pipeline is ocr_gpu", () => {
    const onSubmit = jest.fn();
    render(<OCRCalculatorForm onSubmit={onSubmit} loading={false} />);

    fireEvent.click(screen.getByRole("button", { name: /Calculate OCR \+ LLM Sizing/i }));
    const submitted = onSubmit.mock.calls[0][0];
    expect(submitted).not.toHaveProperty("r_ocr_core");
    expect(submitted).not.toHaveProperty("n_ocr_cores");
    expect(submitted).toHaveProperty("r_ocr_gpu");
  });

  it("strips ocr_gpu fields from payload when pipeline is ocr_cpu", () => {
    const onSubmit = jest.fn();
    render(<OCRCalculatorForm onSubmit={onSubmit} loading={false} />);

    fireEvent.click(screen.getByText("OCR on CPU"));
    fireEvent.click(screen.getByRole("button", { name: /Calculate OCR \+ LLM Sizing/i }));

    const submitted = onSubmit.mock.calls[0][0];
    expect(submitted).not.toHaveProperty("r_ocr_gpu");
    expect(submitted).not.toHaveProperty("eta_ocr");
    expect(submitted).toHaveProperty("r_ocr_core");
    expect(submitted).toHaveProperty("n_ocr_cores");
  });

  it("blocks submit when pipeline-specific required field is missing", () => {
    const onSubmit = jest.fn();
    render(<OCRCalculatorForm onSubmit={onSubmit} loading={false} />);

    // Switch to CPU and clear cores
    fireEvent.click(screen.getByText("OCR on CPU"));
    fireEvent.change(screen.getByLabelText(/CPU cores for OCR/), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /Calculate OCR \+ LLM Sizing/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Number of OCR CPU cores/i)).toBeInTheDocument();
  });
});
