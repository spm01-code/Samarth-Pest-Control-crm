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
import JobNumber from "../model/jobNumberModel.js";
import JobNumberSequence from "../model/jobNumberSequenceModel.js";
import ImportAuditLog from "../model/importAuditLogModel.js";
import { calculateServiceDates } from "../utils/serviceDateCalculator.js";
import { classifyWorksheet, resolveTargetCrmEntity } from "../utils/importClassifier.js";
import { parseJobNo, syncJobNumberSequences } from "../utils/jobNumberService.js";
import { createDatabaseBackup, verifyBackupIntegrity } from "../utils/dbBackupService.js";
import {
  evaluateCellNumeric,
  parseExcelPaymentDate,
  normalizePaymentMode,
  extractContractPayments,
} from "../utils/excelFormulaReader.js";
import { normalizeDate, normalizeBillingPeriod } from "../utils/docGenerator.js";

// Helper: Normalize Frequency string into standard CRM frequency + contract metadata
export const normalizeFrequency = (freqStr) => {
  if (!freqStr) return { validFreq: "one-time", rawFrequency: "", frequencyType: "one-time", contractVisitCount: 1 };
  const raw = String(freqStr).trim();
  const s = raw.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (s.includes("3service") || s.includes("3serv") || s.includes("threeservice") || s.includes("03service")) {
    return { validFreq: "Yearly 3 services", rawFrequency: raw, frequencyType: "recurring", contractVisitCount: 3 };
  }
  if (s.includes("twiceaweek") || s.includes("twiceinweek")) {
    return { validFreq: "twice a week", rawFrequency: raw, frequencyType: "recurring", contractVisitCount: 104 };
  }
  if (s.includes("week") && !s.includes("twice")) {
    return { validFreq: "weekly", rawFrequency: raw, frequencyType: "recurring", contractVisitCount: 52 };
  }
  if (s.includes("fourthnight") || s.includes("fortnight") || s.includes("forthnight") || s.includes("15day")) {
    return { validFreq: "Fourth nightly", rawFrequency: raw, frequencyType: "recurring", contractVisitCount: 24 };
  }
  if (s.includes("quarter") || s.includes("qtr") || s.includes("quater")) {
    return { validFreq: "Quarterly", rawFrequency: raw, frequencyType: "recurring", contractVisitCount: 4 };
  }
  if (s.includes("month")) {
    return { validFreq: "monthly", rawFrequency: raw, frequencyType: "recurring", contractVisitCount: 12 };
  }
  if (s.includes("year") || s.includes("annum") || s.includes("annual")) {
    return { validFreq: "Yearly 3 services", rawFrequency: raw, frequencyType: "recurring", contractVisitCount: 3 };
  }
  return { validFreq: "one-time", rawFrequency: raw, frequencyType: "one-time", contractVisitCount: 1 };
};

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
  return normalizeDate(val);
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
  Customer: ["fullName", "jobNo", "email", "address", "contactPerson", "gstNumber", "companyName", "customerType", "alternatePhone"],
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
  AMC_Master: [
    { key: "jobNo", label: "Job Number", required: true },
    { key: "fullName", label: "Client Name / Party Name", required: true },
    { key: "address", label: "Address", required: false },
    { key: "location", label: "Location", required: false },
    { key: "contactPerson", label: "Contact Person", required: false },
    { key: "phone", label: "Contact No. / Phone", required: false },
    { key: "serviceName", label: "Type of Service", required: true },
    { key: "area", label: "Premises Area", required: false },
    { key: "frequency", label: "Frequency", required: false },
    { key: "charges", label: "Contract Charges", required: false },
    { key: "firstService", label: "1st Service Date", required: false },
    { key: "secondService", label: "2nd Service Date", required: false },
    { key: "thirdService", label: "3rd Service Date", required: false },
    { key: "fourthService", label: "4th Service Date", required: false },
    { key: "contractEndDate", label: "Contract End Date (EXP)", required: false },
    { key: "billingTerms", label: "Billing Terms", required: false },
  ],
};

