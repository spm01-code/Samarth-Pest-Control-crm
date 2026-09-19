import { BASE_URL } from "./apiConfig";
const API_URL = `${BASE_URL}/templates`;

export const fetchTemplatesAPI = async (token) => {
  const response = await fetch(API_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to fetch templates");
  }

  return data;
};

export const activateTemplateAPI = async (id, token) => {
  const response = await fetch(`${API_URL}/${id}/activate`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to activate template");
  }

  return data;
};

export const deleteTemplateAPI = async (id, token) => {
  const response = await fetch(`${API_URL}/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to delete template");
  }

  return data;
};

export const uploadTemplateAPI = async (formData, token) => {
  const response = await fetch(`${API_URL}/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to upload template");
  }

  return data;
};
