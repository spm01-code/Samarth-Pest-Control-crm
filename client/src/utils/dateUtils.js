/**
 * Centralized Date Formatting Utilities for Samarth Pest Control CRM
 * Standardizes user-facing dates to DD/MM/YYYY.
 *
 * Provides:
 * - isValidCalendarDate: Strict calendar & leap-year validation
 * - formatDateOnly: For date-only business values (serviceDate, invoiceDate, etc.)
 *                   Preserves calendar date without timezone shift.
 * - formatTimestamp: For event timestamps (createdAt, updatedAt) in Asia/Kolkata timezone.
 * - formatDate: Alias for formatDateOnly.
 * - formatDateForInput: For HTML <input type="date"> fields (YYYY-MM-DD).
 */

/**
 * Validates whether day, month, year form a valid calendar date.
 * Strictly verifies month bounds and leap years.
 *
 * @param {number|string} day - 1 to 31
 * @param {number|string} month - 1 to 12
 * @param {number|string} year - 1900 to 2100
 * @returns {boolean}
 */
export const isValidCalendarDate = (day, month, year) => {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);

  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) {
    return false;
  }

  if (y < 1900 || y > 2100) {
    return false;
  }

  if (m < 1 || m > 12) {
    return false;
  }

  const isLeapYear = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysInMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return d >= 1 && d <= daysInMonth[m - 1];
};

/**
 * Formats date-only business values into DD/MM/YYYY.
 * Extracts year, month, and day directly from ISO strings or Date instances
 * without applying timezone conversion, avoiding 1-day shifts across boundaries.
 *
 * @param {string|Date|number} val - Date value to format
 * @param {string} [fallback="-"] - Fallback string if invalid or empty
 * @returns {string} - Formatted date "DD/MM/YYYY" or fallback
 */
export const formatDateOnly = (val, fallback = "-") => {
  if (val === null || val === undefined || val === "") {
    return fallback;
  }

  // Handle strings (e.g. "2026-10-13", "2026-10-13T00:00:00.000Z")
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return fallback;

    // Direct ISO format match YYYY-MM-DD
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]);
      const day = Number(isoMatch[3]);

      if (isValidCalendarDate(day, month, year)) {
        return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
      }
      return fallback;
    }

    // Direct DD/MM/YYYY format match
    const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmyMatch) {
      const day = Number(dmyMatch[1]);
      const month = Number(dmyMatch[2]);
      const year = Number(dmyMatch[3]);

      if (isValidCalendarDate(day, month, year)) {
        return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
      }
      return fallback;
    }
  }

  // Handle Date objects or timestamps
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) {
    return fallback;
  }

  // Use UTC values if timestamp falls exactly at midnight UTC, otherwise local date
  const isUtcMidnight =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;

  const year = isUtcMidnight ? d.getUTCFullYear() : d.getFullYear();
  const month = isUtcMidnight ? d.getUTCMonth() + 1 : d.getMonth() + 1;
  const day = isUtcMidnight ? d.getUTCDate() : d.getDate();

  if (isValidCalendarDate(day, month, year)) {
    return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
  }

  return fallback;
};

/**
 * Formats real audit/event timestamps in explicit Asia/Kolkata timezone.
 *
 * @param {string|Date|number} val - Timestamp value
 * @param {string} [fallback="-"] - Fallback string if invalid or empty
 * @param {boolean} [includeTime=false] - Whether to include time (hh:mm A)
 * @returns {string} - Formatted timestamp string or fallback
 */
export const formatTimestamp = (val, fallback = "-", includeTime = false) => {
  if (val === null || val === undefined || val === "") {
    return fallback;
  }

  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) {
    return fallback;
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      ...(includeTime
        ? {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }
        : {}),
    });

    return formatter.format(d).replace(/\b([ap]m)\b/i, (m) => m.toUpperCase());
  } catch (err) {
    return fallback;
  }
};

/**
 * Formats a date value for HTML <input type="date"> fields (YYYY-MM-DD).
 *
 * @param {string|Date|number} dateInput
 * @returns {string} - "YYYY-MM-DD" or ""
 */
export const formatDateForInput = (dateInput) => {
  if (!dateInput) return "";

  if (typeof dateInput === "string") {
    const match = dateInput.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return "";

  const isUtcMidnight =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;

  const year = isUtcMidnight ? d.getUTCFullYear() : d.getFullYear();
  const month = String(isUtcMidnight ? d.getUTCMonth() + 1 : d.getMonth() + 1).padStart(2, "0");
  const day = String(isUtcMidnight ? d.getUTCDate() : d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

/**
 * Default alias: formatDate maps directly to formatDateOnly
 */
export const formatDate = formatDateOnly;

export default {
  isValidCalendarDate,
  formatDateOnly,
  formatTimestamp,
  formatDateForInput,
  formatDate,
};
