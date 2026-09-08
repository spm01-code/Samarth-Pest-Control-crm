/**
 * Sanitizes backend errors and network failures into safe, user-friendly messages.
 * Prevents raw MongoDB errors, stack traces, database field names, and URLs from exposing to users.
 *
 * @param {any} error - The error thrown, caught, or returned from Redux unwrap / rejection
 * @param {string} fallback - A safe fallback message describing the failed operation
 * @returns {string} Clean, user-friendly error message
 */
export function getErrorMessage(
  error,
  fallback = "An unexpected error occurred. Please try again."
) {
  if (!error) return fallback;

  let rawMessage = "";

  if (typeof error === "string") {
    rawMessage = error;
  } else if (typeof error === "object") {
    rawMessage =
      error.response?.data?.message ||
      error.message ||
      error.error ||
      (typeof error.data === "string" ? error.data : "");
  }

  rawMessage = String(rawMessage).trim();
  if (!rawMessage) return fallback;

  const lower = rawMessage.toLowerCase();

  // 1. Handle MongoDB duplicate key errors (E11000)
  if (rawMessage.includes("E11000") || lower.includes("duplicate key")) {
    if (lower.includes("phone")) {
      return "A record with this phone number already exists.";
    }
    if (lower.includes("email")) {
      return "A record with this email address already exists.";
    }
    if (lower.includes("invoicenumber") || lower.includes("invoice_number")) {
      return "An invoice with this invoice number already exists.";
    }
    if (lower.includes("quotationnumber") || lower.includes("quotation_number")) {
      return "A quotation with this quotation number already exists.";
    }
    if (lower.includes("renewalnumber") || lower.includes("renewal_number")) {
      return "A contract renewal with this renewal number already exists.";
    }
    return "A record with these details already exists.";
  }

  // 2. Handle network and connectivity failures
  if (
    rawMessage.includes("Failed to fetch") ||
    rawMessage.includes("NetworkError") ||
    rawMessage.includes("Network Error") ||
    rawMessage.includes("ECONNREFUSED") ||
    rawMessage.includes("ETIMEDOUT")
  ) {
    return "Unable to connect to the server. Please check your network connection.";
  }

  // 3. Reject raw technical error patterns and stack traces
  const technicalPatterns = [
    /Cast to ObjectId/i,
    /ValidationError/i,
    /BSON/i,
    /Mongo(?:Server)?Error/i,
    /node_modules/i,
    /at\s+[\w.<>$]+(?:\s+\(.*\))?/i, // Stack trace line
    /SyntaxError/i,
    /TypeError/i,
    /ReferenceError/i,
    /UnhandledPromiseRejection/i,
    /https?:\/\/[^\s]+/i, // URLs
  ];

  for (const pattern of technicalPatterns) {
    if (pattern.test(rawMessage)) {
      return fallback;
    }
  }

  // 4. If message is short, clear, and looks user-facing, return it
  if (rawMessage.length > 0 && rawMessage.length <= 150 && !rawMessage.includes("\n")) {
    return rawMessage;
  }

  return fallback;
}
