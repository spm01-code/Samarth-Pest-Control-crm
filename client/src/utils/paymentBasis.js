export const PAYMENT_BASIS_OPTIONS = [
  { value: "per-service", label: "Per Service" },
  { value: "per-month", label: "Per Month" },
  { value: "per-year", label: "Per Year" },
];

export const PAYMENT_BASIS_LABELS = {
  "per-service": "Per Service",
  "per-month": "Per Month",
  "per-year": "Per Year",
};

export function formatPaymentBasis(value, fallback = "Not Specified") {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase().replace(/[\s_]+/g, "-");
  return PAYMENT_BASIS_LABELS[normalized] || fallback;
}
