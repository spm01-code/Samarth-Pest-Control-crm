import { BASE_URL } from "./apiConfig";

const safeParseResponse = async (res, defaultErrMsg) => {
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    if (!res.ok) {
      throw new Error(`Server Error (${res.status}): ${res.statusText || "Request failed"}`);
    }
  }

  if (!res.ok) {
    throw new Error(json?.message || json?.error || defaultErrMsg);
  }

  return json;
};

// 1. Get Job Number Stats & Summary
export const getJobNumberStats = async (token) => {
  const res = await fetch(`${BASE_URL}/job-numbers/stats`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return safeParseResponse(res, "Failed to load Job Number statistics");
};

// 2. Get All Job Numbers (with filters and pagination)
export const getAllJobNumbers = async (params = {}, token) => {
  const query = new URLSearchParams();
  if (params.prefix) query.append("prefix", params.prefix);
  if (params.status) query.append("status", params.status);
  if (params.isLegacy !== undefined) query.append("isLegacy", params.isLegacy);
  if (params.search) query.append("search", params.search);
  if (params.page) query.append("page", params.page);
  if (params.limit) query.append("limit", params.limit);

  const res = await fetch(`${BASE_URL}/job-numbers?${query.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return safeParseResponse(res, "Failed to load Job Numbers");
};

// 3. Get Next Available Job Number preview
export const getNextAvailableJobNo = async (name, token) => {
  const query = name ? `?name=${encodeURIComponent(name)}` : "";
  const res = await fetch(`${BASE_URL}/job-numbers/next-available${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return safeParseResponse(res, "Failed to get next available Job Number");
};

// 4. Validate Manual Job Number override
export const validateManualJobNo = async (jobNo, customerId, token) => {
  const res = await fetch(`${BASE_URL}/job-numbers/validate-manual`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jobNo, customerId }),
  });

  return safeParseResponse(res, "Failed to validate manual Job Number");
};

// 5. Synchronize Registry & Sequence Counters (Administrative action)
export const syncJobNumberRegistryAPI = async (token) => {
  const res = await fetch(`${BASE_URL}/job-numbers/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  return safeParseResponse(res, "Failed to synchronize Job Number registry");
};
