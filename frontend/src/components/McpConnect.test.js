import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import McpConnectButton, { resolveMcpUrl } from "./McpConnect";

describe("resolveMcpUrl", () => {
  it("uses the configured API origin", () => {
    expect(resolveMcpUrl({ REACT_APP_API_URL: "http://backend:8000/" }, "http://ui")).toBe(
      "http://backend:8000/mcp/",
    );
  });

  it("uses the page origin in production", () => {
    expect(resolveMcpUrl({ NODE_ENV: "production" }, "https://calc.example")).toBe(
      "https://calc.example/mcp/",
    );
  });

  it("points at the local backend during development", () => {
    expect(resolveMcpUrl({ NODE_ENV: "development" }, "http://localhost:3000")).toBe(
      "http://localhost:8000/mcp/",
    );
  });
});

describe("McpConnectButton", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
  });

  it("copies the endpoint and a Cursor config", async () => {
    render(<McpConnectButton />);

    fireEvent.click(screen.getByRole("button", { name: "MCP" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("mcp-endpoint")).toHaveTextContent("http://localhost:8000/mcp/");
    expect(screen.getByText("size_llm")).toBeInTheDocument();
    expect(screen.getByText("build_report")).toBeInTheDocument();

    const copyButtons = screen.getAllByRole("button", { name: "Copy" });
    fireEvent.click(copyButtons[0]);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("http://localhost:8000/mcp/");

    expect(screen.getByTestId("docs-mcp-endpoint")).toHaveTextContent(
      "https://test-1-10.gitbook.io/test-1-docs/~gitbook/mcp",
    );
    expect(screen.getByRole("link", { name: /documentation/i })).toHaveAttribute(
      "href",
      "https://test-1-10.gitbook.io/test-1-docs",
    );
    expect(screen.getByRole("link", { name: /swagger/i })).toHaveAttribute(
      "href",
      "http://localhost:8000/docs",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Local" }));
    expect(screen.getByText(/mcp_server/)).toBeInTheDocument();
    expect(screen.getByText(/ai-infra-docs/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Claude" }));
    expect(screen.getAllByText(/mcpServers/).length).toBeGreaterThan(0);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
