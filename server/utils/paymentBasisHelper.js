export const PAYMENT_BASIS_VALUES = ["per-service", "per-month", "per-year"];

export const PAYMENT_BASIS_LABELS = {
  "per-service": "Per Service",
  "per-month": "Per Month",
  "per-year": "Per Year",
};

/**
 * Normalizes a paymentBasis string to one of the canonical enum values,
 * or returns undefined when absent/empty, or null when invalid.
 */
export const parsePaymentBasis = (value) => {
  if (value === undefined || value === null) {
    return { valid: true, value: undefined, isEmpty: true };
  }

  const raw = String(value).trim();
  if (!raw) {
    return { valid: true, value: undefined, isEmpty: true };
  }

  const normalized = raw.toLowerCase().replace(/[\s_]+/g, "-");
  if (PAYMENT_BASIS_VALUES.includes(normalized)) {
    return { valid: true, value: normalized, isEmpty: false };
  }

  return {
    valid: false,
    value: null,
    isEmpty: false,
    error: `Invalid paymentBasis "${raw}". Allowed values are: ${PAYMENT_BASIS_VALUES.join(", ")}`,
  };
};

/**
 * Formats a stored paymentBasis value for UI or document display.
 */
export const formatPaymentBasisLabel = (value, fallback = "Not Specified") => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  const parsed = parsePaymentBasis(value);
  if (parsed.valid && parsed.value) {
    return PAYMENT_BASIS_LABELS[parsed.value] || fallback;
  }
  return fallback;
};

/**
 * Validates and normalizes `paymentBasis` on an array of service or treatment subdocuments.
 * Strips empty/null values so legacy/unspecified entries remain absent rather than failing Mongoose enum validation.
 */
export const sanitizeItemsPaymentBasis = (items) => {
  if (!Array.isArray(items)) {
    return { valid: true, items };
  }
  const sanitized = [];
  for (const item of items) {
    if (!item || typeof item !== "object") {
      sanitized.push(item);
      continue;
    }
    const copy = { ...item };
    const parsed = parsePaymentBasis(copy.paymentBasis);
    if (!parsed.valid) {
      return { valid: false, error: parsed.error };
    }
    if (parsed.value) {
      copy.paymentBasis = parsed.value;
    } else {
      delete copy.paymentBasis;
    }
    sanitized.push(copy);
  }
  return { valid: true, items: sanitized };
};
