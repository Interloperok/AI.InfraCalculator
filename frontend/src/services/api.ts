import axios from "axios";

type ApiError = { error: string };
type ApiResult<T = unknown> = T | ApiError;
type ApiPayload = Record<string, unknown>;

const API_BASE_URL =
  process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === "production" ? "" : "http://localhost:8000");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const getResponseDetail = (data: unknown): unknown => {
  if (!isRecord(data)) {
    return undefined;
  }
  return data.detail;
};

const stringifyDetail = (detail: unknown): string => {
  if (typeof detail === "string") {
    return detail;
  }
  if (detail === undefined || detail === null) {
    return "";
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
};

const formatValidationDetail = (detail: unknown): string => {
  if (!Array.isArray(detail)) {
    return stringifyDetail(detail);
  }
  return detail
    .map((item) => {
      if (!isRecord(item)) {
        return String(item);
      }
      const loc = Array.isArray(item.loc) ? item.loc.map(String).join(".") : "value";
      const msg = typeof item.msg === "string" ? item.msg : "invalid value";
      return `${loc}: ${msg}`;
    })
    .join("; ");
};

export const calculateServerRequirements = async (
  inputData: ApiPayload,
): Promise<ApiResult<ApiPayload>> => {
  try {
    const response = await axios.post<ApiPayload>(`${API_BASE_URL}/v1/size`, inputData, {
      headers: { "Content-Type": "application/json" },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const status = error.response.status;
        const detail = getResponseDetail(error.response.data);

        if (status === 422 && detail !== undefined) {
          return { error: `Validation error: ${formatValidationDetail(detail)}` };
        }
        if (status === 400) {
          const message = stringifyDetail(detail) || error.response.statusText || "Bad request";
          return { error: `Calculation error: ${message}` };
        }
        if (detail !== undefined) {
          return { error: stringifyDetail(detail) };
        }
        return { error: `Server error (${status}): ${error.response.statusText}` };
      }
      if (error.request) {
        return {
          error: "Network error: Unable to connect to the server. Check that the backend is running.",
        };
      }
    }
    return { error: `Request error: ${getErrorMessage(error)}` };
  }
};

export const getGPUs = async (
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<ApiResult<ApiPayload>> => {
  try {
    const response = await axios.get<ApiPayload>(`${API_BASE_URL}/v1/gpus`, {
      params,
      headers: { "Content-Type": "application/json" },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const status = error.response.status;
        const detail = getResponseDetail(error.response.data);

        if (status === 500 && detail !== undefined) {
          return { error: stringifyDetail(detail) };
        }
        if (status === 500) {
          return {
            error: "Internal Server Error: An error occurred on the server. Please check your parameters.",
          };
        }
        if (status === 400) {
          return { error: `API error: ${stringifyDetail(detail) || error.response.statusText}` };
        }
        return { error: `API error: ${error.response.statusText || status}` };
      }
      if (error.request) {
        return {
          error: "Network error: Unable to connect to the server. Please make sure the backend is running.",
        };
      }
    }
    return { error: `Request error: ${getErrorMessage(error)}` };
  }
};

export const getGPUStats = async (): Promise<ApiResult<ApiPayload>> => {
  try {
    const response = await axios.get<ApiPayload>(`${API_BASE_URL}/v1/gpus/stats`, {
      headers: { "Content-Type": "application/json" },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const status = error.response.status;
        const detail = getResponseDetail(error.response.data);

        if (status === 500 && detail !== undefined) {
          return { error: stringifyDetail(detail) };
        }
        if (status === 500) {
          return {
            error: "Internal Server Error: An error occurred on the server. Please check your parameters.",
          };
        }
        if (status === 400) {
          return { error: `API error: ${stringifyDetail(detail) || error.response.statusText}` };
        }
        return { error: `API error: ${error.response.statusText || status}` };
      }
      if (error.request) {
        return {
          error: "Network error: Unable to connect to the server. Please make sure the backend is running.",
        };
      }
    }
    return { error: `Request error: ${getErrorMessage(error)}` };
  }
};

export const getGpuDetails = async (gpuId: string): Promise<ApiResult<ApiPayload>> => {
  try {
    const response = await axios.get<ApiPayload>(`${API_BASE_URL}/v1/gpus/${encodeURIComponent(gpuId)}`, {
      headers: { "Content-Type": "application/json" },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const status = error.response.status;
        const detail = getResponseDetail(error.response.data);
        return { error: stringifyDetail(detail) || `Server error (${status})` };
      }
      if (error.request) {
        return { error: "Network error: Unable to connect to the server." };
      }
    }
    return { error: `Request error: ${getErrorMessage(error)}` };
  }
};

export const healthCheck = async (): Promise<ApiPayload> => {
  try {
    const response = await axios.get<ApiPayload>(`${API_BASE_URL}/v1/healthz`);
    return response.data;
  } catch (error) {
    throw new Error(`Health check failed: ${getErrorMessage(error)}`);
  }
};

export const downloadReport = async (
  inputData: ApiPayload,
): Promise<ApiResult<{ success: true }>> => {
  try {
    const response = await axios.post<Blob>(`${API_BASE_URL}/v1/report`, inputData, {
      headers: { "Content-Type": "application/json" },
      responseType: "blob",
    });

    const blob = new Blob([response.data], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const disposition = response.headers["content-disposition"];

    let filename = "sizing_report.xlsx";
    if (typeof disposition === "string") {
      const match = disposition.match(/filename="?([^";\n]+)"?/);
      if (match?.[1]) {
        filename = match[1];
      }
    }

    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    return { success: true };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const status = error.response.status;
        if (error.response.data instanceof Blob) {
          try {
            const text = await error.response.data.text();
            const parsed: unknown = JSON.parse(text);
            const detail = getResponseDetail(parsed);
            return { error: stringifyDetail(detail) || `Server error (${status})` };
          } catch {
            return { error: `Server error (${status})` };
          }
        }

        const detail = getResponseDetail(error.response.data);
        return { error: stringifyDetail(detail) || `Server error (${status})` };
      }
      if (error.request) {
        return { error: "Network error: Unable to connect to the server." };
      }
    }
    return { error: `Request error: ${getErrorMessage(error)}` };
  }
};

