import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { STATUS } from "react-joyride";
import App from "./App";

let joyrideProps = null;

jest.mock("./features/calculator/Calculator", () => () => (
  <div data-testid="calculator-mock">Calculator mock</div>
));

jest.mock("react-joyride", () => {
  const React = require("react");
  const Joyride = (props) => {
    joyrideProps = props;
    return <div data-testid="joyride-mock">{props.run ? "running" : "stopped"}</div>;
  };
  // react-joyride 3.x: `Joyride` is a named export.
  return {
    __esModule: true,
    Joyride,
    STATUS: { FINISHED: "finished", SKIPPED: "skipped" },
  };
});

describe("App shell", () => {
  beforeEach(() => {
    joyrideProps = null;
    jest.useRealTimers();
  });

  it("renders header, calculator, and github links", () => {
    render(<App />);

    expect(screen.getByText("AI Infrastructure Calculator")).toBeInTheDocument();
    expect(screen.getByTestId("calculator-mock")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /github/i }).length).toBeGreaterThan(0);
  });

  it("opens and closes the documentation drawer", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Documentation" }));
    expect(screen.getByText("Open in Google Docs")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Close (Esc)"));
    expect(screen.queryByText("Open in Google Docs")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Documentation" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Open in Google Docs")).not.toBeInTheDocument();
  });

  it("handles guided tour callback transitions and finish", () => {
    jest.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Take a Tour" }));
    expect(screen.getByTestId("joyride-mock")).toHaveTextContent("running");

    act(() => {
      joyrideProps.callback({
        status: "running",
        type: "step:after",
        action: "next",
        index: 0,
      });
    });
    expect(screen.getByText("Open in Google Docs")).toBeInTheDocument();

    act(() => {
      joyrideProps.callback({
        status: "running",
        type: "step:after",
        action: "next",
        index: 1,
      });
      jest.runOnlyPendingTimers();
    });
    expect(screen.queryByText("Open in Google Docs")).not.toBeInTheDocument();

    act(() => {
      joyrideProps.callback({
        status: STATUS.FINISHED,
        type: "tour:end",
        action: "next",
        index: 2,
      });
    });
    expect(screen.getByTestId("joyride-mock")).toHaveTextContent("stopped");
  });
});
