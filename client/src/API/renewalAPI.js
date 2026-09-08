const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const request = async (path, token, options = {}) => {
  const response = await fetch(`${API_URL}/api/renewals${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Contract renewal request failed");
  return data;
};

export const createRenewalAPI = (renewalData, token) =>
  request("/create", token, { method: "POST", body: JSON.stringify(renewalData) });
export const fetchRenewalsAPI = (token) => request("", token);
export const fetchRenewalByIdAPI = (id, token) => request(`/${id}`, token);
export const updateRenewalAPI = (id, renewalData, token) =>
  request(`/${id}`, token, { method: "PUT", body: JSON.stringify(renewalData) });
export const deleteRenewalAPI = (id, token) => request(`/${id}`, token, { method: "DELETE" });
