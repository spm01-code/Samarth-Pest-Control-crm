import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import Customer from "../model/customerModel.js";
import Employee from "../model/employeeModel.js";
import Service from "../model/serviceModel.js";
import Renewal from "../model/renewalModel.js";
import Invoice from "../model/invoiceModel.js";
import Quotation from "../model/quotationModel.js";
import ImportSession from "../model/importSessionModel.js";
import { calculateServiceDates } from "../utils/serviceDateCalculator.js";
import { classifyWorksheet, resolveTargetCrmEntity } from "../utils/importClassifier.js";

// Helper: Normalize String for Matching
const normalizeStr = (str) => {
  if (!str) return "";
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
};

// Helper: Extract primary company/client name before address separators
export const extractPrimaryName = (fullName) => {
  if (!fullName) return "";
  const str = String(fullName).trim();
  if (str.includes("\n")) return str.split("\n")[0].trim();

  // Multi-space after comma delimiter
  const commaMultiSpace = str.match(/^(.*?),\s{2,}(.*)$/s);
  if (commaMultiSpace) return commaMultiSpace[1].trim();

  // Explicit corporate suffix followed by comma
  const compMatch = str.match(/^(.*?(?:pvt\.?\s*ltd\.?|limited|llp|chs|chsl|co-?op\s*(?:hsg\s*)?soc(?:iety)?(?:\s*ltd)?|inc\.?|corporation))\s*,\s*(.*)$/i);
  if (compMatch) return compMatch[1].trim();

  // Comma followed by address indicator
  const addrPrefix = str.match(/^(.*?),\s*(?=(?:flat|bldg|building|plot|sector|shop|room|gala|no\.|h\.?\s*no|near|opp|behind|at|cst|lbs|s\.?\s*t\.?|d\/|c\/|a\/|b\/|kamdhenu|ocean|panchasara|[0-9#])\b)/i);
  if (addrPrefix) return addrPrefix[1].trim();

  return str;
};

// Helper: Extract embedded address if full string contains comma or newline
export const extractEmbeddedAddress = (fullName) => {
  if (!fullName) return "";
  const str = String(fullName).trim();
  if (str.includes("\n")) {
    const lines = str.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) return lines.slice(1).join(", ");
  }
  const commaMultiSpace = str.match(/^(.*?),\s{2,}(.*)$/s);
  if (commaMultiSpace && commaMultiSpace[2].trim()) return commaMultiSpace[2].trim();

  const compMatch = str.match(/^(.*?(?:pvt\.?\s*ltd\.?|limited|llp|chs|chsl|co-?op\s*(?:hsg\s*)?soc(?:iety)?(?:\s*ltd)?|inc\.?|corporation))\s*,\s*(.*)$/i);
  if (compMatch && compMatch[2].trim()) return compMatch[2].trim();

  const addrPrefix = str.match(/^(.*?),\s*((?:flat|bldg|building|plot|sector|shop|room|gala|no\.|h\.?\s*no|near|opp|behind|at|cst|lbs|s\.?\s*t\.?|d\/|c\/|a\/|b\/|kamdhenu|ocean|panchasara|[0-9#]).*)$/i);
  if (addrPrefix && addrPrefix[2].trim()) return addrPrefix[2].trim();

  return "";
};

// Helper: Strip common corporate suffixes for flexible matching
export const stripCompanySuffixes = (str) => {
  if (!str) return "";
  return normalizeStr(str)
    .replace(/(pvt|ltd|private|limited|llp|chs|coop|society|inc|corp|infrastructure|infra|developers|builders|group|firm|enterprises|services|project|projects|llc)$/g, "");
};

// Smart Customer Matcher
export const findMatchingCustomer = (candidateName, candidatePhone, candidateGst, candidateAddr, customersList) => {
  if (!customersList || customersList.length === 0) return null;

  const normPhone = candidatePhone ? normalizeStr(candidatePhone) : "";
  const normGst = candidateGst ? normalizeStr(candidateGst) : "";
  const rawName = candidateName ? String(candidateName).trim() : "";
  const primaryName = extractPrimaryName(rawName);

  const normRawName = normalizeStr(rawName);
  const normPrimaryName = normalizeStr(primaryName);
  const strippedPrimary = stripCompanySuffixes(primaryName);

  // 1. Priority: Exact Phone Match
  if (normPhone) {
    const match = customersList.find((c) => c.phone && normalizeStr(c.phone) === normPhone);
    if (match) return match;
  }

  // 2. Priority: Exact GST Match
  if (normGst) {
    const match = customersList.find((c) => c.gstNumber && normalizeStr(c.gstNumber) === normGst);
    if (match) return match;
  }

  if (!rawName && !primaryName) return null;

  // 3. Priority: Exact Name + Address Composite
  if (candidateAddr) {
    const normAddr = normalizeStr(candidateAddr);
    const match = customersList.find(
      (c) => c.fullName && c.address &&
        normalizeStr(c.fullName) === normRawName &&
        normalizeStr(c.address) === normAddr
    );
    if (match) return match;
  }

  // 4. Priority: Exact Name Match (raw or primary name)
  const exactMatch = customersList.find((c) => {
    if (!c.fullName) return false;
    const cNorm = normalizeStr(c.fullName);
    return cNorm === normRawName || cNorm === normPrimaryName;
  });
  if (exactMatch) return exactMatch;

  // 5. Priority: Prefix & Corporate Suffix Match (handles "BHAIRAV SMILE INFRAPROJECTS" vs "BHAIRAV SMILE INFRAPROJECT")
  const prefixMatch = customersList.find((c) => {
    if (!c.fullName) return false;
    const cNorm = normalizeStr(c.fullName);
    const cStripped = stripCompanySuffixes(c.fullName);

    if (normPrimaryName.length >= 5 && (cNorm.startsWith(normPrimaryName) || normPrimaryName.startsWith(cNorm))) {
      return true;
    }

    if (cStripped.length >= 5 && strippedPrimary.length >= 5) {
      if (cStripped === strippedPrimary || cStripped.startsWith(strippedPrimary) || strippedPrimary.startsWith(cStripped)) {
        return true;
      }
    }
    return false;
  });

  return prefixMatch || null;
};

// Helper: Parse Date Safely (including MMM--YY, Excel serials, DD/MM/YYYY)
export const parseExcelDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === "number") {
    // Excel serial number
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(date.getTime()) ? null : date;
  }
  if (typeof val === "string") {
    const s = val.trim();
    if (!s) return null;

    // Check for Month-Year format like "SEP--26", "AUG--25", "OCT--26", "JAN--27", "FEB-26", "JUL--26"
    const monthYearMatch = s.match(/^([a-zA-Z]{3,})[\s\-]+(\d{2,4})$/);
    if (monthYearMatch) {
      const monthStr = monthYearMatch[1].toUpperCase();
      const yearVal = parseInt(monthYearMatch[2], 10);
      const fullYear = yearVal < 100 ? 2000 + yearVal : yearVal;
      const monthMap = {
        JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
        JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
      };
      const monthIdx = monthMap[monthStr.substring(0, 3)];
      if (monthIdx !== undefined) {
        // Contract expiry / renewal date: use the last day of that month in UTC
        const lastDay = new Date(Date.UTC(fullYear, monthIdx + 1, 0)).getUTCDate();
        return new Date(Date.UTC(fullYear, monthIdx, lastDay));
      }
    }

    // Try DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const parts = s.split(/[\/\-\.]/);
    if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p.trim()))) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      const fullYear = year < 100 ? 2000 + year : year;
      if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
        const d = new Date(Date.UTC(fullYear, month, day));
        if (!isNaN(d.getTime())) return d;
      }
    }

    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
};

// Helper: Parse Excel Time Safely (converts decimal day fractions e.g. 0.708333 to "05:00 PM")
export const parseExcelTime = (val) => {
  if (val === undefined || val === null || val === "") return "";
  if (typeof val === "number") {
    if (val >= 0 && val < 1) {
      const totalSeconds = Math.round(val * 86400);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const ampm = hours >= 12 ? "PM" : "AM";
      const displayHours = hours % 12 || 12;
      const displayMinutes = String(minutes).padStart(2, "0");
      return `${String(displayHours).padStart(2, "0")}:${displayMinutes} ${ampm}`;
    }
  }
  const s = String(val).trim();
  const num = parseFloat(s);
  if (!isNaN(num) && num > 0 && num < 1 && /^\d*\.?\d+$/.test(s)) {
    return parseExcelTime(num);
  }
  return s;
};

// ============================================================
// Safe Update: Field Whitelists per Entity
// Only these fields may be written via findByIdAndUpdate.
// Protected fields (_id, createdAt, updatedAt, status, etc.)
// are excluded.
// ============================================================
const UPDATE_WHITELISTS = {
  Customer: ["fullName", "email", "address", "contactPerson", "gstNumber", "companyName", "customerType", "alternatePhone"],
  Employee: ["fullName", "email", "address", "role", "salary", "joiningDate"],
  Service: ["jobNo", "serviceName", "serviceDate", "serviceTime", "address", "amount", "area", "locationOfPest", "reference", "clientReference", "frequency", "contactPerson", "contactNumber", "remark", "paymentDetails", "operatorName"],
  Invoice: ["invoiceDate", "premisesTreated", "treatmentType", "hsnCode", "subtotal", "totalAmount", "gstNumber", "tds", "rtn", "gstFile", "billingPeriod", "amountInWords"],
  Quotation: ["quotationDate", "premises", "billingTerm", "totalAmount", "notes"],
  Renewal: ["paymentTerm", "contractEndDate", "notes"],
};

function sanitizeForUpdate(entityType, rawData) {
  const allowed = UPDATE_WHITELISTS[entityType] || [];
  const safe = {};
  for (const key of allowed) {
    if (rawData[key] !== undefined && rawData[key] !== "") {
      const val = rawData[key];
      // CRITICAL: Safe update protection!
      // Never overwrite populated address with "Address not provided", "N/A", or "-"
      if (key === "address" && (val === "Address not provided" || val === "N/A" || val === "-")) {
        continue;
      }
      safe[key] = val;
    }
  }
  return safe;
}

// ============================================================
// Deterministic Payment History Extraction
// Groups repeating payment columns (RECEIVED/DATE/MODE/BALANCE)
// into paymentHistory entries based on column sequence and
// normalized header suffixes.
// ============================================================

// Recognized payment header patterns (normalized uppercase)
const PAYMENT_COLUMN_PATTERNS = {
  receivedAmount: [/^RECEIVED\s*AMOUNT\d*$/i, /^RECIVED\s*AMOUNT\d*$/i, /^RECIVED\s*AM.*$/i, /^IVED\s*AN?\d*$/i, /^RECEIVED\d*$/i, /^CREDIT\d*$/i],
  date: [/^DATE\d*$/i, /^PAYMENT\s*DATE\d*$/i],
  mode: [/^MODE\s*(BY)?\d*$/i, /^PAYMENT\s*MODE\d*$/i],
  balance: [/^BALANCE\d*$/i, /^BALANCE\s*AMOUNT\d*$/i, /^BAL\d*$/i],
  remark: [/^REMARK\d*$/i],
};

function classifyPaymentHeader(header) {
  const h = header.trim();
  for (const [field, patterns] of Object.entries(PAYMENT_COLUMN_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(h)) return field;
    }
  }
  return null;
}