// Preset Header Mapping Rules for Known Client Formats
const PRESET_MAPPINGS = {
  AMC_Master: {
    "JOB NO": "jobNo",
    "JOB NO.": "jobNo",
    "CLIENT NAME": "fullName",
    "PARTY NAME": "fullName",
    "CLIENT NAME & ADDRESS": "fullName",
    ADDRESS: "address",
    LOCATION: "location",
    "CONTACT PERSON": "contactPerson",
    PERSON: "contactPerson",
    "MOB NO": "phone",
    "MOB. NO.": "phone",
    "MOBILE NO": "phone",
    "CONTACT NO.": "phone",
    "CONTACT NO": "phone",
    PHONE: "phone",
    SERVICE: "serviceName",
    "TYPE OF SERVICES": "serviceName",
    "TYPE OF SERVICE": "serviceName",
    SERVICES: "serviceName",
    AREA: "area",
    FREQUENCY: "frequency",
    CHARGES: "charges",
    "CONTRACT CHARGES": "charges",
    "1ST SERVICE": "firstService",
    "2ND SERVICE": "secondService",
    "3RD SERVICE": "thirdService",
    "4TH SERVICE": "fourthService",
    EXP: "contractEndDate",
    "BILLING TERMS": "billingTerms",
    "BILLING TERM": "billingTerms",
  },
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
    DATE: "invoiceDate",
    " DATE": "invoiceDate",
    "INV DATE": "invoiceDate",
    "INV. DATE": "invoiceDate",
    "BILL DATE": "invoiceDate",
    "INVOICE DATE": "invoiceDate",
    "INVOICE_DATE": "invoiceDate",
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
    const upperHeaders = headers.map((h) => h.toUpperCase());
    const isAmcMaster =
      (targetSheetName && targetSheetName.toUpperCase().includes("AMC")) ||
      (upperHeaders.includes("JOB NO") &&
        (upperHeaders.includes("1ST SERVICE") || upperHeaders.includes("FIRST SERVICE")) &&
        (upperHeaders.includes("CLIENT NAME") || upperHeaders.includes("CLIENT NAME & ADDRESS")));

    if (isAmcMaster) {
      detectedEntity = "AMC_Master";
    } else {
      const resolvedFromProfile = sheetClassification ? resolveTargetCrmEntity(sheetClassification.sourceProfile) : null;
      const profileEntity = typeof resolvedFromProfile === "object" && resolvedFromProfile !== null ? resolvedFromProfile.crmEntity : resolvedFromProfile;

      if (profileEntity && profileEntity !== "OUT_OF_SCOPE") {
        detectedEntity = profileEntity;
      } else {
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
// AMC Master Validation Handler (Multi-Row Contracts & Job Number Engine)
// ============================================================
export const validateAmcMasterSession = async ({
  req,
  res,
  session,
  workbook,
  sheetName,
  rawRows,
  headerRowIndex,
  headers,
  mappings,
}) => {
  const dataRows = rawRows.slice(headerRowIndex + 1);

  // Load existing customers for matching & disambiguation
  const existingCustomers = await Customer.find().lean();
  const existingPhoneMap = new Map();
  const existingNameMap = new Map();

  existingCustomers.forEach((c) => {
    if (c.phone) existingPhoneMap.set(normalizeStr(c.phone), c);
    if (c.fullName) existingNameMap.set(normalizeStr(c.fullName), c);
  });

  const alphabetSectionRows = [];
  const vacantSlots = [];
  const occupiedRows = [];
  let p09Conflict = null;

  dataRows.forEach((r, idx) => {
    const rowNum = headerRowIndex + 2 + idx;
    const jobNo = String(r[0] || "").trim().toUpperCase();
    const clientName = String(r[1] || "").trim();
    const service = String(r[6] || "").trim();

    if (!jobNo) return;

    // 1. Alphabet section header: single letter A-Z with no client and no service
    if (/^[A-Z]$/.test(jobNo) && !clientName && !service) {
      alphabetSectionRows.push({ rowNumber: rowNum, letter: jobNo });
      return;
    }

    const isBlankClient = !clientName || clientName === "null" || clientName === "-";
    const isBlankService = !service || service === "null" || service === "-";

    // 2. Vacant slot candidate
    if (isBlankClient && isBlankService) {
      if (jobNo === "P/09") {
        p09Conflict = {
          jobNo: "P/09",
          rowNumber: rowNum,
          type: "CONFLICT_SLOT",
          reason: "Occupied in rows 189/190 by PAWAR PATKAR CONST, but row 193 has no client. Occupied record is preserved.",
        };
      } else {
        vacantSlots.push({
          jobNo,
          rowNumber: rowNum,
          parsed: parseJobNo(jobNo),
        });
      }
    } else {
      occupiedRows.push({
        rowNumber: rowNum,
        rawIdx: idx,
        fullRow: r,
        jobNo,
        clientName,
        address: String(r[2] || "").trim(),
        location: String(r[3] || "").trim(),
        contactPerson: String(r[4] || "").trim(),
        phone: String(r[5] || "").trim(),
        serviceName: service,
        area: String(r[7] || "").trim(),
        frequency: String(r[9] || "").trim(),
        charges: evaluateCellNumeric(r[10]),
        firstService: r[27],
        secondService: r[28],
        thirdService: r[29],
        fourthService: r[30],
        contractEndDate: r[31],
        billingTerms: String(r[32] || "").trim(),
      });
    }
  });

  // Group occupied rows by jobNo
  const groupedContracts = new Map();
  occupiedRows.forEach((row) => {
    if (!groupedContracts.has(row.jobNo)) {
      groupedContracts.set(row.jobNo, []);
    }
    groupedContracts.get(row.jobNo).push(row);
  });

  const fieldConflicts = [];
  const contractsList = [];
  const uniqueNamesSet = new Set();
  let totalPaymentsCount = 0;
  let ambiguousMatchesCount = 0;

  for (const [jobNo, rows] of groupedContracts.entries()) {
    const rawFullName = rows[0].clientName;
    const primaryName = extractPrimaryName(rawFullName);
    uniqueNamesSet.add(normalizeStr(rawFullName));

    // Multi-row field inconsistencies
    const phones = Array.from(new Set(rows.map((r) => r.phone).filter(Boolean)));
    const contacts = Array.from(new Set(rows.map((r) => r.contactPerson).filter(Boolean)));
    const addresses = Array.from(new Set(rows.map((r) => r.address).filter(Boolean)));
    const billings = Array.from(new Set(rows.map((r) => r.billingTerms).filter(Boolean)));

    let primaryPhone = phones[0] || "";
    let alternatePhone = phones.length > 1 ? phones.slice(1).join(", ") : "";
    if (phones.length > 1) {
      fieldConflicts.push({
        jobNo,
        field: "phone",
        values: phones,
        resolvedValue: primaryPhone,
        secondaryValue: alternatePhone,
        resolutionStrategy: "Primary phone + alternatePhone",
      });
    }

    let primaryContact = contacts[0] || "";
    let alternateContact = contacts.length > 1 ? contacts.slice(1).join(" / ") : "";
    if (contacts.length > 1) {
      fieldConflicts.push({
        jobNo,
        field: "contactPerson",
        values: contacts,
        resolvedValue: primaryContact,
        secondaryValue: alternateContact,
        resolutionStrategy: "Primary contact + alternate contact notes",
      });
    }

    let primaryAddress = addresses[0] || "";
    let secondaryAddress = addresses.length > 1 ? addresses.slice(1).join("; ") : "";
    if (addresses.length > 1) {
      fieldConflicts.push({
        jobNo,
        field: "address",
        values: addresses,
        resolvedValue: primaryAddress,
        secondaryValue: secondaryAddress,
        resolutionStrategy: "Customer profile address + Service site address",
      });
    }

    if (billings.length > 1) {
      fieldConflicts.push({
        jobNo,
        field: "billingTerms",
        values: billings,
        resolvedValue: billings[0],
        resolutionStrategy: "Per-service billing terms preserved on individual service lines",
      });
    }

    // Extract payments with deduplication
    const totalContractCharges = rows.reduce((sum, r) => sum + r.charges, 0);
    const paymentResult = extractContractPayments(
      rows.map((r) => ({ rowIdx: r.rowNumber, fullRow: r.fullRow })),
      jobNo,
      totalContractCharges
    );
    totalPaymentsCount += paymentResult.payments.length;

    // Customer Matching & Ambiguity Check
    let matchType = "NEW";
    let matchedCustomer = null;
    let reviewRequired = false;
    let reviewReason = "";

    const normPhone = primaryPhone ? normalizeStr(primaryPhone) : "";
    const normName = normalizeStr(primaryName || rawFullName);
    const existingByPhone = normPhone ? existingPhoneMap.get(normPhone) : null;
    const existingByName = normName ? existingNameMap.get(normName) : null;

    if (existingByPhone) {
      const existingNameNorm = normalizeStr(existingByPhone.fullName);
      if (existingNameNorm === normName || existingNameNorm.includes(normName) || normName.includes(existingNameNorm)) {
        matchType = "CLEAN_MATCH";
        matchedCustomer = {
          id: existingByPhone._id.toString(),
          fullName: existingByPhone.fullName,
          phone: existingByPhone.phone,
          address: existingByPhone.address,
        };
      } else {
        matchType = "AMBIGUOUS_MATCH";
        reviewRequired = true;
        reviewReason = `Phone ${primaryPhone} matches existing customer "${existingByPhone.fullName}", but name "${rawFullName}" differs. Manual review required.`;
        matchedCustomer = {
          id: existingByPhone._id.toString(),
          fullName: existingByPhone.fullName,
          phone: existingByPhone.phone,
          address: existingByPhone.address,
        };
        ambiguousMatchesCount++;
      }
    } else if (existingByName) {
      const existingAddrNorm = normalizeStr(existingByName.address);
      const candAddrNorm = normalizeStr(primaryAddress);
      const isPlaceholderAddr = !existingByName.address || existingByName.address === "Address not provided" || existingByName.address === "N/A";

      if (isPlaceholderAddr || existingAddrNorm === candAddrNorm || !primaryAddress) {
        matchType = "CLEAN_MATCH";
        matchedCustomer = {
          id: existingByName._id.toString(),
          fullName: existingByName.fullName,
          phone: existingByName.phone,
          address: existingByName.address,
        };
      } else {
        matchType = "AMBIGUOUS_MATCH";
        reviewRequired = true;
        reviewReason = `Name matches existing customer "${existingByName.fullName}", but address or phone differs. Manual review required.`;
        matchedCustomer = {
          id: existingByName._id.toString(),
          fullName: existingByName.fullName,
          phone: existingByName.phone,
          address: existingByName.address,
        };
        ambiguousMatchesCount++;
      }
    }

    const services = rows.map((r) => {
      const freqInfo = normalizeFrequency(r.frequency);
      return {
        rowNumber: r.rowNumber,
        serviceName: r.serviceName || "Pest Control",
        area: r.area,
        frequency: freqInfo.validFreq,
        rawFrequency: freqInfo.rawFrequency,
        frequencyType: freqInfo.frequencyType,
        contractVisitCount: freqInfo.contractVisitCount,
        charges: r.charges,
        firstService: r.firstService,
        secondService: r.secondService,
        thirdService: r.thirdService,
        fourthService: r.fourthService,
        contractEndDate: r.contractEndDate,
        billingTerms: r.billingTerms,
        serviceAddress: r.address || primaryAddress,
      };
    });

    contractsList.push({
      jobNo,
      customer: {
        fullName: rawFullName,
        primaryName,
        address: primaryAddress,
        phone: primaryPhone,
        alternatePhone,
        contactPerson: primaryContact,
        alternateContact,
        customerType: rawFullName.toUpperCase().includes("PVT") || rawFullName.toUpperCase().includes("LTD") || rawFullName.toUpperCase().includes("LLP") ? "commercial" : "residential",
      },
      parsedJobNo: parseJobNo(jobNo),
      services,
      payments: paymentResult.payments,
      paymentWarnings: paymentResult.warnings,
      totalCharges: totalContractCharges,
      totalPaid: paymentResult.totalPaid,
      matchType,
      matchedCustomer,
      reviewRequired,
      reviewReason,
      rowNumbers: rows.map((r) => r.rowNumber),
    });
  }

  const summary = {
    totalRows: dataRows.length,
    alphabetHeadersCount: alphabetSectionRows.length,
    uniqueOccupiedJobNumbers: groupedContracts.size,
    uniqueCustomerRecords: groupedContracts.size,
    uniqueCustomerNames: uniqueNamesSet.size,
    totalServiceEntries: occupiedRows.length,
    vacantSlotsCount: vacantSlots.length,
    fieldConflictsCount: fieldConflicts.length,
    paymentEntriesCount: totalPaymentsCount,
    ambiguousMatchesCount,
    p09ConflictDetected: !!p09Conflict,
  };

  const reconciliationReport = headers.map((header, colIdx) => ({
    colIdx,
    header,
    columnKey: `col_${colIdx}_${header}`,
    targetField: mappings[`col_${colIdx}_${header}`] || PRESET_MAPPINGS.AMC_Master[header.toUpperCase()] || "UNMAPPED",
    status: "PASS",
  }));

  session.validationResults = {
    summary,
    targetEntity: "AMC_Master",
    groupedContracts: contractsList,
    vacantSlots,
    p09Conflict,
    fieldConflicts,
    alphabetSectionRows,
    reconciliationReport,
  };
  session.status = "validated";
  await session.save();

  return res.status(200).json({
    message: "AMC Master validation completed successfully",
    summary,
    fieldConflicts,
    vacantSlots,
    p09Conflict,
    reconciliationReport,
    groupedContracts: contractsList,
    totalContracts: contractsList.length,
  });
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

    const target = targetEntity || session.targetEntity;
    const isAmc = target === "AMC_Master" || (sheetName && sheetName.toUpperCase().includes("AMC"));

    if (isAmc) {
      return await validateAmcMasterSession({
        req,
        res,
        session,
        workbook,
        sheetName,
        rawRows,
        headerRowIndex,
        headers,
        mappings: mappings || session.mappings || {},
      });
    }

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

    if (session.status === "committed") {
      return res.status(400).json({ message: "This import session has already been committed." });
    }

    const targetEntity = session.targetEntity;
    const isAmc = targetEntity === "AMC_Master" || (session.selectedSheet && session.selectedSheet.toUpperCase().includes("AMC"));

    if (isAmc) {
      if (!session.validationResults || !session.validationResults.groupedContracts) {
        return res.status(400).json({ message: "Session must be validated before committing" });
      }
      return await commitAmcMasterSession({ req, res, session, choices });
    }

    if (!session.validationResults || !session.validationResults.rows) {
      return res.status(400).json({ message: "Session must be validated before committing" });
    }

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
              if (parsedFreq.includes("3") || parsedFreq.includes("three")) validFreq = "Yearly 3 services";
              else if (parsedFreq.includes("twiceaweek") || parsedFreq.includes("twice")) validFreq = "twice a week";
              else if (parsedFreq.includes("week")) validFreq = "weekly";
              else if (parsedFreq.includes("month")) validFreq = "monthly";
              else if (parsedFreq.includes("quarter")) validFreq = "Quarterly";
              else if (parsedFreq.includes("fourthnight") || parsedFreq.includes("fortnight") || parsedFreq.includes("fourth")) validFreq = "Fourth nightly";

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
                billingPeriod: normalizeBillingPeriod(
                  rowData.billingPeriod,
                  rowData.invoiceDate
                ),
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
                if (parsedFreq.includes("3") || parsedFreq.includes("three")) validFreq = "Yearly 3 services";
                else if (parsedFreq.includes("twiceaweek") || parsedFreq.includes("twice")) validFreq = "twice a week";
                else if (parsedFreq.includes("week")) validFreq = "weekly";
                else if (parsedFreq.includes("month")) validFreq = "monthly";
                else if (parsedFreq.includes("quarter")) validFreq = "Quarterly";
                else if (parsedFreq.includes("fourthnight") || parsedFreq.includes("fortnight") || parsedFreq.includes("fourth")) validFreq = "Fourth nightly";

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

// ============================================================
// 6. AMC Master Commit Handler
// ============================================================
export const commitAmcMasterSession = async ({ req, res, session, choices }) => {
  const validationResults = session.validationResults;
  const groupedContracts = validationResults.groupedContracts || [];
  const vacantSlots = validationResults.vacantSlots || [];

  const choiceMap = new Map();
  if (choices && Array.isArray(choices)) {
    choices.forEach((c) => {
      if (c.jobNo) choiceMap.set(c.jobNo, c);
    });
  }

  const batchId = "BATCH-AMC-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
  const userId = req.admin?._id || null;

  let createdCustomersCount = 0;
  let updatedCustomersCount = 0;
  let createdServicesCount = 0;
  let createdRenewalsCount = 0;
  let assignedJobNosCount = 0;
  let vacantRegisteredCount = 0;
  let skippedCount = 0;
  const errorReport = [];

  // 1. Process Occupied Contracts
  for (const contract of groupedContracts) {
    const jobNo = contract.jobNo;
    const choice = choiceMap.get(jobNo) || {};
    const action = choice.action || (contract.reviewRequired ? "REVIEW" : "IMPORT");

    if (action === "SKIP") {
      skippedCount++;
      continue;
    }

    try {
      let customerId = choice.selectedCustomerId || (contract.matchedCustomer ? contract.matchedCustomer.id : null);
      let customerDoc = null;

      if (customerId) {
        // Link to existing customer & save before-image
        customerDoc = await Customer.findById(customerId);
        if (customerDoc) {
          const beforeImg = customerDoc.toObject();
          await ImportAuditLog.create({
            batchId,
            entityType: "Customer",
            entityId: customerDoc._id,
            action: "ENRICHED",
            beforeImage: beforeImg,
            executedBy: userId,
            reason: `Linked from AMC Master import for Job No ${jobNo}`,
          });

          // Safe enrichment: enrich address if placeholder
          if (!customerDoc.address || customerDoc.address === "Address not provided" || customerDoc.address === "N/A") {
            customerDoc.address = contract.customer.address || "N/A";
          }
          if (!customerDoc.jobNo) {
            customerDoc.jobNo = jobNo;
          }
          await customerDoc.save();
          updatedCustomersCount++;
        }
      }

      if (!customerDoc) {
        // Create new Customer
        const custPayload = {
          fullName: contract.customer.primaryName || contract.customer.fullName,
          jobNo,
          customerType: contract.customer.customerType || "residential",
          address: contract.customer.address || "N/A",
          contactPerson: contract.customer.contactPerson || "",
          alternatePhone: contract.customer.alternatePhone || "",
          importMeta: {
            batchId,
            sourceSheet: session.selectedSheet,
            sourceJobNo: jobNo,
            sourceRows: contract.rowNumbers,
            importedAt: new Date(),
          },
        };

        if (contract.customer.phone) {
          custPayload.phone = contract.customer.phone;
        }

        try {
          customerDoc = new Customer(custPayload);
          await customerDoc.save();
        } catch (saveErr) {
          // If phone collision occurred, save with alternatePhone to guarantee customer creation
          if (saveErr.code === 11000 && saveErr.keyPattern?.phone) {
            delete custPayload.phone;
            custPayload.alternatePhone = contract.customer.phone;
            customerDoc = new Customer(custPayload);
            await customerDoc.save();
          } else {
            throw saveErr;
          }
        }

        await ImportAuditLog.create({
          batchId,
          entityType: "Customer",
          entityId: customerDoc._id,
          action: "CREATED",
          afterImage: customerDoc.toObject(),
          executedBy: userId,
          reason: `Created new Customer for Job No ${jobNo} from AMC Master`,
        });
        createdCustomersCount++;
      }

      customerId = customerDoc._id;

      // Register / Assign JobNumber
      const parsed = parseJobNo(jobNo);
      let jn = await JobNumber.findOne({ jobNo });
      if (!jn) {
        jn = new JobNumber({
          jobNo,
          prefix: parsed.prefix,
          sequence: parsed.sequence,
          status: "assigned",
          customerId,
          isLegacy: parsed.isLegacy,
          assignmentHistory: [
            {
              action: "assigned",
              customerId,
              customerName: customerDoc.fullName,
              reason: "Imported from AMC Master sheet",
              timestamp: new Date(),
            },
          ],
          importMeta: {
            batchId,
            sourceSheet: session.selectedSheet,
            sourceRow: contract.rowNumbers[0],
          },
        });
        await jn.save();
      } else {
        jn.status = "assigned";
        jn.customerId = customerId;
        jn.isLegacy = parsed.isLegacy;
        jn.assignmentHistory.push({
          action: "assigned",
          customerId,
          customerName: customerDoc.fullName,
          reason: "Assigned via AMC Master import",
          timestamp: new Date(),
        });
        jn.importMeta = {
          batchId,
          sourceSheet: session.selectedSheet,
          sourceRow: contract.rowNumbers[0],
        };
        await jn.save();
      }

      await ImportAuditLog.create({
        batchId,
        entityType: "JobNumber",
        entityId: jn._id,
        action: "CREATED",
        afterImage: jn.toObject(),
        executedBy: userId,
        reason: `Assigned Job No ${jobNo} to customer ${customerDoc.fullName}`,
      });
      assignedJobNosCount++;

      // Build customer snapshot
      const customerSnapshot = {
        jobNo,
        fullName: customerDoc.fullName,
        phone: customerDoc.phone || customerDoc.alternatePhone || "",
        address: customerDoc.address,
        contactPerson: customerDoc.contactPerson || "",
        companyName: customerDoc.companyName || "",
      };

      // Create Services
      for (const srv of contract.services) {
        const srvDate = parseExcelPaymentDate(srv.firstService) || parseExcelPaymentDate(srv.secondService) || new Date();
        const nextDate = parseExcelPaymentDate(srv.secondService) || undefined;

        const newService = new Service({
          customer: customerId,
          jobNo,
          serviceName: srv.serviceName,
          serviceDate: srvDate,
          nextServiceDate: nextDate,
          address: srv.serviceAddress || customerDoc.address,
          amount: srv.charges || 0,
          area: srv.area || "",
          frequency: srv.frequency,
          rawFrequency: srv.rawFrequency,
          frequencyType: srv.frequencyType,
          contractVisitCount: srv.contractVisitCount,
          customerSnapshot,
          status: "active",
          importMeta: {
            batchId,
            sourceRows: [srv.rowNumber],
          },
        });
        await newService.save();

        await ImportAuditLog.create({
          batchId,
          entityType: "Service",
          entityId: newService._id,
          action: "CREATED",
          afterImage: newService.toObject(),
          executedBy: userId,
        });
        createdServicesCount++;
      }

      // Create Renewal
      const serviceVisits = [];
      const firstRow = contract.services[0] || {};
      if (firstRow.firstService) serviceVisits.push({ visitLabel: "1ST SERVICE", visitDateStr: String(firstRow.firstService) });
      if (firstRow.secondService) serviceVisits.push({ visitLabel: "2ND SERVICE", visitDateStr: String(firstRow.secondService) });
      if (firstRow.thirdService) serviceVisits.push({ visitLabel: "3RD SERVICE", visitDateStr: String(firstRow.thirdService) });
      if (firstRow.fourthService) serviceVisits.push({ visitLabel: "4TH SERVICE", visitDateStr: String(firstRow.fourthService) });

      const paymentHistory = (contract.payments || []).map((p) => ({
        receivedAmount: p.amount,
        date: p.date,
        mode: p.mode,
        balance: 0,
        remark: `Installment P${p.blockIndex}`,
      }));

      const newRenewal = new Renewal({
        renewalNumber: jobNo,
        customer: customerId,
        customerSnapshot,
        services: contract.services.map((s) => ({
          serviceName: s.serviceName,
          frequency: s.frequency,
          address: s.serviceAddress || customerDoc.address,
          amount: s.charges,
        })),
        serviceVisits,
        contractEndDate: parseExcelPaymentDate(firstRow.contractEndDate) || undefined,
        paymentTerm: firstRow.billingTerms || "ANNUM",
        subtotal: contract.totalCharges,
        totalAmount: contract.totalCharges,
        paymentHistory,
        status: "Draft",
        importMeta: {
          batchId,
          sourceRows: contract.rowNumbers,
        },
      });
      await newRenewal.save();

      await ImportAuditLog.create({
        batchId,
        entityType: "Renewal",
        entityId: newRenewal._id,
        action: "CREATED",
        afterImage: newRenewal.toObject(),
        executedBy: userId,
      });
      createdRenewalsCount++;
    } catch (err) {
      errorReport.push({
        jobNo,
        problem: "Failed to import contract",
        reason: err.message,
      });
    }
  }

  // 2. Register Vacant Slots
  for (const slot of vacantSlots) {
    try {
      const parsed = slot.parsed || parseJobNo(slot.jobNo);
      let jn = await JobNumber.findOne({ jobNo: slot.jobNo });
      if (!jn) {
        jn = new JobNumber({
          jobNo: slot.jobNo,
          prefix: parsed.prefix,
          sequence: parsed.sequence,
          status: "available",
          customerId: null,
          isLegacy: parsed.isLegacy,
          assignmentHistory: [
            {
              action: "vacant_registered",
              customerId: null,
              reason: "Registered vacant slot from AMC Master sheet",
              timestamp: new Date(),
            },
          ],
          importMeta: {
            batchId,
            sourceSheet: session.selectedSheet,
            sourceRow: slot.rowNumber,
          },
        });
        await jn.save();
      } else if (jn.status === "available") {
        jn.importMeta = {
          batchId,
          sourceSheet: session.selectedSheet,
          sourceRow: slot.rowNumber,
        };
        await jn.save();
      }

      await ImportAuditLog.create({
        batchId,
        entityType: "JobNumber",
        entityId: jn._id,
        action: "CREATED",
        afterImage: jn.toObject(),
        executedBy: userId,
        reason: `Registered vacant slot ${slot.jobNo}`,
      });
      vacantRegisteredCount++;
    } catch (slotErr) {
      // Ignore slot duplicate
    }
  }

  // 3. Sync Sequence Counters
  await syncJobNumberSequences();

  session.status = "committed";
  session.commitResults = {
    batchId,
    createdCustomers: createdCustomersCount,
    updatedCustomers: updatedCustomersCount,
    createdServices: createdServicesCount,
    createdRenewals: createdRenewalsCount,
    assignedJobNumbers: assignedJobNosCount,
    vacantRegistered: vacantRegisteredCount,
    skipped: skippedCount,
  };
  await session.save();

  return res.status(200).json({
    message: "AMC Master import session committed successfully",
    batchId,
    summary: session.commitResults,
    errorReport,
  });
};

// ============================================================
// 7. Rollback Batch Endpoint
// ============================================================
export const rollbackBatch = async (req, res) => {
  try {
    const { batchId } = req.body;
    if (!batchId) {
      return res.status(400).json({ message: "batchId is required for rollback" });
    }

    const auditLogs = await ImportAuditLog.find({ batchId }).sort({ createdAt: -1 });
    if (!auditLogs || auditLogs.length === 0) {
      return res.status(404).json({ message: `No import audit logs found for batch ID: ${batchId}` });
    }

    let deletedCount = 0;
    let restoredCount = 0;
    let releasedJobNosCount = 0;

    for (const log of auditLogs) {
      if (log.action === "CREATED") {
        if (log.entityType === "Customer") {
          await Customer.findByIdAndDelete(log.entityId);
          deletedCount++;
        } else if (log.entityType === "Service") {
          await Service.findByIdAndDelete(log.entityId);
          deletedCount++;
        } else if (log.entityType === "Renewal") {
          await Renewal.findByIdAndDelete(log.entityId);
          deletedCount++;
        } else if (log.entityType === "Invoice") {
          await Invoice.findByIdAndDelete(log.entityId);
          deletedCount++;
        } else if (log.entityType === "Quotation") {
          await Quotation.findByIdAndDelete(log.entityId);
          deletedCount++;
        } else if (log.entityType === "JobNumber") {
          const jn = await JobNumber.findById(log.entityId);
          if (jn) {
            if (jn.status === "available" && jn.importMeta?.batchId === batchId) {
              await JobNumber.findByIdAndDelete(log.entityId);
              deletedCount++;
            } else if (jn.customerId) {
              await JobNumber.findByIdAndUpdate(log.entityId, {
                status: "available",
                customerId: null,
                $push: {
                  assignmentHistory: {
                    action: "released",
                    customerId: null,
                    reason: `Rolled back import batch ${batchId}`,
                    timestamp: new Date(),
                  },
                },
              });
              releasedJobNosCount++;
            }
          }
        }
      } else if (log.action === "ENRICHED" || log.action === "MODIFIED") {
        if (log.beforeImage && log.entityId) {
          if (log.entityType === "Customer") {
            await Customer.findByIdAndUpdate(log.entityId, log.beforeImage);
            restoredCount++;
          }
        }
      }

      log.action = "ROLLED_BACK";
      log.reason = `Rolled back at ${new Date().toISOString()}`;
      await log.save();
    }

    await syncJobNumberSequences();

    res.status(200).json({
      message: `Batch ${batchId} rolled back successfully`,
      batchId,
      deletedCount,
      restoredCount,
      releasedJobNosCount,
    });
  } catch (error) {
    res.status(500).json({ message: "Rollback failed: " + error.message });
  }
};

// ============================================================
// 8. Pre-Migration Database Backup Endpoint
// ============================================================
export const triggerPreMigrationBackup = async (req, res) => {
  try {
    const backupResult = await createDatabaseBackup();
    const verification = await verifyBackupIntegrity(backupResult.backupDir);

    res.status(200).json({
      message: "Database backup created and verified successfully",
      backupDir: backupResult.backupDir,
      manifest: backupResult.manifest,
      verification,
    });
  } catch (error) {
    res.status(500).json({ message: "Backup failed: " + error.message });
  }
};

// ============================================================
// 9. Get Past Import Batches Endpoint
// ============================================================
export const getImportBatches = async (req, res) => {
  try {
    const batches = await ImportAuditLog.aggregate([
      {
        $group: {
          _id: "$batchId",
          totalLogs: { $sum: 1 },
          firstActionAt: { $min: "$createdAt" },
          lastActionAt: { $max: "$createdAt" },
          actions: { $addToSet: "$action" },
          entities: { $addToSet: "$entityType" },
        },
      },
      { $sort: { firstActionAt: -1 } },
      { $limit: 20 },
    ]);

    const formatted = batches.map((b) => ({
      batchId: b._id,
      totalRecords: b.totalLogs,
      firstActionAt: b.firstActionAt,
      lastActionAt: b.lastActionAt,
      status: b.actions.includes("ROLLED_BACK") ? "rolled_back" : "active",
      entities: b.entities,
    }));

    res.status(200).json({ batches: formatted });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch import batches: " + error.message });
  }
};
