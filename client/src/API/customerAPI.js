import { BASE_URL } from "./apiConfig";

// GET ALL CUSTOMERS
export const getCustomers = async (token) => {
  if (!token) {
    throw new Error("Please login to view customers");
  }

  const res = await fetch(`${BASE_URL}/customers`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.message || "Failed to fetch customers");
  }

  return result;
};

// GET CUSTOMER BY ID
export const getCustomerByID = async (id, token) => {
  if (!token) {
    throw new Error("Please login to view this customer");
  }

  const res = await fetch(`${BASE_URL}/customers/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.message || "Failed to fetch customer");
  }

  return result;
};

// CREATE CUSTOMER
export const createCustomer = async (data, token) => {
  if (!token) {
    throw new Error("Please login to create customers");
  }

  const res = await fetch(`${BASE_URL}/customers/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.message || "Failed to create customer");
  }

  return result;
};

// UPDATE CUSTOMER
export const updateCustomer = async (id, data, token) => {
  if (!token) {
    throw new Error("Please login to update customers");
  }

  const res = await fetch(`${BASE_URL}/customers/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.message || "Failed to update customer");
  }

  return result;
};

// DELETE CUSTOMER
export const deleteCustomer = async (id, token) => {
  if (!token) {
    throw new Error("Please login to delete customers");
  }

  const res = await fetch(`${BASE_URL}/customers/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.message || "Failed to delete customer");
  }

  return result;
};
