const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_URL = `${BASE_URL}/api/invoices`;

export const createInvoiceAPI = async (
  invoiceData,
  token
) => {
  const response = await fetch(`${API_URL}/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(invoiceData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || "Failed to create invoice"
    );
  }

  return data;
};

export const fetchInvoicesAPI = async (
  token
) => {
  const response = await fetch(API_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || "Failed to fetch invoices"
    );
  }

  return data;
};

export const fetchInvoiceByIdAPI = async (
  id,
  token
) => {
  const response = await fetch(
    `${API_URL}/${id}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || "Failed to fetch invoice"
    );
  }

  return data;
};

export const updateInvoiceAPI = async (
  id,
  invoiceData,
  token
) => {
  const response = await fetch(
    `${API_URL}/${id}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(invoiceData),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || "Failed to update invoice"
    );
  }

  return data;
};

export const deleteInvoiceAPI = async (
  id,
  token
) => {
  const response = await fetch(
    `${API_URL}/${id}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || "Failed to delete invoice"
    );
  }

  return data;
};
