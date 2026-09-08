const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_URL = `${BASE_URL}/api/quotations`;

export const createQuotationAPI = async (
  quotationData,
  token
) => {
  const response = await fetch(`${API_URL}/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(quotationData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || "Failed to create quotation"
    );
  }

  return data;
};

export const fetchQuotationsAPI = async (
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
      data.message || "Failed to fetch quotations"
    );
  }

  return data;
};

export const fetchQuotationByIdAPI = async (
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
      data.message || "Failed to fetch quotation"
    );
  }

  return data;
};

export const fetchCustomerQuotationsAPI = async (
  customerId,
  token
) => {
  const response = await fetch(
    `${API_URL}/customer/${customerId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ||
        "Failed to fetch customer quotations"
    );
  }

  return data;
};

export const updateQuotationAPI = async (
  id,
  quotationData,
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
      body: JSON.stringify(quotationData),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || "Failed to update quotation"
    );
  }

  return data;
};

export const deleteQuotationAPI = async (
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
      data.message || "Failed to delete quotation"
    );
  }

  return data;
};