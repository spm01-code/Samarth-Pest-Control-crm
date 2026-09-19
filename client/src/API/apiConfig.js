const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
  const cleanUrl = String(envUrl).trim().replace(/\/$/, "");
  return cleanUrl.endsWith("/api") ? cleanUrl : `${cleanUrl}/api`;
};

export const BASE_URL = getApiUrl();
