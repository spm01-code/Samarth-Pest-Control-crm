/**
 * Service Date Calculator (Client)
 * Mirrors the server-side calculation rules exactly.
 */

// Helper: Normalize any Date or date string to midnight UTC Date object without timezone shifts
export const parseToUtcDate = (dateInput) => {
  if (!dateInput) return null;

  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    if (!trimmed) return null;

    // Direct YYYY-MM-DD or ISO date prefix at midnight/date-only -> extract calendar date directly
    const isoDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T00:00:00(?:\.\d+)?Z?$)/);
    if (isoDateMatch) {
      const year = Number(isoDateMatch[1]);
      const month = Number(isoDateMatch[2]) - 1;
      const day = Number(isoDateMatch[3]);
      return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    }

    // Direct DD/MM/YYYY format
    const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmyMatch) {
      const day = Number(dmyMatch[1]);
      const month = Number(dmyMatch[2]) - 1;
      const year = Number(dmyMatch[3]);
      return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    }
  }

  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;

  const isUtcMidnight =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;

  const year = isUtcMidnight ? d.getUTCFullYear() : d.getFullYear();
  const month = isUtcMidnight ? d.getUTCMonth() : d.getMonth();
  const day = isUtcMidnight ? d.getUTCDate() : d.getDate();

  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
};

// Helper: Format Date object to YYYY-MM-DD for HTML date input
export const formatDateForInput = (dateInput) => {
  if (!dateInput) return "";
  const d = parseToUtcDate(dateInput);
  if (!d) return "";

  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
    lower === "fourth-night" ||
    lower === "fourth nightly" ||
    lower === "fourthnightly" ||
    lower === "fortnight" ||
    lower === "fortnightly"
  ) {
    return "Fourth nightly";
  }
  if (lower === "quarterly" || lower === "quarter") return "Quarterly";
  if (
    lower === "half-yearly" ||
    lower === "halfyearly" ||
    lower === "half yearly" ||
    lower === "2 services yearly" ||
    lower === "2 service yearly" ||
    lower === "2 services"
  ) {
    return "Half-Yearly";
  }
  if (
    lower === "yearly" ||
    lower === "annual" ||
    lower === "annually" ||
    lower === "1 service yearly" ||
    lower === "1 services yearly"
  ) {
    return "Yearly";
  }
  if (
    lower === "3 services yearly" ||
    lower === "3 service yearly" ||
    lower === "3 services" ||
    lower === "three services yearly" ||
    lower === "3 yearly services" ||
    lower === "3-yearly services" ||
    lower === "3 yearly" ||
    lower === "3-yearly" ||
    lower === "yearly 3 services" ||
    lower === "yearly 3 service"
  ) {
    return "Yearly 3 services";
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
    norm === "monthly" ||
    norm === "Quarterly" ||
    norm === "Half-Yearly" ||
    norm === "Yearly 3 services" ||
    norm === "3 Services Yearly" ||
    norm === "twice a week"
  );
};

const buildMonthlyCycleFutureDates = (serviceDate, totalServices, intervalMonths) => {
  const futureDates = [];
  for (let i = 1; i < totalServices; i++) {
    futureDates.push(addMonthsClamped(serviceDate, i * intervalMonths));
  }
  return futureDates;
};

const pickNextServiceDate = (upcomingServiceDates, referenceDate) => {
  if (!Array.isArray(upcomingServiceDates) || upcomingServiceDates.length === 0) {
    return null;
  }
  const upcoming = upcomingServiceDates.find(
    (d) => d.getTime() >= referenceDate.getTime()
  );
  return upcoming || upcomingServiceDates[0];
};

/**
 * Calculates upcomingServiceDates and nextServiceDate.
 *
 * Service 1 is always `serviceDate` (the initial service date).
 * `upcomingServiceDates` contains only the remaining scheduled future dates.
 *
 * @param {Date|string} serviceDateInput - Initial service date (Service 1)
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

  let upcomingServiceDates;
  let nextServiceDate;

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

    case "Fourth nightly":
    case "fourth night": {
      nextServiceDate = addDays(serviceDate, 14);
      upcomingServiceDates = [nextServiceDate];
      break;
    }

    case "monthly": {
      upcomingServiceDates = buildMonthlyCycleFutureDates(serviceDate, 12, 1);
      nextServiceDate = pickNextServiceDate(upcomingServiceDates, referenceDate);
      break;
    }

    case "Quarterly": {
      upcomingServiceDates = buildMonthlyCycleFutureDates(serviceDate, 4, 3);
      nextServiceDate = pickNextServiceDate(upcomingServiceDates, referenceDate);
      break;
    }

    case "Half-Yearly": {
      upcomingServiceDates = buildMonthlyCycleFutureDates(serviceDate, 2, 6);
      nextServiceDate = pickNextServiceDate(upcomingServiceDates, referenceDate);
      break;
    }

    case "Yearly": {
      upcomingServiceDates = [];
      nextServiceDate = null;
      break;
    }

    case "Yearly 3 services":
    case "3 Services Yearly": {
      upcomingServiceDates = buildMonthlyCycleFutureDates(serviceDate, 3, 4);
      nextServiceDate = pickNextServiceDate(upcomingServiceDates, referenceDate);
      break;
    }

    case "twice a week": {
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
      nextServiceDate = pickNextServiceDate(upcomingServiceDates, referenceDate);
      break;
    }

    default: {
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