function extractSuffix(header) {
  // Extract trailing number: "DATE3" → 3, "BALANCE" → 0, "RECEIVED AMOUNT2" → 2
  const match = header.trim().match(/(\d+)\s*$/);
  return match ? parseInt(match[1], 10) : 0;
}

function buildPaymentHistoryFromColumns(paymentColumns, paymentData, headers) {
  const warnings = [];

  // If we have an array of column occurrences with positions
  const cols = Array.isArray(paymentColumns) && paymentColumns.length > 0
    ? paymentColumns
    : (headers || Object.keys(paymentData || {})).map((header, idx) => ({
        header,
        colIdx: idx,
        val: (paymentData && paymentData[header]) || "",
      }));

  // Step 1: Classify columns and check for unrecognized columns
  const classified = [];
  for (const col of cols) {
    if (!col.val || String(col.val).trim() === "") continue;
    const field = classifyPaymentHeader(col.header);
    if (field) {
      const suffix = extractSuffix(col.header);
      classified.push({ ...col, field, suffix });
    } else {
      // Unrecognized column - DO NOT GUESS. Leave unmapped and generate a warning.
      warnings.push(`Unrecognized payment column '${col.header}' with value '${col.val}' left unmapped.`);
    }
  }

  if (classified.length === 0) return { entries: [], warnings };

  // Step 2: Determine grouping strategy
  // Check if explicit numbered suffixes (> 1) are present
  const hasNumberedSuffixes = classified.some((c) => c.suffix > 1);

  const groups = new Map();

  if (hasNumberedSuffixes) {
    // Suffix-based grouping: suffix 0/1 → Group 1, suffix 2 → Group 2, suffix 3 → Group 3, etc.
    for (const col of classified) {
      const groupKey = col.suffix <= 1 ? 1 : col.suffix;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, { receivedAmount: null, date: null, mode: null, balance: null, remark: null });
      }
      const group = groups.get(groupKey);
      if (group[col.field] === null) {
        group[col.field] = col.val;
      } else {
        // Ambiguous: duplicate value for same field in same group. DO NOT GUESS.
        warnings.push(`Ambiguous payment column '${col.header}' for Group ${groupKey}. Left unmapped.`);
      }
    }
  } else {
    // Sequential grouping: whenever we encounter a field that is already populated in the current group,
    // or a new receivedAmount, start the next group
    let currentGroupIdx = 1;
    let currentGroup = { receivedAmount: null, date: null, mode: null, balance: null, remark: null };
    groups.set(currentGroupIdx, currentGroup);

    for (const col of classified) {
      // If the field is already filled or this is another receivedAmount, start new group
      if (currentGroup[col.field] !== null) {
        currentGroupIdx++;
        currentGroup = { receivedAmount: null, date: null, mode: null, balance: null, remark: null };
        groups.set(currentGroupIdx, currentGroup);
      }
      currentGroup[col.field] = col.val;
    }
  }

  // Step 3: Convert groups to paymentHistory entries, skipping empty groups
  const entries = [];
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => a - b);

  for (const key of sortedKeys) {
    const g = groups.get(key);
    const receivedAmount = g.receivedAmount ? parseFloat(g.receivedAmount) : 0;
    const balance = g.balance ? parseFloat(g.balance) : 0;

    // Skip entry if both receivedAmount and balance are 0 or NaN and no date or mode
    if ((isNaN(receivedAmount) || receivedAmount === 0) && (isNaN(balance) || balance === 0) && !g.date && !g.mode) {
      continue;
    }

    entries.push({
      receivedAmount: isNaN(receivedAmount) ? 0 : receivedAmount,
      date: parseExcelDate(g.date) || undefined,
      mode: g.mode || "",
      balance: isNaN(balance) ? 0 : balance,
      remark: g.remark || "",
    });
  }

  return { entries, warnings };
}

// ============================================================
// Invoice Type Determination
// Uses the actual source worksheet structure (presence of GST
// columns: CGST, SGST, IGST, HSN, SAC, PARTY GST NO) to
// determine if the worksheet represents GST or NON_GST invoices.
// ============================================================
export function determineInvoiceType(mappings, rowData) {
  // If explicitly provided on the row
  if (rowData && rowData.invoiceType && ["GST", "NON_GST"].includes(String(rowData.invoiceType).toUpperCase())) {
    return String(rowData.invoiceType).toUpperCase();
  }

  // Check if GST-related columns exist in the mappings (worksheet structure)
  const mappedFields = new Set(Object.values(mappings || {}).filter((v) => v !== "UNMAPPED"));
  const hasGstStructure =
    mappedFields.has("cgstAmount") ||
    mappedFields.has("sgstAmount") ||
    mappedFields.has("igstAmount") ||
    mappedFields.has("hsnCode") ||
    mappedFields.has("gstNumber");

  if (hasGstStructure) {
    return "GST";
  }

  // Check original headers in mappings keys
  const mappingKeys = Object.keys(mappings || {}).map((k) => k.toUpperCase());
  const hasGstHeaders = mappingKeys.some(
    (k) =>
      k.includes("CGST") ||
      k.includes("SGST") ||
      k.includes("IGST") ||
      k.includes("HSN") ||
      k.includes("SAC") ||
      k.includes("GST NO") ||
      k.includes("GST FILE") ||
      k.includes("GST FIL")
  );

  if (hasGstHeaders) {
    return "GST";
  }

  // If row data contains GST number or positive tax amounts
  if (
    rowData &&
    (rowData.gstNumber ||
      parseFloat(rowData.cgstAmount) > 0 ||
      parseFloat(rowData.sgstAmount) > 0 ||
      parseFloat(rowData.igstAmount) > 0)
  ) {
    return "GST";
  }

  // Worksheet has no GST-related columns or data → NON_GST
  return "NON_GST";
}


