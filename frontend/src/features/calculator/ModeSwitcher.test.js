import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import ModeSwitcher, { CALCULATOR_MODES } from "./ModeSwitcher";

describe("ModeSwitcher", () => {
  it("renders all three modes with correct active state", () => {
    const onChange = jest.fn();
    render(<ModeSwitcher mode="llm" onChange={onChange} />);

    expect(screen.getByText("LLM")).toBeInTheDocument();
    expect(screen.getByText("VLM")).toBeInTheDocument();
    expect(screen.getByText("OCR + LLM")).toBeInTheDocument();

    const llmButton = screen.getByText("LLM").closest("button");
    const vlmButton = screen.getByText("VLM").closest("button");
    expect(llmButton).toHaveAttribute("aria-pressed", "true");
    expect(vlmButton).toHaveAttribute("aria-pressed", "false");
  });

  it("invokes onChange with the clicked mode", () => {
    const onChange = jest.fn();
    render(<ModeSwitcher mode="llm" onChange={onChange} />);

    fireEvent.click(screen.getByText("VLM"));
    expect(onChange).toHaveBeenCalledWith("vlm");

    fireEvent.click(screen.getByText("OCR + LLM"));
    expect(onChange).toHaveBeenCalledWith("ocr");
  });

  it("exports the canonical mode list", () => {
    expect(CALCULATOR_MODES.map((m) => m.id)).toEqual(["llm", "vlm", "ocr"]);
  });
});
