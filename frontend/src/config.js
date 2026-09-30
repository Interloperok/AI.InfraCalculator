/**
 * Глобальные настройки приложения.
 */

export const GITHUB_URL = "https://github.com/Interloperok/AI.ServerCalculationApp";
export const DOCS_URL = "https://test-1-10.gitbook.io/test-1-docs";
export const DOCS_MCP_URL = "https://test-1-10.gitbook.io/test-1-docs/~gitbook/mcp";

export function resolveApiOrigin(env = process.env, origin = window.location.origin) {
  const configured = env.REACT_APP_API_URL;
  if (configured) {
    return String(configured).replace(/\/$/, "");
  }
  if (env.NODE_ENV === "production") {
    return String(origin).replace(/\/$/, "");
  }
  return "http://localhost:8000";
}

export function resolveMcpUrl(env, origin) {
  return `${resolveApiOrigin(env, origin)}/mcp`;
}

export function resolveSwaggerUrl(env, origin) {
  return `${resolveApiOrigin(env, origin)}/docs`;
}
