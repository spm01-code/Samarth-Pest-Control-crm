const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// REGISTER
export const registerUser = async (data) => {
  const res = await fetch(`${BASE_URL}/api/admin/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.message || "Registration failed");
  }

  return result;
};

// VERIFY OTP
export const verifyOTP = async (data) => {
  const res = await fetch(`${BASE_URL}/api/admin/verifyotp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.message || "OTP verification failed");
  }

  return result;
};

// LOGIN
export const loginUser = async (data) => {
  const res = await fetch(`${BASE_URL}/api/admin/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(data),
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.message || "Login failed");
  }

  return result;
};

// REFRESH TOKEN
export const refreshAccessToken = async () => {
  const res = await fetch(`${BASE_URL}/api/admin/refresh`, {
    method: "POST",
    credentials: "include",
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.message || "Session expired");
  }

  return result;
};

// GET PROFILE
export const getProfile = async (token) => {
  const res = await fetch(`${BASE_URL}/api/admin/profile`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.message || "Failed to fetch profile");
  }

  return result;
};
