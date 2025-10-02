import axios from 'axios';

// Определяем API URL в зависимости от окружения
const getApiUrl = () => {
  // Если указан явно REACT_APP_API_URL, используем его
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // В production используем относительный путь (nginx proxy)
  if (process.env.NODE_ENV === 'production') {
    return '/api'; // Относительный путь к API через nginx proxy
  }
  
  // В development используем localhost
  return 'http://localhost:8000';
};

const API_BASE_URL = getApiUrl();

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
        return { error: `Calculation error: ${errorData.detail || error.response.statusText}` };
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

export const healthCheck = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/v1/healthz`);
    return response.data;
  } catch (error) {
    throw new Error(`Health check failed: ${error.message}`);
  }
};