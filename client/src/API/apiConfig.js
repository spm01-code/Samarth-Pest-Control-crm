const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl.trim()) {
    const cleanUrl = String(envUrl).trim().replace(/\/$/, "");
    if (
      cleanUrl.startsWith("http://") ||
      cleanUrl.startsWith("https://") ||
      cleanUrl.startsWith("/")
    ) {
      return cleanUrl.endsWith("/api") ? cleanUrl : `${cleanUrl}/api`;
    }
    // If protocol was missing (e.g. "spmdashboard.cloud/api"), prepend https:// to avoid ERR_NAME_NOT_RESOLVED
    return `https://${cleanUrl.endsWith("/api") ? cleanUrl : `${cleanUrl}/api`}`;
  }
  return "http://localhost:5000/api";
};

export const BASE_URL = getApiUrl();
