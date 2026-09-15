import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { STATUS } from "react-joyride";
import App from "./App";
import { ThemeProvider } from "./contexts/ThemeContext";
import { I18nProvider } from "./contexts/I18nContext";

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
  return {
    __esModule: true,
    default: Joyride,
    STATUS: { FINISHED: "finished", SKIPPED: "skipped" },
  };
});

// mammoth is dynamically imported only when the docs drawer opens. Stub it so
// the docx-load effect resolves immediately under jsdom.
jest.mock("mammoth/mammoth.browser", () => ({
  __esModule: true,
  default: {
    convertToHtml: jest.fn().mockResolvedValue({ value: "<p>Methodology stub</p>" }),
  },
}));

describe("App shell", () => {
  beforeEach(() => {
    joyrideProps = null;
    jest.useRealTimers();
    // Stub fetch for the methodology docx fetch.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });
  });

  afterEach(() => {
    delete global.fetch;
  });

  it("renders header, calculator, and github links", () => {
    render(<App />);

    expect(screen.getByText("AI Infrastructure Calculator")).toBeInTheDocument();
    expect(screen.getByTestId("calculator-mock")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /github/i }).length).toBeGreaterThan(0);
  });

  it("lets the user pick the theme explicitly", () => {
    window.localStorage.removeItem("ai-calc:theme");
    document.documentElement.classList.remove("dark");
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );

    const group = screen.getByRole("radiogroup", { name: "Theme" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);

    fireEvent.click(within(group).getByRole("radio", { name: "Dark" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem("ai-calc:theme")).toBe("dark");

    fireEvent.click(within(group).getByRole("radio", { name: "Light" }));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(window.localStorage.getItem("ai-calc:theme")).toBe("light");
  });

  it("lets the user switch the UI language", () => {
    window.localStorage.removeItem("ai-calc:locale");
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );

    const group = screen.getByRole("radiogroup", { name: "Language" });
    expect(within(group).getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByText("AI Infrastructure Calculator")).toBeInTheDocument();

    fireEvent.click(within(group).getByRole("radio", { name: "ru" }));
    expect(screen.getByText("AI Калькулятор инфраструктуры")).toBeInTheDocument();
    expect(window.localStorage.getItem("ai-calc:locale")).toBe("ru");

    fireEvent.click(within(group).getByRole("radio", { name: "en" }));
    expect(screen.getByText("AI Infrastructure Calculator")).toBeInTheDocument();
  });

  it("renders documentation link to GitBook", () => {
    render(<App />);

    const docsLink = screen.getByRole("link", { name: /documentation/i });
    expect(docsLink).toHaveAttribute("href", "https://test-1-10.gitbook.io/test-1-docs");
    expect(docsLink).toHaveAttribute("target", "_blank");
    expect(docsLink).toHaveAttribute("rel", "noopener noreferrer");
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
      joyrideProps.callback({
        status: "running",
        type: "step:after",
        action: "next",
        index: 1,
      });
      jest.runOnlyPendingTimers();
    });

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
