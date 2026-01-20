import axios from "axios";

const API_BASE_URL = "/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export const documentAPI = {
  // Document management
  getAllDocuments: () => api.get("/docs"),
  getDocument: (id) => api.get(`/docs/${id}`),
  createDocument: (title, createdBy) => api.post("/docs", { title, createdBy }),
  updateDocument: (id, updates) => api.put(`/docs/${id}`, updates),
  deleteDocument: (id) => api.delete(`/docs/${id}`),

  // Document content
  getDocumentContent: (id) => api.get(`/docs/${id}/content`),

  // Operations
  getDocumentOperations: (id) => api.get(`/docs/${id}/operations`),
  sendOperation: (operation) => api.post("/operations", operation),
};

export default api;