// Target Entity Schemas and Available Fields
const ENTITY_FIELDS = {
  Customer: [
    { key: "fullName", label: "Full Name / Party Name", required: true },
    { key: "phone", label: "Mobile No / Phone", required: true },
    { key: "email", label: "Email Address", required: false },
    { key: "address", label: "Address", required: true },
    { key: "contactPerson", label: "Contact Person", required: false },
    { key: "gstNumber", label: "GST Number", required: false },
    { key: "companyName", label: "Company Name", required: false },
    { key: "customerType", label: "Customer Type (residential/commercial)", required: false },
  ],
  Employee: [
    { key: "fullName", label: "Full Name", required: true },
    { key: "phone", label: "Mobile No / Phone", required: true },
    { key: "email", label: "Email Address", required: false },
    { key: "role", label: "Role (worker/office-staff/sales)", required: true },
    { key: "salary", label: "Salary", required: false },
    { key: "joiningDate", label: "Joining Date", required: false },
    { key: "address", label: "Address", required: false },
  ],
  Service: [
    { key: "jobNo", label: "Job No", required: false },
    { key: "customerName", label: "Customer Name", required: true },
    { key: "customerPhone", label: "Customer Phone", required: false },
    { key: "address", label: "Address / Location", required: true },
    { key: "serviceName", label: "Type of Service", required: true },
    { key: "serviceDate", label: "Service Date", required: true },
    { key: "serviceTime", label: "Service Time", required: false },
    { key: "amount", label: "Charges / Amount", required: true },
    { key: "operatorName", label: "Operator Name", required: false },
    { key: "area", label: "Premises Area", required: false },
    { key: "locationOfPest", label: "Location of Pest", required: false },
    { key: "reference", label: "Reference", required: false },
    { key: "clientReference", label: "Client Reference", required: false },
    { key: "frequency", label: "Service Frequency", required: false },
    { key: "contactPerson", label: "Contact Person", required: false },
    { key: "contactNumber", label: "Contact Number", required: false },
    { key: "remark", label: "Remarks", required: false },
    { key: "paymentDetails", label: "Payment Details / Mode", required: false },
  ],
  Renewal: [
    { key: "renewalNumber", label: "Job No / Contract No", required: true },
    { key: "customerName", label: "Client Name / Party Name", required: true },
    { key: "customerPhone", label: "Mobile No", required: false },
    { key: "address", label: "Address / Location", required: false },
    { key: "serviceName", label: "Service / Treatment", required: true },
    { key: "frequency", label: "Frequency", required: false },
    { key: "charges", label: "Charges / Total Amount", required: true },
    { key: "firstService", label: "1st Service Date", required: false },
    { key: "secondService", label: "2nd Service Date", required: false },
    { key: "thirdService", label: "3rd Service Date", required: false },
    { key: "fourthService", label: "4th Service Date", required: false },
    { key: "contractEndDate", label: "Contract End Date (EXP)", required: false },
    { key: "paymentTerm", label: "Billing Terms", required: false },
    { key: "contactPerson", label: "Contact Person", required: false },
    { key: "area", label: "Premises Area", required: false },
  ],
  Invoice: [
    { key: "invoiceNumber", label: "Invoice No / Number", required: true },
    { key: "invoiceDate", label: "Invoice Date", required: true },
    { key: "customerName", label: "Party Name / Client Name", required: true },
    { key: "gstNumber", label: "Party GST No", required: false },
    { key: "premisesTreated", label: "Site Location / Project Address", required: false },
    { key: "treatmentType", label: "Service / Treatment", required: false },
    { key: "hsnCode", label: "HSN Code", required: false },
    { key: "subtotal", label: "Taxable Amount", required: true },
    { key: "cgstAmount", label: "CGST Amount", required: false },
    { key: "sgstAmount", label: "SGST Amount", required: false },
    { key: "igstAmount", label: "IGST Amount", required: false },
    { key: "totalAmount", label: "Invoice Amount / Total", required: true },
    { key: "tds", label: "TDS", required: false },
    { key: "rtn", label: "RTN", required: false },
    { key: "gstFile", label: "GST File", required: false },
    { key: "billingPeriod", label: "Billing Period", required: false },
    { key: "amountInWords", label: "Amount in Words", required: false },
  ],
  Quotation: [
    { key: "quotationNumber", label: "Quotation No (QTN NO)", required: true },
    { key: "quotationDate", label: "Quotation Date", required: false },
    { key: "customerName", label: "Client Name & Address", required: true },
    { key: "customerPhone", label: "Mobile No", required: false },
    { key: "premises", label: "Premise to be Treated", required: true },
    { key: "serviceName", label: "Service Name", required: true },
    { key: "frequency", label: "Frequency", required: false },
    { key: "cost", label: "Service Charges / Cost", required: true },
    { key: "billingTerm", label: "Billing Term", required: false },
    { key: "totalAmount", label: "Total Amount", required: false },
    { key: "contactPerson", label: "Contact Person", required: false },
    { key: "location", label: "Location Treated", required: false },
    { key: "area", label: "Premises Area / Specification", required: false },
    { key: "amountInWords", label: "Amount in Words", required: false },
    { key: "notes", label: "Notes / Remarks", required: false },
    { key: "email", label: "Email Address", required: false },
  ],
};

// Preset Header Mapping Rules for Known Client Formats
const PRESET_MAPPINGS = {
  Customer: {
    "CLIENT NAME": "fullName",
    "PARTY NAME": "fullName",
    "MOBILE NO": "phone",
    "MOB NO": "phone",
    "MOB. NO.": "phone",
    EMAIL: "email",
    ADDRESS: "address",
    LOCATION: "address",
    "CLIENT NAME & ADDRESS": "address",
    "CONTACT PERSON": "contactPerson",
    PERSON: "contactPerson",
    "GST NO": "gstNumber",
    "PARTY GST NO": "gstNumber",
    "PARTY GST NO.": "gstNumber",
  },
  Service: {
    "JOB NO": "jobNo",
    "CLIENT NAME": "customerName",
    "PARTY NAME": "customerName",
    "MOBILE NO": "customerPhone",
    "MOB NO": "customerPhone",
    ADDRESS: "address",
    LOCATION: "address",
    "TYPE OF SERVICE": "serviceName",
    SERVICE: "serviceName",
    "SERVICE DATE": "serviceDate",
    "SERVICE TIME": "serviceTime",
    "SERVICE CHARGES": "amount",
    CHARGES: "amount",
    "OERATER NAME": "operatorName",
    "OPERATOR NAME": "operatorName",
    "OPER.": "operatorName",
    "PREMISES AREA": "area",
    AREA: "area",
    "LOCATION OF PEST": "locationOfPest",
    REFERENCE: "reference",
    "CLIENT REFERENCE": "clientReference",
    "SERVICE FREQUENCY": "frequency",
    FREQUENCY: "frequency",
    "CONTACT PERSON": "contactPerson",
    REMARK: "remark",
  },
  Renewal: {
    "JOB NO": "renewalNumber",
    "CONTRACT NO": "renewalNumber",
    "CON N0": "renewalNumber",
    "CLIENT NAME": "customerName",
    "PARTY NAME": "customerName",
    "MOB NO": "customerPhone",
    "MOBILE NO": "customerPhone",
    ADDRESS: "address",
    LOCATION: "address",
    SERVICE: "serviceName",
    TREATMENT: "serviceName",
    FREQUENCY: "frequency",
    CHARGES: "charges",
    "1ST SERVICE": "firstService",
    "2ND SERVICE": "secondService",
    "3RD SERVICE": "thirdService",
    "4TH SERVICE": "fourthService",
    EXP: "contractEndDate",
    "BILLING TERMS": "paymentTerm",
    "BILLING TERM": "paymentTerm",
    "CONTACT PERSON": "contactPerson",
    AREA: "area",
  },
  Invoice: {
    "INVOICE DATE": "invoiceDate",
    "INVOICE NO": "invoiceNumber",
    "INVOICE NUMBER": "invoiceNumber",
    "INVOICE  NO": "invoiceNumber",
    "BII NO": "invoiceNumber",
    "BILL NO": "invoiceNumber",
    "PARTY NAME": "customerName",
    "CLIENT NAME": "customerName",
    "CLIENT NAME & ADDRESS": "customerName",
    TO: "customerName",
    "PARTY GST NO.": "gstNumber",
    "PARTY GST NO": "gstNumber",
    "GST NO": "gstNumber",
    "GST FILE": "gstFile",
    "GST FIL": "gstFile",
    "GST FILED": "gstFile",
    "SITE LOCATION": "premisesTreated",
    "SITE LOCATION ": "premisesTreated",
    LOCATION: "premisesTreated",
    "PREMISES TREATED": "premisesTreated",
    PREMISES: "premisesTreated",
    "PROJECT  NAME & ADDRESS": "premisesTreated",
    "PROJECT ADDRESS": "premisesTreated",
    "PROJECT NAME & ADDRESS": "premisesTreated",
    "ADDRESS 1": "premisesTreated",
    "ADDRESS - 1": "addressLine1",
    "ADDRESS -2": "addressLine2",
    "ADDRESS - 3": "addressLine3",
    SERVICE: "treatmentType",
    SERVICES: "treatmentType",
    TREATMENT: "treatmentType",
    "TREATMENT TYPE": "treatmentType",
    "TYPE OF TREATMENT": "treatmentType",
    "TYPE OF SERVICE": "treatmentType",
    HSN: "hsnCode",
    "TAXABLE AMOUNT": "subtotal",
    "TAXABLE VALUE": "subtotal",
    AMOUNT: "subtotal",
    "AMOUNT IN WORDS": "amountInWords",
    "AMOUNT IN WOR": "amountInWords",
    CHARGES: "subtotal",
    RATE: "subtotal",
    CGST: "cgstAmount",
    "CGST ": "cgstAmount",
    SGST: "sgstAmount",
    "SGST ": "sgstAmount",
    IGST: "igstAmount",
    "INVOICE AMOUNT": "totalAmount",
    "TOTAL AMOUNT": "totalAmount",
    TOTAL: "totalAmount",
    TDS: "tds",
    RTN: "rtn",
    "BILLING PERIOD": "billingPeriod",
    "BILLING PER": "billingPeriod",
    // Payment columns — explicitly mark as UNMAPPED so they flow to paymentData
    "IVED AN": "UNMAPPED",
  },
  Quotation: {
    "QTN NO": "quotationNumber",
    DATE: "quotationDate",
    " DATE": "quotationDate",
    "CLIENT NAME & ADDRESS": "customerName",
    "CLIENT  NAME & ADDRESS": "customerName",
    "CLIENT NAME": "customerName",
    "MOB NO": "customerPhone",
    "MOB. NO.": "customerPhone",
    "PREMISE TO BE TREATED": "premises",
    "PROJECT NAME & ADDRESS": "premises",
    "LOCATION TREATED": "location",
    AREA: "area",
    "SERVICE NAME": "serviceName",
    SERVICE: "serviceName",
    FREQUENCY: "frequency",
    CHARGES: "cost",
    "SERVICE CHARGES": "cost",
    "BILLING TERM": "billingTerm",
    "TOTAL AMOUNT": "totalAmount",
    TOTAL: "totalAmount",
    "AMOUNT IN WORDS": "amountInWords",
    "CONTACT PERSON": "contactPerson",
    PERSON: "contactPerson",
    EMAIL: "email",
    REMARK: "notes",
  },
};

