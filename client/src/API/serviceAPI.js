const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const API_URL = `${BASE_URL}/api/services`;

const getHeaders = (token) => {
  if (!token) {
    throw new Error("Please login to view services");
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
};

// Get All Services
export const fetchServicesAPI = async (token) => {
  const response = await fetch(API_URL, {
    method: "GET",
    headers: getHeaders(token),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to fetch services");
  }

  return data;
};

// Get Single Service
export const fetchServiceAPI = async (id, token) => {
  const response = await fetch(`${API_URL}/${id}`, {
    method: "GET",
    headers: getHeaders(token),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to fetch service");
  }

  return data;
};

// Create Service
export const createServiceAPI = async (serviceData, token) => {
  const response = await fetch(`${API_URL}/create`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(serviceData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to create service");
  }

  return data;
};

// Update Service
export const updateServiceAPI = async (id, serviceData, token) => {
  const response = await fetch(`${API_URL}/${id}`, {
    method: "PUT",
    headers: getHeaders(token),
    body: JSON.stringify(serviceData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to update service");
  }

  return data;
};

// Delete Service
export const deleteServiceAPI = async (id, token) => {
  const response = await fetch(`${API_URL}/${id}`, {
    method: "DELETE",
    headers: getHeaders(token),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to delete service");
  }

  return data;
};

// Download URLs for Service Paper
export const getServiceDocxUrl = (id, token) => {
  return `${API_URL}/${id}/docx?token=${encodeURIComponent(token || "")}`;
};

export const getServicePdfUrl = (id, token) => {
  return `${API_URL}/${id}/pdf?token=${encodeURIComponent(token || "")}`;
};
