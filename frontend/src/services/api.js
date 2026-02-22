import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8000');

export const calculateServerRequirements = async (inputData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/v1/size`, inputData, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;

      if (status === 422 && errorData && errorData.detail) {
        // Pydantic validation error — parse field messages
        const msgs = Array.isArray(errorData.detail)
          ? errorData.detail.map(d => `${(d.loc || []).join('.')}: ${d.msg}`).join('; ')
          : String(errorData.detail);
        return { error: `Validation error: ${msgs}` };
      } else if (status === 400) {
        return { error: `Calculation error: ${errorData?.detail || error.response.statusText}` };
      } else if (errorData && errorData.detail) {
        return { error: String(errorData.detail) };
      } else {
        return { error: `Server error (${status}): ${error.response.statusText}` };
      }
    } else if (error.request) {
      return { error: 'Network error: Unable to connect to the server. Check that the backend is running.' };
    } else {
      return { error: `Request error: ${error.message}` };
    }
  }
};

export const getGPUs = async (params = {}) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/v1/gpus`, {
      params,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const errorData = error.response.data;
      
      // Check for specific error messages from the backend
      if (status === 500 && errorData && errorData.detail) {
        // Return the specific error message from the backend
        return { error: errorData.detail };
      } else if (status === 500) {
        // For 500 errors without specific detail, provide a general message
        return { error: 'Internal Server Error: An error occurred on the server. Please check your parameters.' };
      } else if (status === 400) {
        // For other error statuses
        return { error: `API error: ${errorData.detail || error.response.statusText}` };
      }
    } else if (error.request) {
      // Request was made but no response received
      return { error: 'Network error: Unable to connect to the server. Please make sure the backend is running.' };
    } else {
      // Something else happened
      return { error: `Request error: ${error.message}` };
    }
  }
};

export const getGPUStats = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/v1/gpus/stats`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const errorData = error.response.data;
      
      // Check for specific error messages from the backend
      if (status === 500 && errorData && errorData.detail) {
        // Return the specific error message from the backend
        return { error: errorData.detail };
      } else if (status === 500) {
        // For 500 errors without specific detail, provide a general message
        return { error: 'Internal Server Error: An error occurred on the server. Please check your parameters.' };
      } else if (status === 400) {
        // For other error statuses
        return { error: `API error: ${errorData.detail || error.response.statusText}` };
      }
    } else if (error.request) {
      // Request was made but no response received
      return { error: 'Network error: Unable to connect to the server. Please make sure the backend is running.' };
    } else {
      // Something else happened
      return { error: `Request error: ${error.message}` };
    }
  }
};

export const getGpuDetails = async (gpuId) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/v1/gpus/${encodeURIComponent(gpuId)}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;
      return { error: errorData?.detail || `Server error (${status})` };
    }
    if (error.request) {
      return { error: 'Network error: Unable to connect to the server.' };
    }
    return { error: `Request error: ${error.message}` };
  }
};

export const healthCheck = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/v1/healthz`);
    return response.data;
  } catch (error) {
    throw new Error(`Health check failed: ${error.message}`);
  }
};

export const downloadReport = async (inputData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/v1/report`, inputData, {
      headers: {
        'Content-Type': 'application/json',
      },
      responseType: 'blob',
    });

    // Create a download link from the blob response
    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');

    // Extract filename from Content-Disposition header or use default
    const disposition = response.headers['content-disposition'];
    let filename = 'sizing_report.xlsx';
    if (disposition) {
      const match = disposition.match(/filename="?([^";\n]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }
    }

    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    return { success: true };
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      // For blob responses, we need to parse the error differently
      if (error.response.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          const errorData = JSON.parse(text);
          return { error: errorData.detail || `Server error (${status})` };
        } catch {
          return { error: `Server error (${status})` };
        }
      }
      const errorData = error.response.data;
      return { error: errorData?.detail || `Server error (${status})` };
    } else if (error.request) {
      return { error: 'Network error: Unable to connect to the server.' };
    } else {
      return { error: `Request error: ${error.message}` };
    }
  }
};

export const autoOptimize = async (inputData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/v1/auto-optimize`, inputData, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;

      if (status === 422 && errorData && errorData.detail) {
        const msgs = Array.isArray(errorData.detail)
          ? errorData.detail.map(d => `${(d.loc || []).join('.')}: ${d.msg}`).join('; ')
          : String(errorData.detail);
        return { error: `Validation error: ${msgs}` };
      } else if (status === 400) {
        return { error: errorData?.detail || 'No valid configurations found.' };
      } else if (errorData && errorData.detail) {
        return { error: String(errorData.detail) };
      } else {
        return { error: `Server error (${status}): ${error.response.statusText}` };
      }
    } else if (error.request) {
      return { error: 'Network error: Unable to connect to the server.' };
    } else {
      return { error: `Request error: ${error.message}` };
    }
  }
};

export const exportGpuCatalog = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/v1/gpus/export`, {
      headers: { 'Content-Type': 'application/json' },
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      const errorData = error.response.data;
      return { error: errorData?.detail || `Server error (${error.response.status})` };
    } else if (error.request) {
      return { error: 'Network error: Unable to connect to the server.' };
    } else {
      return { error: `Request error: ${error.message}` };
    }
  }
};

export const searchGPUs = async (searchQuery, params = {}) => {
  try {
    // Include search query in the parameters
    const searchParams = {
      ...params,
      search: searchQuery
    };
    
    const response = await axios.get(`${API_BASE_URL}/v1/gpus`, {
      params: searchParams,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const errorData = error.response.data;
      
      // Check for specific error messages from the backend
      if (status === 500 && errorData && errorData.detail) {
        // Return the specific error message from the backend
        return { error: errorData.detail };
      } else if (status === 500) {
        // For 500 errors without specific detail, provide a general message
        return { error: 'Internal Server Error: An error occurred on the server. Please check your parameters.' };
      } else if (status === 400) {
        // For other error statuses
        return { error: `API error: ${errorData.detail || error.response.statusText}` };
      }
    } else if (error.request) {
      // Request was made but no response received
      return { error: 'Network error: Unable to connect to the server. Please make sure the backend is running.' };
    } else {
      // Something else happened
      return { error: `Request error: ${error.message}` };
    }
  }
};