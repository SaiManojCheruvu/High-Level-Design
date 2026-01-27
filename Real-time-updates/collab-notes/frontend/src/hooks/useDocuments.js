import { useState, useCallback } from "react";
import axios from "axios";

const API_BASE_URL = "/api";

export const useDocuments = () => {
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(`${API_BASE_URL}/docs`);
      setDocuments(response.data);
    } catch (err) {
      console.error("Error fetching documents:", err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createDocument = useCallback(async (title, createdBy) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.post(`${API_BASE_URL}/docs`, {
        title,
        createdBy,
      });

      const newDocument = response.data;
      setDocuments((prev) => [...prev, newDocument]);
      return newDocument;
    } catch (err) {
      console.error("Error creating document:", err);
      setError(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getDocument = useCallback(async (id) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(`${API_BASE_URL}/docs/${id}`);
      return response.data;
    } catch (err) {
      console.error("Error fetching document:", err);
      setError(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getDocumentContent = useCallback(async (id) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(`${API_BASE_URL}/docs/${id}/content`);
      return response.data;
    } catch (err) {
      console.error("Error fetching document content:", err);
      setError(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteDocument = useCallback(async (id) => {
    setIsLoading(true);
    setError(null);

    try {
      await axios.delete(`${API_BASE_URL}/docs/${id}`);
      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    } catch (err) {
      console.error("Error deleting document:", err);
      setError(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    documents,
    isLoading,
    error,
    fetchDocuments,
    createDocument,
    getDocument,
    getDocumentContent,
    deleteDocument,
  };
};
