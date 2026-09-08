/**
 * Service Date Calculator
 * Handles recurrence calculations and next service dates across CRM service frequencies.
 */

// Helper: Normalize any Date or date string to midnight UTC Date object
export const parseToUtcDate = (dateInput) => {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;

  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
  );
};

// Helper: Add days safely in UTC
export const addDays = (baseDate, days) => {
  const d = new Date(baseDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

// Helper: Add months with month-end clamping (e.g. Jan 31 + 1 month -> Feb 28 or 29)
export const addMonthsClamped = (baseDate, monthsToAdd) => {
  const d = new Date(baseDate);
  const targetDay = d.getUTCDate();
  const targetMonth = d.getUTCMonth() + monthsToAdd;

  // 1st of target month
  const temp = new Date(Date.UTC(d.getUTCFullYear(), targetMonth, 1, 0, 0, 0, 0));
  // Last day of target month is obtained by taking day 0 of month after temp
  const daysInMonth = new Date(
    Date.UTC(temp.getUTCFullYear(), temp.getUTCMonth() + 1, 0, 0, 0, 0, 0)
  ).getUTCDate();

  const clampedDay = Math.min(targetDay, daysInMonth);
  temp.setUTCDate(clampedDay);
  return temp;
};

// Normalized canonical frequency lookup
export const normalizeFrequency = (freq) => {
  if (!freq) return "";
  const trimmed = String(freq).trim();
  const lower = trimmed.toLowerCase();

  if (
    lower === "one-time" ||
    lower === "onetime" ||
    lower === "one time" ||
    lower === "one-time-job" ||
    lower === "onetimejob" ||
    lower === "one time job"
  ) {
    return "one-time";
  }
  if (lower === "weekly" || lower === "week") return "weekly";
  if (lower === "twice a week" || lower === "twiceaweek" || lower === "twice") return "twice a week";
  if (lower === "monthly" || lower === "month") return "monthly";
  if (
    lower === "fourth night" ||
    lower === "fourthnight" ||
    lower === "fortnight" ||
    lower === "fortnightly"
  ) {
    return "fourth night";
  }
  if (lower === "quarterly" || lower === "quarter") return "Quarterly";
  if (
    lower === "3 services yearly" ||
    lower === "3 service yearly" ||
    lower === "3 services" ||
    lower === "three services yearly"
  ) {
    return "3 Services Yearly";
  }

  return trimmed;
};

export const isOneTimeJobService = (service) => {
  if (!service) return false;
  const freq = typeof service === "object" ? service.frequency : service;
  return normalizeFrequency(freq) === "one-time";
};

export const isMultiDateFrequency = (frequency) => {
  const norm = normalizeFrequency(frequency);
  return (
    norm === "Quarterly" ||
    norm === "3 Services Yearly" ||
    norm === "twice a week"
  );
};

/**
 * Calculates upcomingServiceDates and nextServiceDate.
 *
 * @param {Date|string} serviceDateInput - Service started date
 * @param {string} frequencyInput - Frequency string
 * @param {Date|string} [referenceDateInput=new Date()] - Reference date (today) for nextServiceDate determination
 * @returns {{ nextServiceDate: Date|null, upcomingServiceDates: Date[] }}
 */
export const calculateServiceDates = (
  serviceDateInput,
  frequencyInput,
  referenceDateInput = new Date()
) => {
  const serviceDate = parseToUtcDate(serviceDateInput);
  if (!serviceDate) {
    return { nextServiceDate: null, upcomingServiceDates: [] };
  }

  const frequency = normalizeFrequency(frequencyInput);
  const referenceDate = parseToUtcDate(referenceDateInput) || parseToUtcDate(new Date());

  let upcomingServiceDates = [];
  let nextServiceDate = null;

  switch (frequency) {
    case "one-time": {
      upcomingServiceDates = [];
      nextServiceDate = null;
      break;
    }

    case "weekly": {
      nextServiceDate = addDays(serviceDate, 7);
      upcomingServiceDates = [nextServiceDate];
      break;
    }

    case "fourth night": {
      nextServiceDate = addDays(serviceDate, 14);
      upcomingServiceDates = [nextServiceDate];
      break;
    }

    case "monthly": {
      nextServiceDate = addMonthsClamped(serviceDate, 1);
      upcomingServiceDates = [nextServiceDate];
      break;
    }

    case "Quarterly": {
      // 4 quarters over 1 year: +3m, +6m, +9m, +12m
      const q1 = addMonthsClamped(serviceDate, 3);
      const q2 = addMonthsClamped(serviceDate, 6);
      const q3 = addMonthsClamped(serviceDate, 9);
      const q4 = addMonthsClamped(serviceDate, 12);
      upcomingServiceDates = [q1, q2, q3, q4];

      // Earliest date that is >= referenceDate; if all passed or none passed, earliest date in list
      const upcoming = upcomingServiceDates.find(
        (d) => d.getTime() >= referenceDate.getTime()
      );
      nextServiceDate = upcoming || upcomingServiceDates[0];
      break;
    }

    case "3 Services Yearly": {
      // 3 occurrences within 1 year: +4m, +8m, +12m
      const s1 = addMonthsClamped(serviceDate, 4);
      const s2 = addMonthsClamped(serviceDate, 8);
      const s3 = addMonthsClamped(serviceDate, 12);
      upcomingServiceDates = [s1, s2, s3];

      const upcoming = upcomingServiceDates.find(
        (d) => d.getTime() >= referenceDate.getTime()
      );
      nextServiceDate = upcoming || upcomingServiceDates[0];
      break;
    }

    case "twice a week": {
      // Starting from serviceDate, alternating +3 days and +4 days
      // For the 1-year contract period (up to serviceDate + 12 months)
      const oneYearEnd = addMonthsClamped(serviceDate, 12);
      const dates = [];

      let currentDate = new Date(serviceDate);
      let stepToggle = true; // true: +3 days, false: +4 days

      while (true) {
        const addCount = stepToggle ? 3 : 4;
        currentDate = addDays(currentDate, addCount);
        if (currentDate.getTime() > oneYearEnd.getTime()) {
          break;
        }
        dates.push(new Date(currentDate));
        stepToggle = !stepToggle;
      }

      upcomingServiceDates = dates;
      const upcoming = upcomingServiceDates.find(
        (d) => d.getTime() >= referenceDate.getTime()
      );
      nextServiceDate = upcoming || (upcomingServiceDates.length > 0 ? upcomingServiceDates[0] : null);
      break;
    }

    default: {
      // Fallback: keep existing nextServiceDate if unknown frequency
      upcomingServiceDates = [];
      nextServiceDate = null;
      break;
    }
  }

  return {
    nextServiceDate,
    upcomingServiceDates,
  };
};