// Payment-related keywords for identifying unmapped payment columns
const PAYMENT_KEYWORDS = ["RECEIVED", "IVED", "RECIVED", "BALANCE", "CREDIT", "REMARK"];
// These are checked separately — "DATE" and "MODE" by themselves are payment columns
// only when the entity is Invoice and they are UNMAPPED
const PAYMENT_DATE_MODE_KEYWORDS = ["DATE", "MODE"];

// ============================================================
// 1. Upload File Endpoint
// ============================================================
export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No Excel file uploaded" });
    }

    const filePath = req.file.path;
    const originalFileName = req.file.originalname;

    const workbook = XLSX.readFile(filePath);
    const sheetNames = workbook.SheetNames;

    if (!sheetNames || sheetNames.length === 0) {
      return res.status(400).json({ message: "Excel file contains no worksheets" });
    }

    const importSessionId = "IMP-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const newSession = new ImportSession({
      importSessionId,
      originalFileName,
      filePath,
      selectedSheet: sheetNames[0],
      createdBy: req.admin?._id || null,
      expiresAt,
    });

    await newSession.save();

    res.status(200).json({
      message: "File uploaded successfully",
      importSessionId,
      originalFileName,
      sheetNames,
    });
  } catch (error) {
    res.status(500).json({ message: "Upload failed: " + error.message });
  }
};

// ============================================================
// 2. Select Sheet Endpoint
// ============================================================
export const selectSheet = async (req, res) => {
  try {
    const { importSessionId, selectedSheet } = req.body;

    const session = await ImportSession.findOne({ importSessionId });
    if (!session) {
      return res.status(404).json({ message: "Import session not found" });
    }

    const targetSheetName = selectedSheet || session.selectedSheet;
    const workbook = XLSX.readFile(session.filePath);
    const sheet = workbook.Sheets[targetSheetName];
    if (!sheet) {
      return res.status(400).json({ message: "Selected worksheet not found" });
    }

    // Try intelligent classification first
    const sheetClassification = classifyWorksheet(workbook, targetSheetName);

    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    // Find header row (use classifier index if valid, else search first non-empty array)
    let headerRowIndex = 0;
    if (sheetClassification && sheetClassification.headerRowIndex >= 0 && sheetClassification.headerRowIndex < rawRows.length) {
      headerRowIndex = sheetClassification.headerRowIndex;
    } else {
      for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
        const row = rawRows[i];
        if (Array.isArray(row) && row.filter((cell) => cell !== null && cell !== "").length >= 2) {
          headerRowIndex = i;
          break;
        }
      }
    }

    const headers = (rawRows[headerRowIndex] || []).map((h) => String(h).trim());
    const sampleRows = rawRows.slice(headerRowIndex + 1, headerRowIndex + 6);

    // Auto-detect Target Entity Type based on classification or headers
    let detectedEntity = "Customer";
    const resolvedFromProfile = sheetClassification ? resolveTargetCrmEntity(sheetClassification.sourceProfile) : null;

    if (resolvedFromProfile && resolvedFromProfile !== "OUT_OF_SCOPE") {
      detectedEntity = resolvedFromProfile;
    } else {
      const upperHeaders = headers.map((h) => h.toUpperCase());
      if (upperHeaders.includes("JOB NO") && upperHeaders.includes("TYPE OF SERVICE")) {
        detectedEntity = "Service";
      } else if (upperHeaders.includes("CONTRACT NO") || upperHeaders.includes("1ST SERVICE") || upperHeaders.includes("CON N0")) {
        detectedEntity = "Renewal";
      } else if (
        upperHeaders.includes("INVOICE NO") ||
        upperHeaders.includes("INVOICE NUMBER") ||
        upperHeaders.includes("INVOICE DATE") ||
        upperHeaders.includes("BII NO") ||
        upperHeaders.includes("BILL NO")
      ) {
        detectedEntity = "Invoice";
      } else if (upperHeaders.includes("QTN NO") || upperHeaders.includes("PREMISE TO BE TREATED")) {
        detectedEntity = "Quotation";
      } else if (upperHeaders.includes("ROLE") && upperHeaders.includes("SALARY")) {
        detectedEntity = "Employee";
      }
    }

    // Prepare columns metadata
    const columns = headers.map((header, colIdx) => ({
      colIdx,
      header,
      columnKey: `col_${colIdx}_${header}`,
    }));

    // Auto-generate non-colliding default mappings for detected entity
    const preset = PRESET_MAPPINGS[detectedEntity] || {};
    const defaultMappings = {};
    const mappedTargetFields = new Set();

    const hasExplicitAddressCol = headers.some(
      (h) => h.trim().toUpperCase() === "ADDRESS" || h.trim().toUpperCase().includes("CLIENT NAME & ADDRESS")
    );

    headers.forEach((header, colIdx) => {
      const columnKey = `col_${colIdx}_${header}`;
      const cleanH = header.trim();
      const normH = cleanH.toUpperCase();
      let targetField = "UNMAPPED";

      // Intelligent anti-collision: If ADDRESS column exists, do not map LOCATION to address!
      if ((normH === "LOCATION" || normH === "LOCATION OF PEST") && hasExplicitAddressCol) {
        if (detectedEntity === "Service") targetField = "locationOfPest";
        else if (detectedEntity === "Invoice") targetField = "premisesTreated";
        else if (detectedEntity === "Quotation") targetField = "location";
        else targetField = "UNMAPPED";
      } else if (preset[cleanH] && !mappedTargetFields.has(preset[cleanH])) {
        targetField = preset[cleanH];
      } else if (preset[normH] && !mappedTargetFields.has(preset[normH])) {
        targetField = preset[normH];
      } else {
        // Fallback: match by normalized field label
        const fields = ENTITY_FIELDS[detectedEntity] || [];
        const match = fields.find(
          (f) =>
            !mappedTargetFields.has(f.key) &&
            (normalizeStr(f.label) === normalizeStr(cleanH) || normalizeStr(f.key) === normalizeStr(cleanH))
        );
        if (match) {
          targetField = match.key;
        }
      }

      if (targetField !== "UNMAPPED") {
        mappedTargetFields.add(targetField);
      }

      defaultMappings[columnKey] = targetField;
      if (!defaultMappings[cleanH] || defaultMappings[cleanH] === "UNMAPPED") {
        defaultMappings[cleanH] = targetField;
      }
    });

    session.selectedSheet = targetSheetName;
    session.targetEntity = detectedEntity;
    await session.save();

    res.status(200).json({
      importSessionId,
      selectedSheet: targetSheetName,
      headers,
      columns,
      sampleRows,
      detectedEntity,
      defaultMappings,
      classification: sheetClassification,
      availableEntities: Object.keys(ENTITY_FIELDS),
      entityFields: ENTITY_FIELDS,
    });
  } catch (error) {
    res.status(500).json({ message: "Sheet selection failed: " + error.message });
  }
};

