const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_URL = `${BASE_URL}/api/company-settings`;

export const fetchCompanySettingsAPI = async (token) => {
  const response = await fetch(API_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to fetch company settings");
  }

  return data;
};

export const updateCompanySettingsAPI = async (settingsData, token) => {
  const response = await fetch(API_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(settingsData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to update company settings");
  }

  return data;
};
