import {
  autoOptimize,
  calculateServerRequirements,
  downloadReport,
  exportGpuCatalog,
  getGPUs,
  getGpuDetails,
  getGPUStats,
  healthCheck,
} from "./api";

jest.mock("axios", () => {
  const mockAxios = {
    get: jest.fn(),
    post: jest.fn(),
    isAxiosError: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockAxios,
  };
});

const mockedAxios = require("axios").default;

const makeAxiosError = ({
  status,
  data,
  statusText = "Error",
  withRequest = false,
} = {}) => ({
  __isAxiosError: true,
  response:
    status !== undefined
      ? {
          status,
          statusText,
          data,
        }
      : undefined,
  request: withRequest ? {} : undefined,
});

describe("frontend API client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.isAxiosError.mockImplementation((error) => Boolean(error?.__isAxiosError));
    window.URL.createObjectURL = jest.fn(() => "blob:test");
    window.URL.revokeObjectURL = jest.fn();
  });

  it("returns server sizing payload on success", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { servers_final: 5 } });

    const result = await calculateServerRequirements({ params_billions: 7 });

    expect(result).toEqual({ servers_final: 5 });
    expect(mockedAxios.post).toHaveBeenCalledWith(
      "http://localhost:8000/v1/size",
      { params_billions: 7 },
      { headers: { "Content-Type": "application/json" } },
    );
  });

  it("formats validation error details for /v1/size", async () => {
    mockedAxios.post.mockRejectedValueOnce(
      makeAxiosError({
        status: 422,
        data: { detail: [{ loc: ["body", "internal_users"], msg: "must be >= 0" }] },
      }),
    );

    const result = await calculateServerRequirements({ internal_users: -1 });

    expect(result).toEqual({ error: "Validation error: body.internal_users: must be >= 0" });
  });

  it("returns calculation error for 400 status", async () => {
    mockedAxios.post.mockRejectedValueOnce(
      makeAxiosError({ status: 400, data: { detail: "bad sizing input" }, statusText: "Bad Request" }),
    );

    const result = await calculateServerRequirements({});

    expect(result).toEqual({ error: "Calculation error: bad sizing input" });
  });

  it("returns network error when request has no response", async () => {
    mockedAxios.post.mockRejectedValueOnce(makeAxiosError({ withRequest: true }));

    const result = await calculateServerRequirements({});

    expect(result).toEqual({
      error: "Network error: Unable to connect to the server. Check that the backend is running.",
    });
  });

  it("returns request error for non-axios exception", async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error("boom"));

    const result = await calculateServerRequirements({});

    expect(result).toEqual({ error: "Request error: boom" });
  });

  it("returns server detail for non-400/422 calculate errors", async () => {
    mockedAxios.post.mockRejectedValueOnce(
      makeAxiosError({
        status: 503,
        data: { detail: { reason: "unavailable" } },
        statusText: "Service Unavailable",
      }),
    );

    const result = await calculateServerRequirements({});

    expect(result).toEqual({ error: '{"reason":"unavailable"}' });
  });

  it("returns generic server error when calculate detail is missing", async () => {
    mockedAxios.post.mockRejectedValueOnce(
      makeAxiosError({
        status: 503,
        data: null,
        statusText: "Service Unavailable",
      }),
    );

    const result = await calculateServerRequirements({});

    expect(result).toEqual({ error: "Server error (503): Service Unavailable" });
  });

  it("formats non-array validation detail for calculate API", async () => {
    mockedAxios.post.mockRejectedValueOnce(
      makeAxiosError({
        status: 422,
        data: { detail: "invalid schema" },
      }),
    );

    const result = await calculateServerRequirements({});

    expect(result).toEqual({ error: "Validation error: invalid schema" });
  });

  it("returns detailed API error for getGPUs 500 response", async () => {
    mockedAxios.get.mockRejectedValueOnce(
      makeAxiosError({
        status: 500,
        data: { detail: { message: "catalog failure" } },
      }),
    );

    const result = await getGPUs({ vendor: "NVIDIA" });

    expect(result).toEqual({ error: "{\"message\":\"catalog failure\"}" });
  });

  it("returns GPU list payload on success", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { gpus: [], total: 0 } });

    const result = await getGPUs();

    expect(result).toEqual({ gpus: [], total: 0 });
  });

  it("returns default 500 message for getGPUs without detail", async () => {
    mockedAxios.get.mockRejectedValueOnce(
      makeAxiosError({
        status: 500,
        data: "boom",
      }),
    );

    const result = await getGPUs();

    expect(result).toEqual({
      error: "Internal Server Error: An error occurred on the server. Please check your parameters.",
    });
  });

  it("returns network and request errors for getGPUs", async () => {
    mockedAxios.get.mockRejectedValueOnce(makeAxiosError({ withRequest: true }));
    const networkResult = await getGPUs();
    expect(networkResult).toEqual({
      error: "Network error: Unable to connect to the server. Please make sure the backend is running.",
    });

    mockedAxios.get.mockRejectedValueOnce(new Error("timeout"));
    const requestResult = await getGPUs();
    expect(requestResult).toEqual({ error: "Request error: timeout" });
  });

  it("returns API error for getGPUStats 400 response", async () => {
    mockedAxios.get.mockRejectedValueOnce(
      makeAxiosError({
        status: 400,
        data: { detail: "invalid params" },
        statusText: "Bad Request",
      }),
    );

    const result = await getGPUStats();

    expect(result).toEqual({ error: "API error: invalid params" });
  });

  it("returns stats payload on success", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { total_gpus: 120 } });

    const result = await getGPUStats();

    expect(result).toEqual({ total_gpus: 120 });
  });

  it("returns default and generic errors for getGPUStats", async () => {
    mockedAxios.get.mockRejectedValueOnce(makeAxiosError({ status: 500, data: "err" }));
    const status500 = await getGPUStats();
    expect(status500).toEqual({
      error: "Internal Server Error: An error occurred on the server. Please check your parameters.",
    });

    mockedAxios.get.mockRejectedValueOnce(
      makeAxiosError({
        status: 409,
        data: "err",
        statusText: "Conflict",
      }),
    );
    const generic = await getGPUStats();
    expect(generic).toEqual({ error: "API error: Conflict" });
  });

  it("returns server error for getGpuDetails when no detail exists", async () => {
    mockedAxios.get.mockRejectedValueOnce(
      makeAxiosError({
        status: 404,
        data: {},
      }),
    );

    const result = await getGpuDetails("NVIDIA/H100");

    expect(result).toEqual({ error: "Server error (404)" });
    expect(mockedAxios.get).toHaveBeenCalledWith(
      "http://localhost:8000/v1/gpus/NVIDIA%2FH100",
      { headers: { "Content-Type": "application/json" } },
    );
  });

  it("returns details payload on success", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { id: "NVIDIA_H100" } });

    const result = await getGpuDetails("NVIDIA_H100");

    expect(result).toEqual({ id: "NVIDIA_H100" });
  });

  it("returns network and request errors for getGpuDetails", async () => {
    mockedAxios.get.mockRejectedValueOnce(makeAxiosError({ withRequest: true }));
    const networkResult = await getGpuDetails("gpu-id");
    expect(networkResult).toEqual({ error: "Network error: Unable to connect to the server." });

    mockedAxios.get.mockRejectedValueOnce(new Error("unknown"));
    const requestResult = await getGpuDetails("gpu-id");
    expect(requestResult).toEqual({ error: "Request error: unknown" });
  });

  it("throws on failed health check", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("offline"));

    await expect(healthCheck()).rejects.toThrow("Health check failed: offline");
  });

  it("returns health payload on success", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { status: "ok" } });

    const result = await healthCheck();

    expect(result).toEqual({ status: "ok" });
  });

  it("downloads report and returns success", async () => {
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    mockedAxios.post.mockResolvedValueOnce({
      data: new Blob(["xlsx"]),
      headers: { "content-disposition": 'attachment; filename="report.xlsx"' },
    });

    const result = await downloadReport({ params_billions: 7 });

    expect(result).toEqual({ success: true });
    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
    clickSpy.mockRestore();
  });

  it("returns fallback error when report endpoint returns blob error payload", async () => {
    mockedAxios.post.mockRejectedValueOnce(
      makeAxiosError({
        status: 400,
        data: new Blob([JSON.stringify({ detail: "template missing" })], {
          type: "application/json",
        }),
      }),
    );

    const result = await downloadReport({ params_billions: 7 });

    expect(result).toEqual({ error: "Server error (400)" });
  });

  it("returns report error detail when response is non-blob", async () => {
    mockedAxios.post.mockRejectedValueOnce(
      makeAxiosError({
        status: 500,
        data: { detail: "report backend error" },
      }),
    );

    const result = await downloadReport({ params_billions: 7 });

    expect(result).toEqual({ error: "report backend error" });
  });

  it("returns optimizer validation error for 422", async () => {
    mockedAxios.post.mockRejectedValueOnce(
      makeAxiosError({
        status: 422,
        data: { detail: [{ loc: ["body", "gpu_ids", 0], msg: "unknown gpu id" }] },
      }),
    );

    const result = await autoOptimize({ gpu_ids: ["bad"] });

    expect(result).toEqual({ error: "Validation error: body.gpu_ids.0: unknown gpu id" });
  });

  it("returns optimizer payload on success", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { results: [] } });

    const result = await autoOptimize({ params_billions: 7 });

    expect(result).toEqual({ results: [] });
  });

  it("returns optimizer fallback and server errors", async () => {
    mockedAxios.post.mockRejectedValueOnce(
      makeAxiosError({
        status: 400,
        data: null,
      }),
    );
    const fallback = await autoOptimize({});
    expect(fallback).toEqual({ error: "No valid configurations found." });

    mockedAxios.post.mockRejectedValueOnce(
      makeAxiosError({
        status: 503,
        data: { detail: "temporary issue" },
        statusText: "Service Unavailable",
      }),
    );
    const detail = await autoOptimize({});
    expect(detail).toEqual({ error: "temporary issue" });

    mockedAxios.post.mockRejectedValueOnce(
      makeAxiosError({
        status: 503,
        data: null,
        statusText: "Service Unavailable",
      }),
    );
    const generic = await autoOptimize({});
    expect(generic).toEqual({ error: "Server error (503): Service Unavailable" });
  });

  it("returns network error for export GPU catalog request", async () => {
    mockedAxios.get.mockRejectedValueOnce(makeAxiosError({ withRequest: true }));

    const result = await exportGpuCatalog();

    expect(result).toEqual({ error: "Network error: Unable to connect to the server." });
  });

  it("returns export catalog payload and response detail errors", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { ok: true } });
    const success = await exportGpuCatalog();
    expect(success).toEqual({ ok: true });

    mockedAxios.get.mockRejectedValueOnce(
      makeAxiosError({
        status: 500,
        data: { detail: { code: "gpu_export_error" } },
      }),
    );
    const withDetail = await exportGpuCatalog();
    expect(withDetail).toEqual({ error: '{"code":"gpu_export_error"}' });
  });

  it("returns request error for export catalog non-axios failures", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("crash"));

    const result = await exportGpuCatalog();

    expect(result).toEqual({ error: "Request error: crash" });
  });
});