// ============================================================
// 3. Helper Data Endpoint (Customers & Employees)
// ============================================================
export const getHelpers = async (req, res) => {
  try {
    const customers = await Customer.find({}, "fullName phone email gstNumber address").lean();
    const employees = await Employee.find({}, "fullName phone role").lean();

    res.status(200).json({
      customers: customers.map((c) => ({
        id: c._id.toString(),
        fullName: c.fullName,
        phone: c.phone || "",
        email: c.email || "",
        gstNumber: c.gstNumber || "",
        address: c.address || "",
      })),
      employees: employees.map((e) => ({
        id: e._id.toString(),
        fullName: e.fullName,
        phone: e.phone || "",
        role: e.role || "",
      })),
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to load helper data: " + error.message });
  }
};

// ============================================================
// 4. Validate Session Endpoint
// ============================================================
export const validateSession = async (req, res) => {
  try {
    const { importSessionId, selectedSheet, targetEntity, mappings } = req.body;

    const session = await ImportSession.findOne({ importSessionId });
    if (!session) {
      return res.status(404).json({ message: "Import session not found" });
    }

    const workbook = XLSX.readFile(session.filePath);
    const sheetName = selectedSheet || session.selectedSheet;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return res.status(400).json({ message: "Selected worksheet not found" });
    }

    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    // Locate header row (row with maximum filled columns in first 10 rows)
    let headerRowIndex = 0;
    let maxCols = 0;
    for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
      const row = rawRows[i];
      if (Array.isArray(row)) {
        const count = row.filter((cell) => cell !== null && cell !== "").length;
        if (count > maxCols && count >= 2) {
          maxCols = count;
          headerRowIndex = i;
        }
      }
    }

    const headers = (rawRows[headerRowIndex] || []).map((h) => String(h).trim());
    const dataRows = rawRows.slice(headerRowIndex + 1);

    // Helper to resolve fieldKey for a column by columnKey, colIdx, or header
    const getMappingForCol = (header, colIdx) => {
      if (mappings[`col_${colIdx}_${header}`]) return mappings[`col_${colIdx}_${header}`];
      if (mappings[colIdx] !== undefined && mappings[colIdx] !== null) return mappings[colIdx];
      if (mappings[header]) return mappings[header];
      return "UNMAPPED";
    };

    // Identify Unmapped and Payment Headers
    const unmappedHeaders = [];
    const paymentHeaders = [];

    headers.forEach((header, colIdx) => {
      const fieldKey = getMappingForCol(header, colIdx);
      if (!fieldKey || fieldKey === "UNMAPPED") {
        unmappedHeaders.push(header);
        const normH = header.toUpperCase();
        const isPaymentKW = PAYMENT_KEYWORDS.some((kw) => normH.includes(kw));
        const isDateMode = PAYMENT_DATE_MODE_KEYWORDS.some((kw) => normH.includes(kw));
        if (isPaymentKW || (isDateMode && targetEntity === "Invoice")) {
          paymentHeaders.push(header);
        }
      }
    });

    // Generate Field-Level Data Loss & Reconciliation Report
    const reconciliationReport = headers.map((header, colIdx) => {
      const fieldKey = getMappingForCol(header, colIdx);
      const nonNullValues = [];
      dataRows.forEach((r) => {
        const v = r[colIdx] !== undefined ? String(r[colIdx]).trim() : "";
        if (v && v !== "N/A" && v !== "-" && v !== "null") {
          nonNullValues.push(v);
        }
      });

      const totalValues = nonNullValues.length;
      const sampleValues = Array.from(new Set(nonNullValues)).slice(0, 3);
      const normH = header.toUpperCase();

      let status = "PASS";
      let riskReason = "";

      if (fieldKey && fieldKey !== "UNMAPPED") {
        status = "PASS";
      } else if (totalValues === 0) {
        status = "INFO";
        riskReason = "Empty column across all rows. Safe to omit.";
      } else if (/^(SR|SR\.|SR\.?\s*NO|NO\.?|SIGN|SIGNATURE)$/i.test(header.trim())) {
        status = "INFO";
        riskReason = "Metadata / row index / physical signature mark. Managed natively by CRM.";
      } else if (PAYMENT_KEYWORDS.some((kw) => normH.includes(kw))) {
        status = "PASS";
        riskReason = "Preserved in paymentHistory ledger.";
      } else {
        const isHighRisk = /amount|charges|rate|tax|date|exp|contact|phone|mobile|address|email|treat|service/i.test(header);
        if (isHighRisk) {
          status = "DATA_LOSS_RISK";
          riskReason = `Contains ${totalValues} business values but marked Unmapped. Consider mapping to preserve data.`;
        } else {
          status = "WARNING";
          riskReason = `Unmapped column with ${totalValues} non-empty values.`;
        }
      }

      return {
        colIdx,
        header,
        columnKey: `col_${colIdx}_${header}`,
        targetField: fieldKey || "UNMAPPED",
        totalValues,
        sampleValues,
        status,
        riskReason,
      };
    });

    // Load Database Records for Exact Matching & Duplicate Protection
    const existingCustomers = await Customer.find().lean();
    const existingEmployees = await Employee.find().lean();
    const existingInvoices = await Invoice.find({}, "invoiceNumber").lean();
    const existingQuotations = await Quotation.find({}, "quotationNumber").lean();
    const existingRenewals = await Renewal.find({}, "renewalNumber").lean();

    const existingInvoiceSet = new Set(existingInvoices.map((i) => i.invoiceNumber.trim().toUpperCase()));
    const existingQuotationSet = new Set(existingQuotations.map((q) => q.quotationNumber.trim().toUpperCase()));
    const existingRenewalSet = new Set(existingRenewals.map((r) => r.renewalNumber.trim().toUpperCase()));

    // Matching Indexes
    const customerPhoneMap = new Map();
    const customerGstMap = new Map();
    const customerNameMap = new Map();
    const customerNameAddrMap = new Map();

    existingCustomers.forEach((c) => {
      if (c.phone) customerPhoneMap.set(normalizeStr(c.phone), c);
      if (c.gstNumber) customerGstMap.set(normalizeStr(c.gstNumber), c);
      if (c.fullName) customerNameMap.set(normalizeStr(c.fullName), c);
      if (c.fullName && c.address) {
        customerNameAddrMap.set(normalizeStr(c.fullName) + "|" + normalizeStr(c.address), c);
      }
    });

    const employeePhoneMap = new Map();
    const employeeNameMap = new Map();

    existingEmployees.forEach((e) => {
      if (e.phone) employeePhoneMap.set(normalizeStr(e.phone), e);
      if (e.fullName) employeeNameMap.set(normalizeStr(e.fullName), e);
    });

    // Validation Metrics
    let validCount = 0;
    let warningCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;

    const validatedRows = [];

    // Row Batch Processing
    dataRows.forEach((rowArray, idx) => {
      const rowNumber = headerRowIndex + 2 + idx;

      // Skip completely empty rows
      if (!rowArray || rowArray.every((cell) => cell === "" || cell === null)) {
        return;
      }

      // Map Excel row cells to fields
      const rowObj = {};
      const unmappedData = {};
      const paymentData = {};
      const paymentColumns = [];

      headers.forEach((header, colIdx) => {
        const val = rowArray[colIdx] !== undefined ? String(rowArray[colIdx]).trim() : "";
        const fieldKey = getMappingForCol(header, colIdx);

        if (fieldKey && fieldKey !== "UNMAPPED") {
          // Empty-overwrite protection & address precedence:
          if (rowObj[fieldKey]) {
            if (!val) {
              // Do not overwrite non-empty with empty!
            } else if (fieldKey === "address") {
              const currentIsStreet = /flat|bldg|building|plot|sector|shop|room|gala|road|chambers|soc|chs|lane/i.test(rowObj[fieldKey]);
              const newIsStreet = /flat|bldg|building|plot|sector|shop|room|gala|road|chambers|soc|chs|lane/i.test(val);
              if (newIsStreet && !currentIsStreet) {
                rowObj[fieldKey] = val;
              } else if (!currentIsStreet && !newIsStreet && val.length > rowObj[fieldKey].length) {
                rowObj[fieldKey] = val;
              }
            } else {
              rowObj[fieldKey] = val;
            }
          } else {
            rowObj[fieldKey] = val;
          }
        } else {
          unmappedData[header] = val;
          const normH = header.toUpperCase();
          const isPaymentKW = PAYMENT_KEYWORDS.some((kw) => normH.includes(kw));
          const isDateMode = PAYMENT_DATE_MODE_KEYWORDS.some((kw) => normH.includes(kw));
          if ((isPaymentKW || (isDateMode && targetEntity === "Invoice")) && val) {
            paymentData[header] = val;
            paymentColumns.push({ header, colIdx, val });
          }
        }
      });

      const warnings = [];
      const errors = [];
      let rowStatus = "VALID";
      let isDuplicate = false;
      let matchedCustomer = null;
      let matchedEmployee = null;
      let defaultAction = "IMPORT";

      // ----------------------------------------------------
      // Customer Matching Rules (Smart & Deterministic)
      // Priority: phone > GST > name+address > name > prefix
      // ----------------------------------------------------
      const custPhone = rowObj.customerPhone || rowObj.phone || "";
      const custGst = rowObj.gstNumber || "";
      const custName = rowObj.customerName || rowObj.fullName || "";
      let custAddr = rowObj.address || "";
      if (!custAddr && custName) {
        custAddr = extractEmbeddedAddress(custName);
        if (custAddr) rowObj.address = custAddr;
      }
      if (!custAddr) {
        for (const [colH, colV] of Object.entries(unmappedData)) {
          const normH = colH.toUpperCase();
          if ((normH.includes("ADDRESS") || normH.includes("LOCATION")) && colV && colV !== "N/A") {
            custAddr = colV;
            rowObj.address = custAddr;
            break;
          }
        }
      }

      matchedCustomer = findMatchingCustomer(custName, custPhone, custGst, custAddr, existingCustomers);

      if (targetEntity !== "Customer" && targetEntity !== "Employee") {
        if (!matchedCustomer && custName) {
          const primName = extractPrimaryName(custName);
          warnings.push(`Customer '${primName}' not found in CRM. Will auto-create customer.`);
        } else if (!matchedCustomer && !custName) {
          errors.push("No customer name or phone found in this row. Cannot determine customer.");
        }
      }

      // ----------------------------------------------------
      // Employee Matching Rules (Exact only - NO fuzzy/initials)
      // Priority: exact full name > exact phone (digits only)
      // ----------------------------------------------------
      const operName = rowObj.operatorName || (targetEntity === "Employee" ? rowObj.fullName : "");
      if (operName) {
        // 1. Try exact name match FIRST
        if (employeeNameMap.has(normalizeStr(operName))) {
          matchedEmployee = employeeNameMap.get(normalizeStr(operName));
        }
        // 2. Try exact phone match ONLY if operName looks like a phone number (7+ digits)
        else if (/^\d{7,}$/.test(operName.replace(/\D/g, "")) && employeePhoneMap.has(normalizeStr(operName))) {
          matchedEmployee = employeePhoneMap.get(normalizeStr(operName));
        }
        // 3. Unmatched — initials like SK, RH, LS, ST+AM will correctly land here
        else {
          warnings.push(`Operator/Employee '${operName}' could not be matched. Manual selection required.`);
        }
      }

      // ----------------------------------------------------
      // Entity Specific Schema Validation & Duplicate Checks
      // ----------------------------------------------------
      if (targetEntity === "Customer") {
        if (!rowObj.fullName) errors.push("Customer Full Name is required.");
        if (rowObj.phone && customerPhoneMap.has(normalizeStr(rowObj.phone))) {
          isDuplicate = true;
          matchedCustomer = customerPhoneMap.get(normalizeStr(rowObj.phone));
          warnings.push(`Customer with phone '${rowObj.phone}' already exists.`);
          if (rowObj.fullName && normalizeStr(matchedCustomer.fullName) !== normalizeStr(rowObj.fullName)) {
            warnings.push(`Existing customer with phone '${rowObj.phone}' is named '${matchedCustomer.fullName}', which differs from imported name '${rowObj.fullName}'. Manual resolution required.`);
          }
        }
      } else if (targetEntity === "Employee") {
        if (!rowObj.fullName) errors.push("Employee Full Name is required.");
        if (!rowObj.phone) {
          errors.push("Phone number is required for Employee.");
        } else if (employeePhoneMap.has(normalizeStr(rowObj.phone))) {
          isDuplicate = true;
          warnings.push(`Employee with phone '${rowObj.phone}' already exists.`);
        }
      } else if (targetEntity === "Service") {
        if (!rowObj.serviceName) errors.push("Type of Service is required.");
        if (!rowObj.amount || isNaN(parseFloat(rowObj.amount))) errors.push("Valid numeric Service Amount is required.");
        if (!custName && !matchedCustomer) errors.push("Customer Name or Customer Link is required.");
      } else if (targetEntity === "Invoice") {
        if (!rowObj.invoiceNumber) {
          errors.push("Invoice Number is required.");
        } else if (existingInvoiceSet.has(rowObj.invoiceNumber.trim().toUpperCase())) {
          isDuplicate = true;
          warnings.push(`Invoice Number '${rowObj.invoiceNumber}' already exists in CRM.`);
        }
        if (!rowObj.totalAmount && !rowObj.subtotal) errors.push("Invoice Amount or Taxable Amount is required.");
      } else if (targetEntity === "Quotation") {
        if (!rowObj.quotationNumber) {
          errors.push("Quotation Number is required.");
        } else if (existingQuotationSet.has(String(rowObj.quotationNumber).trim().toUpperCase())) {
          isDuplicate = true;
          warnings.push(`Quotation Number '${rowObj.quotationNumber}' already exists in CRM.`);
        }
      } else if (targetEntity === "Renewal") {
        if (!rowObj.renewalNumber) {
          errors.push("Contract / Job Number is required.");
        } else if (existingRenewalSet.has(String(rowObj.renewalNumber).trim().toUpperCase())) {
          isDuplicate = true;
          warnings.push(`Contract Number '${rowObj.renewalNumber}' already exists in CRM.`);
        }
      }

      // Determine Final Row Status
      if (errors.length > 0) {
        rowStatus = "ERROR";
        defaultAction = "SKIP";
        errorCount++;
      } else if (isDuplicate) {
        rowStatus = "DUPLICATE";
        defaultAction = "SKIP"; // Default to skip duplicates safely
        duplicateCount++;
      } else if (warnings.length > 0) {
        rowStatus = "WARNING";
        warningCount++;
      } else {
        rowStatus = "VALID";
        validCount++;
      }

      validatedRows.push({
        rowNumber,
        originalData: rowObj,
        unmappedData,
        paymentData,
        paymentColumns,
        matchedCustomer: matchedCustomer
          ? { id: matchedCustomer._id.toString(), fullName: matchedCustomer.fullName, phone: matchedCustomer.phone }
          : null,
        matchedEmployee: matchedEmployee
          ? { id: matchedEmployee._id.toString(), fullName: matchedEmployee.fullName, role: matchedEmployee.role }
          : null,
        status: rowStatus,
        isDuplicate,
        warnings,
        errors,
        action: defaultAction,
        // CRITICAL: If customer is matched, always USE_MATCHED. If not matched but custName present, CREATE_NEW.
        customerAction: matchedCustomer ? "USE_MATCHED" : (custName ? "CREATE_NEW" : "SKIP"),
        selectedCustomerId: matchedCustomer ? matchedCustomer._id.toString() : "",
        selectedEmployeeId: matchedEmployee ? matchedEmployee._id.toString() : "",
      });
    });

    session.selectedSheet = sheetName;
    session.targetEntity = targetEntity;
    session.mappings = mappings;
    session.validationResults = {
      summary: {
        totalRows: validatedRows.length,
        validCount,
        warningCount,
        errorCount,
        duplicateCount,
        unmappedHeadersCount: unmappedHeaders.length,
        paymentHeadersCount: paymentHeaders.length,
      },
      unmappedHeaders,
      paymentHeaders,
      reconciliationReport,
      rows: validatedRows,
    };
    session.status = "validated";
    await session.save();

    res.status(200).json({
      importSessionId,
      targetEntity,
      summary: session.validationResults.summary,
      unmappedHeaders,
      paymentHeaders,
      reconciliationReport,
      rows: validatedRows,
    });
  } catch (error) {
    res.status(500).json({ message: "Validation failed: " + error.message });
  }
};

