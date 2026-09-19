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

// 1. Upload File
export const uploadImportFile = async (file, token) => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/import/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  return safeParseResponse(res, "Failed to upload file");
};

// 2. Select Sheet
export const selectImportSheet = async (importSessionId, selectedSheet, token) => {
  const res = await fetch(`${BASE_URL}/import/select-sheet`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ importSessionId, selectedSheet }),
  });

  return safeParseResponse(res, "Failed to select sheet");
};

// 3. Get Helper Data (Customers & Employees)
export const getImportHelpers = async (token) => {
  const res = await fetch(`${BASE_URL}/import/helpers`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return safeParseResponse(res, "Failed to load helper data");
};

// 4. Validate Session
export const validateImportSession = async (data, token) => {
  const res = await fetch(`${BASE_URL}/import/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  return safeParseResponse(res, "Validation failed");
};

// 5. Commit Session
export const commitImportSession = async (data, token) => {
  const res = await fetch(`${BASE_URL}/import/commit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  return safeParseResponse(res, "Commit failed");
};