export const autoOptimize = async (inputData: ApiPayload): Promise<ApiResult<ApiPayload>> => {
  try {
    const response = await axios.post<ApiPayload>(`${API_BASE_URL}/v1/auto-optimize`, inputData, {
      headers: { "Content-Type": "application/json" },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const status = error.response.status;
        const detail = getResponseDetail(error.response.data);

        if (status === 422 && detail !== undefined) {
          return { error: `Validation error: ${formatValidationDetail(detail)}` };
        }
        if (status === 400) {
          return { error: stringifyDetail(detail) || "No valid configurations found." };
        }
        if (detail !== undefined) {
          return { error: stringifyDetail(detail) };
        }
        return { error: `Server error (${status}): ${error.response.statusText}` };
      }
      if (error.request) {
        return { error: "Network error: Unable to connect to the server." };
      }
    }
    return { error: `Request error: ${getErrorMessage(error)}` };
  }
};

export const exportGpuCatalog = async (): Promise<ApiResult<ApiPayload>> => {
  try {
    const response = await axios.get<ApiPayload>(`${API_BASE_URL}/v1/gpus/export`, {
      headers: { "Content-Type": "application/json" },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const detail = getResponseDetail(error.response.data);
        return { error: stringifyDetail(detail) || `Server error (${error.response.status})` };
      }
      if (error.request) {
        return { error: "Network error: Unable to connect to the server." };
      }
    }
    return { error: `Request error: ${getErrorMessage(error)}` };
  }
};