// ============================================================
// 5. Commit Import Endpoint (Transaction-Safe)
// ============================================================
export const commitSession = async (req, res) => {
  try {
    const { importSessionId, choices } = req.body;

    const session = await ImportSession.findOne({ importSessionId });
    if (!session) {
      return res.status(404).json({ message: "Import session not found" });
    }

    if (!session.validationResults || !session.validationResults.rows) {
      return res.status(400).json({ message: "Session must be validated before committing" });
    }

    if (session.status === "committed") {
      return res.status(400).json({ message: "This import session has already been committed." });
    }

    const targetEntity = session.targetEntity;
    const validatedRows = session.validationResults.rows;
    const sessionMappings = session.mappings || {};

    // Create a map of row choice updates from request if provided
    const choiceMap = new Map();
    if (choices && Array.isArray(choices)) {
      choices.forEach((c) => choiceMap.set(c.rowNumber, c));
    }

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const errorReport = [];
    const createdIds = { customers: [], employees: [], services: [], invoices: [], quotations: [], renewals: [] };

    // Duplicate tracking sets for in-flight creations within the commit batch
    const seenInvoiceNumbers = new Set();
    const seenQuotationNumbers = new Set();
    const seenRenewalNumbers = new Set();
    const seenCustomerPhones = new Set();

    const BATCH_SIZE = 50;
      // Process rows in safe batches
      for (let i = 0; i < validatedRows.length; i += BATCH_SIZE) {
        const chunk = validatedRows.slice(i, i + BATCH_SIZE);

        for (const row of chunk) {
          const choice = choiceMap.get(row.rowNumber) || {};
          const action = choice.action || row.action || "IMPORT";
          const rowData = row.originalData;

          if (action === "SKIP") {
            skippedCount++;
            continue;
          }

          try {
            // -------------------------------------------------
            // Resolve Customer (for non-Customer entities)
            // Uses the decision from validation. Never fabricates
            // phone numbers. Never creates without phone.
            // -------------------------------------------------
            let customerId = null;
            if (targetEntity !== "Customer" && targetEntity !== "Employee") {
              customerId = choice.selectedCustomerId || (row.matchedCustomer ? row.matchedCustomer.id : null);
              const custAction = choice.customerAction || row.customerAction || "CREATE_NEW";

              if (!customerId && (rowData.customerName || rowData.fullName)) {
                const nameToUse = String(rowData.customerName || rowData.fullName).trim();
                if (nameToUse) {
                  const primaryName = extractPrimaryName(nameToUse);
                  const embeddedAddr = extractEmbeddedAddress(nameToUse);
                  const phoneToUse = rowData.customerPhone || rowData.phone || undefined;
                  const gstToUse = rowData.gstNumber || undefined;
                  const addrToUse = rowData.address || embeddedAddr || "Address not provided";

                  // Check smart customer match from DB
                  const currentCustomers = await Customer.find().lean();
                  let existingCust = findMatchingCustomer(nameToUse, phoneToUse, gstToUse, addrToUse, currentCustomers);

                  if (existingCust) {
                    // Customer already exists — link to existing ID
                    customerId = existingCust._id.toString();
                    // Safe address enrichment: if customer currently has placeholder address, enrich with genuine street address
                    const isPlaceholder = !existingCust.address || existingCust.address === "Address not provided" || existingCust.address === "N/A";
                    if (isPlaceholder && addrToUse && addrToUse !== "Address not provided" && addrToUse !== "N/A") {
                      await Customer.findByIdAndUpdate(existingCust._id, { address: addrToUse });
                      existingCust.address = addrToUse;
                    }
                  } else if (custAction !== "SKIP") {
                    const custData = {
                      fullName: primaryName || nameToUse,
                      address: addrToUse || "N/A",
                      email: rowData.email || "",
                      contactPerson: rowData.contactPerson || "",
                      gstNumber: rowData.gstNumber || "",
                      companyName: rowData.companyName || "",
                      customerType: rowData.gstNumber || rowData.companyName || nameToUse.toUpperCase().includes("PVT") || nameToUse.toUpperCase().includes("LTD") || nameToUse.toUpperCase().includes("LLP") ? "commercial" : "residential",
                    };
                    if (phoneToUse) {
                      custData.phone = phoneToUse;
                    }
                    const newCust = new Customer(custData);
                    await newCust.save();
                    customerId = newCust._id.toString();
                    createdIds.customers.push(customerId);
                  }
                }
              }

              // If we still have no customer and entity requires one, fail the row
              if (!customerId) {
                failedCount++;
                errorReport.push({
                  rowNumber: row.rowNumber,
                  originalValues: rowData,
                  problem: "No customer resolved",
                  reason: "Could not determine customer for this row. Select an existing customer manually.",
                });
                continue;
              }
            }

            let employeeId = choice.selectedEmployeeId || (row.matchedEmployee ? row.matchedEmployee.id : null);

            // -------------------------------------------------
            // Entity Import Handlers
            // -------------------------------------------------
            if (targetEntity === "Customer") {
              if (action === "UPDATE" && choice.selectedCustomerId) {
                const safeData = sanitizeForUpdate("Customer", rowData);
                await Customer.findByIdAndUpdate(choice.selectedCustomerId, safeData);
                updatedCount++;
              } else {
                // Pre-check for duplicate phone before creating
                if (rowData.phone) {
                  const normPhone = normalizeStr(rowData.phone);
                  if (seenCustomerPhones.has(normPhone)) {
                    skippedCount++;
                    continue;
                  }
                  const existingByPhone = await Customer.findOne({ phone: rowData.phone });
                  if (existingByPhone) {
                    skippedCount++;
                    seenCustomerPhones.add(normPhone);
                    continue;
                  }
                  seenCustomerPhones.add(normPhone);
                }

                const custData = {
                  fullName: rowData.fullName,
                  email: rowData.email || "",
                  address: rowData.address || "N/A",
                  contactPerson: rowData.contactPerson || "",
                  gstNumber: rowData.gstNumber || "",
                  companyName: rowData.companyName || "",
                  customerType: rowData.customerType || (rowData.gstNumber || rowData.companyName || rowData.fullName.toUpperCase().includes("PVT") || rowData.fullName.toUpperCase().includes("LTD") || rowData.fullName.toUpperCase().includes("LLP") ? "commercial" : "residential"),
                };
                if (rowData.phone) {
                  custData.phone = rowData.phone;
                }
                const newCustomer = new Customer(custData);
                await newCustomer.save();
                createdIds.customers.push(newCustomer._id.toString());
                createdCount++;
              }
            } else if (targetEntity === "Employee") {
              if (action === "UPDATE" && choice.selectedEmployeeId) {
                const safeData = sanitizeForUpdate("Employee", rowData);
                await Employee.findByIdAndUpdate(choice.selectedEmployeeId, safeData);
                updatedCount++;
              } else {
                const newEmp = new Employee({
                  fullName: rowData.fullName,
                  phone: rowData.phone,
                  email: rowData.email || undefined,
                  role: rowData.role || "worker",
                  salary: rowData.salary ? parseFloat(rowData.salary) : 0,
                  joiningDate: parseExcelDate(rowData.joiningDate) || new Date(),
                  address: rowData.address || "N/A",
                });
                await newEmp.save();
                createdIds.employees.push(newEmp._id.toString());
                createdCount++;
              }
            } else if (targetEntity === "Service") {
              const parsedFreq = normalizeStr(rowData.frequency);
              let validFreq = "one-time";
              if (parsedFreq.includes("3") || parsedFreq.includes("three")) validFreq = "3 Services Yearly";
              else if (parsedFreq.includes("twiceaweek") || parsedFreq.includes("twice")) validFreq = "twice a week";
              else if (parsedFreq.includes("week")) validFreq = "weekly";
              else if (parsedFreq.includes("month")) validFreq = "monthly";
              else if (parsedFreq.includes("quarter")) validFreq = "Quarterly";
              else if (parsedFreq.includes("fourthnight") || parsedFreq.includes("fortnight")) validFreq = "fourth night";

              const serviceDateVal = parseExcelDate(rowData.serviceDate) || new Date();
              const { nextServiceDate: calcNext, upcomingServiceDates: calcUpcoming } = calculateServiceDates(serviceDateVal, validFreq);

              const newService = new Service({
                customer: customerId,
                employee: employeeId || undefined,
                jobNo: rowData.jobNo || "",
                serviceName: rowData.serviceName || "Pest Control",
                serviceDate: serviceDateVal,
                nextServiceDate: calcNext,
                upcomingServiceDates: calcUpcoming,
                serviceTime: parseExcelTime(rowData.serviceTime) || rowData.serviceTime || "",
                address: rowData.address || "N/A",
                amount: parseFloat(rowData.amount) || 0,
                operatorName: rowData.operatorName || (row.matchedEmployee ? row.matchedEmployee.fullName : ""),
                area: rowData.area || "",
                locationOfPest: rowData.locationOfPest || "",
                reference: rowData.reference || "",
                clientReference: rowData.clientReference || "",
                frequency: validFreq,
                contactPerson: rowData.contactPerson || "",
                contactNumber: rowData.contactNumber || "",
                remark: rowData.remark || "",
                paymentDetails: rowData.paymentDetails || "",
                status: "active",
              });
              await newService.save();
              createdIds.services.push(newService._id.toString());
              createdCount++;
            } else if (targetEntity === "Invoice") {
              const invNo = String(rowData.invoiceNumber || "").trim();
              if (!invNo) {
                failedCount++;
                errorReport.push({
                  rowNumber: row.rowNumber,
                  originalValues: rowData,
                  problem: "Missing invoice number",
                  reason: "Invoice Number is required.",
                });
                continue;
              }

              const normInvNo = invNo.toUpperCase();
              if (seenInvoiceNumbers.has(normInvNo)) {
                skippedCount++;
                continue;
              }

              const existingInv = await Invoice.findOne({ invoiceNumber: invNo });
              if (existingInv) {
                if (action === "UPDATE") {
                  const safeData = sanitizeForUpdate("Invoice", rowData);
                  await Invoice.findByIdAndUpdate(existingInv._id, safeData);
                  updatedCount++;
                } else {
                  skippedCount++;
                }
                seenInvoiceNumbers.add(normInvNo);
                continue;
              }

              seenInvoiceNumbers.add(normInvNo);

              const subtotal = parseFloat(rowData.subtotal) || 0;
              const totalAmt = parseFloat(rowData.totalAmount) || subtotal;
              const cgst = parseFloat(rowData.cgstAmount) || 0;
              const sgst = parseFloat(rowData.sgstAmount) || 0;
              const igst = parseFloat(rowData.igstAmount) || 0;

              // Determine invoiceType from worksheet structure
              const invoiceType = determineInvoiceType(sessionMappings, rowData);

              // Extract deterministic payment history from unmapped payment columns
              const { entries: paymentEntries, warnings: paymentWarnings } = buildPaymentHistoryFromColumns(
                row.paymentColumns,
                row.paymentData || {},
                session.validationResults?.paymentHeaders || []
              );

              if (paymentWarnings.length > 0) {
                // Report warnings but do NOT block the import
                errorReport.push({
                  rowNumber: row.rowNumber,
                  originalValues: rowData,
                  problem: "Payment column warnings",
                  reason: paymentWarnings.join("; "),
                });
              }

              const newInv = new Invoice({
                invoiceNumber: invNo,
                invoiceDate: parseExcelDate(rowData.invoiceDate) || new Date(),
                invoiceType,
                customer: customerId,
                billingPeriod: rowData.billingPeriod || "",
                amountInWords: rowData.amountInWords || "",
                premisesTreated: rowData.premisesTreated || "",
                treatmentType: rowData.treatmentType || "",
                hsnCode: rowData.hsnCode || "",
                subtotal,
                totalTax: cgst + sgst + igst,
                totalAmount: totalAmt,
                tax: {
                  cgstAmount: cgst,
                  sgstAmount: sgst,
                  igstAmount: igst,
                },
                tds: parseFloat(rowData.tds) || 0,
                rtn: parseFloat(rowData.rtn) || 0,
                gstNumber: rowData.gstNumber || "",
                gstFile: rowData.gstFile || "",
                paymentHistory: paymentEntries,
                status: "Generated",
              });
              await newInv.save();
              createdIds.invoices.push(newInv._id.toString());
              createdCount++;
            } else if (targetEntity === "Quotation") {
              const qtnNo = String(rowData.quotationNumber || "").trim();
              if (!qtnNo) {
                failedCount++;
                errorReport.push({
                  rowNumber: row.rowNumber,
                  originalValues: rowData,
                  problem: "Missing quotation number",
                  reason: "Quotation Number is required.",
                });
                continue;
              }

              const normQtnNo = qtnNo.toUpperCase();
              if (seenQuotationNumbers.has(normQtnNo)) {
                skippedCount++;
                continue;
              }

              const existingQtn = await Quotation.findOne({ quotationNumber: qtnNo });
              if (existingQtn) {
                if (action === "UPDATE") {
                  const safeData = sanitizeForUpdate("Quotation", rowData);
                  await Quotation.findByIdAndUpdate(existingQtn._id, safeData);
                  updatedCount++;
                } else {
                  skippedCount++;
                }
                seenQuotationNumbers.add(normQtnNo);
                continue;
              }

              seenQuotationNumbers.add(normQtnNo);

              const cost = parseFloat(rowData.cost) || parseFloat(rowData.totalAmount) || 0;
              const qtnType = session.selectedSheet?.toUpperCase().includes("ATT") || qtnNo.toUpperCase().includes("ATT") ? "ATT" : "PC";
              const newQtn = new Quotation({
                quotationNumber: qtnNo,
                quotationType: qtnType,
                quotationDate: parseExcelDate(rowData.quotationDate) || new Date(),
                customer: customerId,
                premises: rowData.premises || rowData.address || "Client Premises",
                services: [
                  {
                    serviceName: rowData.serviceName || "Pest Control",
                    frequency: rowData.frequency || "Monthly",
                    cost,
                    location: rowData.location || "",
                  },
                ],
                specification: rowData.area || "",
                notes: rowData.notes || "",
                billingTerm: rowData.billingTerm || "Monthly",
                totalAmount: parseFloat(rowData.totalAmount) || cost,
                status: "Draft",
              });
              await newQtn.save();
              createdIds.quotations.push(newQtn._id.toString());
              createdCount++;
            } else if (targetEntity === "Renewal") {
              const renewalNo = String(rowData.renewalNumber || "").trim();
              if (!renewalNo) {
                failedCount++;
                errorReport.push({
                  rowNumber: row.rowNumber,
                  originalValues: rowData,
                  problem: "Missing renewal number",
                  reason: "Contract/Renewal Number is required.",
                });
                continue;
              }

              const normRenewalNo = renewalNo.toUpperCase();
              if (seenRenewalNumbers.has(normRenewalNo)) {
                skippedCount++;
                continue;
              }

              const existingRenewal = await Renewal.findOne({ renewalNumber: renewalNo });
              if (existingRenewal) {
                if (action === "UPDATE") {
                  const safeData = sanitizeForUpdate("Renewal", rowData);
                  await Renewal.findByIdAndUpdate(existingRenewal._id, safeData);
                  updatedCount++;
                } else {
                  skippedCount++;
                }
                seenRenewalNumbers.add(normRenewalNo);
                continue;
              }

              seenRenewalNumbers.add(normRenewalNo);

              const serviceVisits = [];
              if (rowData.firstService) serviceVisits.push({ visitLabel: "1ST SERVICE", visitDateStr: rowData.firstService });
              if (rowData.secondService) serviceVisits.push({ visitLabel: "2ND SERVICE", visitDateStr: rowData.secondService });
              if (rowData.thirdService) serviceVisits.push({ visitLabel: "3RD SERVICE", visitDateStr: rowData.thirdService });
              if (rowData.fourthService) serviceVisits.push({ visitLabel: "4TH SERVICE", visitDateStr: rowData.fourthService });

              // Extract payment history from repeating payment columns if present
              const { entries: renewalPaymentEntries } = buildPaymentHistoryFromColumns(
                row.paymentColumns,
                row.paymentData || {},
                session.validationResults?.paymentHeaders || []
              );

              const charges = parseFloat(rowData.charges) || 0;
              const newRenewal = new Renewal({
                renewalNumber: renewalNo,
                customer: customerId,
                services: [
                  {
                    serviceName: rowData.serviceName || "Pest Control",
                    frequency: rowData.frequency || "ANNUM",
                    address: rowData.address || "",
                    amount: charges,
                  },
                ],
                serviceVisits,
                contractEndDate: parseExcelDate(rowData.contractEndDate) || undefined,
                paymentTerm: rowData.paymentTerm || "ANNUM",
                subtotal: charges,
                totalAmount: charges,
                paymentHistory: renewalPaymentEntries || [],
                status: "Draft",
              });
              await newRenewal.save();
              createdIds.renewals.push(newRenewal._id.toString());

              // Create corresponding Service record so AMC services show up under Services page & Customer Profile Services tab
              try {
                const parsedFreq = normalizeStr(rowData.frequency);
                let validFreq = "one-time";
                if (parsedFreq.includes("3") || parsedFreq.includes("three")) validFreq = "3 Services Yearly";
                else if (parsedFreq.includes("twiceaweek") || parsedFreq.includes("twice")) validFreq = "twice a week";
                else if (parsedFreq.includes("week")) validFreq = "weekly";
                else if (parsedFreq.includes("month")) validFreq = "monthly";
                else if (parsedFreq.includes("quarter")) validFreq = "Quarterly";
                else if (parsedFreq.includes("fourthnight") || parsedFreq.includes("fortnight")) validFreq = "fourth night";

                const serviceDateVal = parseExcelDate(rowData.firstService) || parseExcelDate(rowData.secondService) || new Date();
                const newService = new Service({
                  customer: customerId,
                  employee: employeeId || undefined,
                  jobNo: renewalNo,
                  serviceName: rowData.serviceName || "Pest Control",
                  serviceDate: serviceDateVal,
                  nextServiceDate: parseExcelDate(rowData.secondService) || undefined,
                  address: rowData.address || "N/A",
                  amount: charges,
                  area: rowData.area || "",
                  operatorName: rowData.operatorName || "",
                  frequency: validFreq,
                  status: "active",
                });
                await newService.save();
                createdIds.services.push(newService._id.toString());
              } catch (srvErr) {
                // Non-blocking: ensure renewal creation is preserved if service creation fails
              }

              createdCount++;
            }
          } catch (rowErr) {
            if (rowErr.code === 11000 || (rowErr.message && rowErr.message.includes("E11000"))) {
              // Duplicate key error caught gracefully
              skippedCount++;
            } else {
              failedCount++;
              errorReport.push({
                rowNumber: row.rowNumber,
                originalValues: rowData,
                problem: "Database write error",
                reason: rowErr.message,
              });
            }
          }
        }
      }

      session.status = "committed";
      session.commitResults = {
        created: createdCount,
        updated: updatedCount,
        skipped: skippedCount,
        failed: failedCount,
        createdIds,
      };
      await session.save();

      res.status(200).json({
        message: "Import session committed successfully",
        summary: {
          created: createdCount,
          updated: updatedCount,
          skipped: skippedCount,
          failed: failedCount,
        },
        errorReport,
      });
  } catch (error) {
    res.status(500).json({ message: "Commit failed: " + error.message });
  }
};
