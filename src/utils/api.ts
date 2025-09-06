import axios from 'axios';

const api = axios.create({
  baseURL: "https://api.abler.com.br/v1", 
  timeout: 5000, 
});

api.interceptors.request.use(
  (config) => {
    const token = "REDACTED_TOKEN"; 
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error);
  }
);

export default api;