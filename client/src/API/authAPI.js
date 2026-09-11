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

// RESEND REGISTRATION OTP
export const resendRegistrationOTP = async (data) => {
  const res = await fetch(`${BASE_URL}/api/admin/resend-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.message || "Failed to resend OTP");
  }

  return result;
};

// REQUEST PASSWORD CHANGE OTP
export const requestPasswordChangeOTP = async (data, token) => {
  const res = await fetch(`${BASE_URL}/api/admin/change-password/request-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.message || "Failed to request password change code");
  }

  return result;
};

// VERIFY PASSWORD CHANGE
export const verifyPasswordChangeAPI = async (data, token) => {
  const res = await fetch(`${BASE_URL}/api/admin/change-password/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.message || "Failed to verify password change");
  }

  return result;
};

