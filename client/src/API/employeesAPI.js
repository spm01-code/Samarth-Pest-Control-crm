const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// GET ALL EMPLOYEES
export const fetchEmployeesAPI = async (token) => {
  if (!token) {
    throw new Error("Please login to view employees");
  }

  const res = await fetch(
    `${BASE_URL}/api/employees`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const result = await res.json();

  if (!res.ok) {
    throw new Error(
      result.message || "Failed to fetch employees"
    );
  }

  return result;
};

// GET EMPLOYEE BY ID
export const fetchEmployeeAPI = async (
  id,
  token
) => {
  if (!token) {
    throw new Error("Please login to view employee");
  }

  const res = await fetch(
    `${BASE_URL}/api/employees/${id}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const result = await res.json();

  if (!res.ok) {
    throw new Error(
      result.message || "Failed to fetch employee"
    );
  }

  return result;
};

// CREATE EMPLOYEE
export const createEmployeeAPI = async (
  employeeData,
  token
) => {
  if (!token) {
    throw new Error("Please login to create employee");
  }

  const res = await fetch(
    `${BASE_URL}/api/employees/create`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(employeeData),
    }
  );

  const result = await res.json();

  if (!res.ok) {
    throw new Error(
      result.message || "Failed to create employee"
    );
  }

  return result;
};

// UPDATE EMPLOYEE
export const updateEmployeeAPI = async (
  id,
  employeeData,
  token
) => {
  if (!token) {
    throw new Error("Please login to update employee");
  }

  const res = await fetch(
    `${BASE_URL}/api/employees/${id}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(employeeData),
    }
  );

  const result = await res.json();

  if (!res.ok) {
    throw new Error(
      result.message || "Failed to update employee"
    );
  }

  return result;
};

// DELETE EMPLOYEE
export const deleteEmployeeAPI = async (
  id,
  token
) => {
  if (!token) {
    throw new Error("Please login to delete employee");
  }

  const res = await fetch(
    `${BASE_URL}/api/employees/${id}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const result = await res.json();

  if (!res.ok) {
    throw new Error(
      result.message || "Failed to delete employee"
    );
  }

  return result;
};