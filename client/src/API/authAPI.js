import { BASE_URL } from "./apiConfig";

// REGISTER (NORMAL / EMPLOYEE)
export const registerUser = async (data) => {
  const res = await fetch(`${BASE_URL}/admin/register`, {
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
  const res = await fetch(`${BASE_URL}/admin/verifyotp`, {
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

// LOGIN (NORMAL)
export const loginUser = async (data) => {
  const res = await fetch(`${BASE_URL}/admin/login`, {
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

// SECRET ADMIN LOGIN
export const loginSecretAdminAPI = async (secretPath, data) => {
  const res = await fetch(`${BASE_URL}/secure-access/${secretPath}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(data),
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.message || "Admin login failed");
  }

  return result;
};

// SECRET ADMIN REGISTRATION
export const registerSecretAdminAPI = async (secretPath, data) => {
  const res = await fetch(`${BASE_URL}/secure-access/${secretPath}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-bootstrap-secret": data.bootstrapSecret || "",
    },
    body: JSON.stringify(data),
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.message || "Admin registration failed");
  }

  return result;
};

// LOGOUT
export const logoutUserAPI = async () => {
  try {
    const res = await fetch(`${BASE_URL}/admin/logout`, {
      method: "POST",
      credentials: "include",
    });
    return await res.json();
  } catch (err) {
    return { success: true };
  }
};

// REFRESH TOKEN
export const refreshAccessToken = async () => {
  const res = await fetch(`${BASE_URL}/admin/refresh`, {
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
  const res = await fetch(`${BASE_URL}/admin/resend-otp`, {
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
  const res = await fetch(`${BASE_URL}/admin/change-password/request-otp`, {
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
  const res = await fetch(`${BASE_URL}/admin/change-password/verify`, {
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

// ==========================================
// ADMIN USER MANAGEMENT APIS
// ==========================================

export const fetchUsersAPI = async (token) => {
  const res = await fetch(`${BASE_URL}/admin/users`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.message || "Failed to fetch users");
  }

  return result;
};

export const updateUserRoleAPI = async (id, role, token) => {
  const res = await fetch(`${BASE_URL}/admin/users/${id}/role`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ role }),
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.message || "Failed to update role");
  }

  return result;
};

export const toggleUserStatusAPI = async (id, isActive, token) => {
  const res = await fetch(`${BASE_URL}/admin/users/${id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ isActive }),
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.message || "Failed to update status");
  }

  return result;
};

export const fetchAuditLogsAPI = async (token, page = 1, limit = 50) => {
  const res = await fetch(`${BASE_URL}/admin/audit-logs?page=${page}&limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.message || "Failed to fetch audit logs");
  }

  return result;
};
