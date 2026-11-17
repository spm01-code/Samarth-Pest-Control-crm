import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

import DocumentTemplate from "../model/documentTemplateModel.js";
import CompanySetting from "../model/companySettingModel.js";
import { generatePdfFromPdfTemplate } from "./pdfTemplateGenerator.js";

// ============================================================
// HELPERS
// ============================================================

export const normalizeDate = (val) => {
  if (val === null || val === undefined || val === "") return null;

  // If already a Date object
  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return null;
    const y = val.getFullYear();
    // If Excel serial number was stored directly as year in Date (e.g. year = 46265)
    if (y >= 10000 && y <= 99999) {
      const recovered = new Date(Math.round((y - 25569) * 86400 * 1000));
      return Number.isNaN(recovered.getTime()) ? null : recovered;
    }
    if (y >= 1970 && y <= 2100) return val;
    return null;
  }

  // If number
  if (typeof val === "number") {
    if (Number.isNaN(val)) return null;
    // Excel serial date (e.g. 46265)
    if (val >= 10000 && val <= 99999) {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    // Unix timestamp in ms
    if (val > 99999) {
      const d = new Date(val);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  // If string
  if (typeof val === "string") {
    const s = val.trim();
    if (!s) return null;

    // Numeric Excel serial string e.g. "46265" or "46265.0"
    if (/^\d+(\.\d+)?$/.test(s)) {
      const num = parseFloat(s);
      if (num >= 10000 && num <= 99999) {
        const d = new Date(Math.round((num - 25569) * 86400 * 1000));
        if (!Number.isNaN(d.getTime())) return d;
      }
    }

    // Month-Year format like "SEP--26", "AUG--25", "OCT--26", "JAN--27", "FEB-26", "JUL--26"
    const monthYearMatch = s.match(/^([a-zA-Z]{3,})[\s\-]+(\d{2,4})$/);
    if (monthYearMatch) {
      const monthStr = monthYearMatch[1].toUpperCase();
      const yearVal = parseInt(monthYearMatch[2], 10);
      const fullYear = yearVal < 100 ? 2000 + yearVal : yearVal;
      const monthMap = {
        JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
        JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
      };
      const monthIdx = monthMap[monthStr.substring(0, 3)];
      if (monthIdx !== undefined) {
        const lastDay = new Date(Date.UTC(fullYear, monthIdx + 1, 0)).getUTCDate();
        return new Date(Date.UTC(fullYear, monthIdx, lastDay, 12, 0, 0));
      }
    }

    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (dmy) {
      const day = parseInt(dmy[1], 10);
      const month = parseInt(dmy[2], 10) - 1;
      let year = parseInt(dmy[3], 10);
      if (year < 100) year += 2000;
      if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
        const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
        if (!Number.isNaN(d.getTime())) return d;
      }
    }

    // ISO string or standard parseable string
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      if (y >= 10000 && y <= 99999) {
        const recovered = new Date(Math.round((y - 25569) * 86400 * 1000));
        return Number.isNaN(recovered.getTime()) ? null : recovered;
      }
      if (y >= 1970 && y <= 2100) return d;
    }
  }

  return null;
};

export const formatDate = (date) => {
  const parsedDate = normalizeDate(date);
  if (!parsedDate) return "";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(parsedDate);
};

const formatAmount = (amount) => {
  const value = Number(amount);

  if (Number.isNaN(value)) {
    return "0.00";
  }

  return value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const getGstCode = (gstNumber) => {
  if (!gstNumber) return "";

  const match = String(gstNumber).match(/^(\d{2})/);

  return match ? match[1] : "";
};

/**
 * Returns the first non-empty value.
 */
const firstValue = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return "";
};

const isPlaceholder = (value) => {
  if (value === undefined || value === null) return true;
  const s = String(value).trim().toUpperCase();
  return (
    s === "" ||
    s === "N/A" ||
    s === "NA" ||
    s === "-" ||
    s === "--" ||
    s === "NULL" ||
    s === "UNDEFINED" ||
    s === "ADDRESS NOT PROVIDED"
  );
};

const firstNonPlaceholderValue = (...values) => {
  for (const value of values) {
    if (!isPlaceholder(value)) {
      return typeof value === "string" ? value.trim() : value;
    }
  }

  return "";
};

const BILLING_MONTH_BY_INDEX = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEPT",
  "OCT",
  "NOV",
  "DEC",
];

const BILLING_MONTH_MAP = {
  1: "JAN", JAN: "JAN", JANUARY: "JAN",
  2: "FEB", FEB: "FEB", FEBRUARY: "FEB",
  3: "MAR", MAR: "MAR", MARCH: "MAR",
  4: "APR", APR: "APR", APRIL: "APR",
  5: "MAY", MAY: "MAY",
  6: "JUN", JUN: "JUN", JUNE: "JUN",
  7: "JUL", JUL: "JUL", JULY: "JUL",
  8: "AUG", AUG: "AUG", AUGUST: "AUG",
  9: "SEPT", SEP: "SEPT", SEPT: "SEPT", SEPTEMBER: "SEPT",
  10: "OCT", OCT: "OCT", OCTOBER: "OCT",
  11: "NOV", NOV: "NOV", NOVEMBER: "NOV",
  12: "DEC", DEC: "DEC", DECEMBER: "DEC",
};

/**
 * Formats a single date component of a billing period into "DD MMM YYYY" with uppercase month abbreviation.
 * Example: "26 AUG 2026", "25 SEPT 2026", "01 AUG 2026", etc.
 */
export const formatBillingDatePart = (val) => {
  if (!val) return "";
  const s = String(val).trim();

  // Pattern 1: "26 AUG 2026", "26 AUGUST 2026", "26-AUG-2026", "26th Aug 2026"
  const textMatch = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-]+([a-zA-Z]+)[\s\-]+(\d{2,4})$/);
  if (textMatch) {
    const day = String(parseInt(textMatch[1], 10)).padStart(2, "0");
    const mStr = textMatch[2].toUpperCase();
    let year = parseInt(textMatch[3], 10);
    if (year < 100) year += 2000;
    const month = BILLING_MONTH_MAP[mStr];
    if (month && year >= 1970 && year <= 2100) {
      return `${day} ${month} ${year}`;
    }
  }

  // Pattern 2: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmyMatch) {
    const day = String(parseInt(dmyMatch[1], 10)).padStart(2, "0");
    const monthNum = parseInt(dmyMatch[2], 10);
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;
    const month = BILLING_MONTH_MAP[monthNum];
    if (month && year >= 1970 && year <= 2100) {
      return `${day} ${month} ${year}`;
    }
  }

  // Pattern 3: YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const monthNum = parseInt(ymdMatch[2], 10);
    const day = String(parseInt(ymdMatch[3], 10)).padStart(2, "0");
    const month = BILLING_MONTH_MAP[monthNum];
    if (month && year >= 1970 && year <= 2100) {
      return `${day} ${month} ${year}`;
    }
  }

  // Fallback: parse via normalizeDate
  const d = normalizeDate(val);
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const partMap = {};
  for (const p of parts) partMap[p.type] = p.value;
  const day = String(partMap.day).padStart(2, "0");
  const monthIdx = parseInt(partMap.month, 10) - 1;
  const year = partMap.year;
  const month = BILLING_MONTH_BY_INDEX[monthIdx] || "";
  return `${day} ${month} ${year}`;
};

export const getBillingPeriod = (invoiceDate) => {
  const parsedDate = normalizeDate(invoiceDate);
  if (!parsedDate) return "";

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(parsedDate);

  const partMap = {};
  for (const p of parts) partMap[p.type] = p.value;
  const year = parseInt(partMap.year, 10);
  const monthIdx = parseInt(partMap.month, 10) - 1;

  const monthAbbr = BILLING_MONTH_BY_INDEX[monthIdx];
  const lastDay = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  const lastDayStr = String(lastDay).padStart(2, "0");

  return `01 ${monthAbbr} ${year} to ${lastDayStr} ${monthAbbr} ${year}`;
};

export const normalizeBillingPeriod = (billingPeriod, fallbackInvoiceDate) => {
  if (billingPeriod) {
    const s = String(billingPeriod).trim();

    // Check if entire string is an Excel serial number or numeric date e.g. "46265"
    if (/^\d{5}(\.\d+)?$/.test(s)) {
      const bp = getBillingPeriod(s);
      if (bp) return bp;
    }

    // Check if corrupted with Excel serial like '01 JANUARY 46265 to 31 JANUARY 46265'
    const serialMatch = s.match(/\b([3-5]\d{4})\b/);
    if (serialMatch) {
      const bp = getBillingPeriod(serialMatch[1]);
      if (bp) return bp;
    }

    // Check if it is a date range separated by "to", "-", or "–"
    const rangeMatch = s.split(/\s+(?:to|TO|To|-|–|—)\s+/);
    if (rangeMatch.length === 2) {
      const p1 = formatBillingDatePart(rangeMatch[0]);
      const p2 = formatBillingDatePart(rangeMatch[1]);
      if (p1 && p2) {
        return `${p1} to ${p2}`;
      }
    }

    // If single date given as billingPeriod
    const singleDate = formatBillingDatePart(s);
    if (singleDate) {
      return getBillingPeriod(s);
    }

    return s;
  }

  return fallbackInvoiceDate ? getBillingPeriod(fallbackInvoiceDate) : "";
};

export const getContractPeriodDates = (renewalDate) => {
  const date = normalizeDate(renewalDate) || new Date();
  let startYear = date.getFullYear();
  let startMonth = date.getMonth() + 1;
  if (startMonth > 11) {
    startMonth = 0;
    startYear += 1;
  }
  const startDate = new Date(startYear, startMonth, 1);
  const endDate = new Date(startYear + 1, startMonth, 0);

  const formatLongDate = (d) =>
    d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).toUpperCase();

  const contractPeriod = `${formatLongDate(startDate)} to ${formatLongDate(endDate)} (12 Months)`;

  return {
    contractStartDate: startDate,
    contractEndDate: endDate,
    contractPeriod,
  };
};

export const formatCleanAmountInWords = (rawWords, amount) => {
  let words = rawWords ? String(rawWords).trim() : "";
  if (!words && amount !== undefined && amount !== null && amount !== "") {
    words = numberToWords(amount);
  }
  if (!words) return "";
  words = words.replace(/^(?:rupees\s*)+/i, "").replace(/(?:\s*only)+$/i, "").trim();
  if (!words) return "";
  return `RUPEES ${words.toUpperCase()} ONLY`;
};

export const numberToWords = (amount) => {
  const ones = [
    "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
    "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN",
  ];
  const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

  const convertBelowHundred = (number) => {
    if (number < 20) return ones[number];
    const ten = Math.floor(number / 10);
    const one = number % 10;
    return `${tens[ten]} ${ones[one]}`.trim();
  };

  const convertBelowThousand = (number) => {
    const hundred = Math.floor(number / 100);
    const rest = number % 100;
    if (hundred && rest) {
      return `${ones[hundred]} HUNDRED ${convertBelowHundred(rest)}`;
    }
    if (hundred) {
      return `${ones[hundred]} HUNDRED`;
    }
    return convertBelowHundred(rest);
  };

  const cleanAmount = Number(amount) || 0;
  const rupees = Math.floor(cleanAmount);
  const paise = Math.round((cleanAmount - rupees) * 100);

  if (cleanAmount === 0) return "RUPEES ZERO ONLY";

  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;

  let words = "";
  if (crore) words += `${convertBelowThousand(crore)} CRORE `;
  if (lakh) words += `${convertBelowThousand(lakh)} LAKH `;
  if (thousand) words += `${convertBelowThousand(thousand)} THOUSAND `;
  if (rest) words += convertBelowThousand(rest);

  let result = `RUPEES ${words.trim()}`;
  if (paise > 0) {
    result += ` AND PAISA ${convertBelowHundred(paise)}`;
  }
  result += " ONLY";
  return result;
};

const resolveTemplatePath = (template) => {
  if (!template || !template.filePath) return null;
  const rawPath = template.filePath;
  const normalizedFilePath = rawPath ? rawPath.replace(/\\/g, "/") : "";
  const diskFileName = path.basename(normalizedFilePath);
  const userFileName = template.fileName || diskFileName;

  const candidatePaths = [
    rawPath,
    normalizedFilePath,
    path.resolve(process.cwd(), normalizedFilePath),
    path.resolve(process.cwd(), "uploads", "templates", diskFileName),
    path.resolve(process.cwd(), "server", "uploads", "templates", diskFileName),
    path.resolve(process.cwd(), "templates", diskFileName),
    path.resolve(process.cwd(), "server", "templates", diskFileName),
    path.resolve(process.cwd(), "uploads", "templates", userFileName),
    path.resolve(process.cwd(), "server", "uploads", "templates", userFileName),
    path.resolve(process.cwd(), "templates", userFileName),
    path.resolve(process.cwd(), "server", "templates", userFileName),
  ];

  return candidatePaths.find(
    (candidate) => Boolean(candidate) && fs.existsSync(candidate)
  ) || null;
};

/**
 * Get active document template.
 */
const getActiveTemplate = async (documentType) => {
  if (mongoose.connection?.readyState === 1) {
    try {
      const templates = await DocumentTemplate.find({ documentType }).sort({ isActive: -1, updatedAt: -1 });

      for (const tmpl of templates) {
        const resolvedPath = resolveTemplatePath(tmpl);
        if (resolvedPath) {
          return {
            ...(tmpl.toObject ? tmpl.toObject() : tmpl),
            filePath: resolvedPath,
          };
        }
      }
    } catch (e) {
      // Fallback to disk templates if query fails
    }
  }

  // Fallback to disk templates when database is unavailable or during standalone verification
  const fallbackNames = {
    "tax-invoice": ["FORMAT TAX BILL PLACEHOLDER.docx", "FORMAT TAX BILL PLACEHOLDER.pdf"],
    invoice: ["FORMAT - PC INVOICE PLACEHOLDER.docx", "FORMAT - PC INVOICE PLACEHOLDER.pdf"],
    quotation: [
      "1791628450521-535595073.pdf",
      "1788666430485-540408911.docx",
      "PC_QTN_-_FORMAT.docx",
    ],
    "contract-renewal": ["FORMAT - CONTRACT RENEWAL.docx", "FORMAT - CONTRACT RENEWAL.pdf"],
    "one-time-job": ["FORMAT - ONE TIME JOB.docx", "FORMAT - ONE TIME JOB.pdf"],
    "att-quotation": ["FORMAT - ATT QTN PLACEHOLDER.docx", "FORMAT - ATT QTN PLACEHOLDER.pdf"],
  };

  const candidates = fallbackNames[documentType] || [];
  for (const name of candidates) {
    const p = resolveTemplatePath({ filePath: name, fileName: name });
    if (p) {
      return {
        documentType,
        filePath: p,
        fileName: name,
        mimeType: name.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    }
  }

  throw new Error(
    `The active template file for '${documentType}' could not be found on the server`,
  );
};

export const isPdfTemplateFile = (template) => Boolean(
  template?.mimeType === "application/pdf" ||
  (typeof template?.filePath === "string" && template.filePath.toLowerCase().endsWith(".pdf")) ||
  (typeof template?.fileName === "string" && template.fileName.toLowerCase().endsWith(".pdf"))
);

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function applyHangingIndentToRenderedXml(xmlContent) {
  const labelConfigs = [
    { label: "PREMISES TREATED:", indent: 2150 },
    { label: "Premises to be Treated:", indent: 2150 },
    { label: "Premise To Be Treated:", indent: 2150 },
    { label: "Location to be Treated:", indent: 2150 },
    { label: "TYPE OF TREATMENT:", indent: 2150 },
    { label: "BILLING PERIOD :", indent: 2400 },
    { label: "Contract Period :", indent: 2400 },
    { label: "WORK ORDER NO :", indent: 2400 },
    { label: "WORK ORDER DATE :", indent: 2400 },
    { label: "Client Name :", indent: 2400 },
    { label: "Address :", indent: 2400 },
    { label: "Contact Person :", indent: 2400 },
    { label: "Contact Number :", indent: 2400 },
    { label: "Payment Term:", indent: 2200 },
    { label: "Subject :", indent: 1600 },
    { label: "Specification :", indent: 2200 },
    { label: "Equipment :", indent: 2000 },
  ];

  let xml = xmlContent;

  // Guard 1: Ensure contract renewal tables do not have ColorfulList style grey shading
  if (xml.includes('w:tblStyle w:val="ColorfulList"')) {
    xml = xml.replace(/w:tblStyle w:val="ColorfulList"/g, 'w:tblStyle w:val="TableGrid"');
  }

  // Guard 2: Ensure ATT quotation scope table value cells (blue cells BCD6ED) have clean uniform padding & no hanging/cutoff
  if (xml.includes("BCD6ED")) {
    xml = xml.replace(/<w:tc\b[\s\S]*?<\/w:tc>/g, (tcXml) => {
      if (!tcXml.includes("BCD6ED")) return tcXml;
      let cleaned = tcXml;
      cleaned = cleaned.replace(/w:right="5\d+"/g, 'w:right="120"');
      cleaned = cleaned.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (pXml) => {
        let p = pXml;
        p = p.replace(/(<w:t[^>]*>)(\s+)/g, "$1");
        const indMatch = p.match(/<w:ind\b([^>]*)\/?>/i);
        const uniformInd = `<w:ind w:left="120" w:right="120"/>`;
        if (indMatch) {
          p = p.replace(indMatch[0], uniformInd);
        } else if (p.includes("<w:pPr>")) {
          p = p.replace("<w:pPr>", `<w:pPr>${uniformInd}`);
        } else if (p.includes("<w:pPr/>")) {
          p = p.replace("<w:pPr/>", `<w:pPr>${uniformInd}</w:pPr>`);
        } else {
          p = p.replace(/<w:p(\s+[^>]*)?>/, `<w:p$1><w:pPr>${uniformInd}</w:pPr>`);
        }
        return p;
      });
      return cleaned;
    });
  }

  // Align Being Charges starting position with PREMISES TREATED: label starting position
  const premisesPMatch = xml.match(/<w:p\b[\s\S]*?PREMISES TREATED:[\s\S]*?<\/w:p>/i);
  let targetIntroLeft = 176;
  if (premisesPMatch) {
    const pIndMatch = premisesPMatch[0].match(/<w:ind\b[^>]*w:left="(\d+)"/i);
    if (pIndMatch) {
      targetIntroLeft = parseInt(pIndMatch[1], 10);
    }
  }

  // Ensure introductory text inside Particulars cell aligns exactly with PREMISES TREATED:
  xml = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (pXml) => {
    if (!/Being Charges|mentioned below/i.test(pXml)) return pXml;
    let p = pXml;
    // Strip arbitrary spacing runs inside introductory text
    p = p.replace(/(<w:t[^>]*>)\s{2,}(<\/w:t>)/g, "$1$2");

    const indMatch = p.match(/<w:ind\b([^>]*)\/?>/i);
    const newInd = `<w:ind w:left="${targetIntroLeft}" w:right="${targetIntroLeft}"/>`;
    if (indMatch) {
      p = p.replace(indMatch[0], newInd);
    } else if (p.includes("<w:pPr>")) {
      p = p.replace("<w:pPr>", `<w:pPr>${newInd}`);
    } else if (p.includes("<w:pPr/>")) {
      p = p.replace("<w:pPr/>", `<w:pPr>${newInd}</w:pPr>`);
    } else {
      p = p.replace(/<w:p(\s+[^>]*)?>/, `<w:p$1><w:pPr>${newInd}</w:pPr>`);
    }
    return p;
  });

  for (const { label, indent } of labelConfigs) {
    const escapedLabel = escapeRegex(label);
    const pRegex = new RegExp(`(<w:p\\b[\\s\\S]*?>)([\\s\\S]*?)(<\\/w:p>)`, "g");

    xml = xml.replace(pRegex, (fullP, pOpen, pBody, pClose) => {
      // Check if pBody contains the label (case-insensitive)
      if (!new RegExp(escapedLabel, "i").test(pBody)) return fullP;
      // If already processed with hanging indent, don't duplicate
      if (pBody.includes("w:hanging=")) return fullP;
      // If the paragraph is already part of a Word bullet/numbered list, do not override
      if (pBody.includes("<w:numPr>") || pBody.includes("<w:numPr ")) return fullP;

      let indentTwips = indent;
      const szMatch = pBody.match(/<w:sz\b[^>]*?w:val="(\d+)"/i);
      if (szMatch) {
        const pt = parseInt(szMatch[1], 10) / 2;
        if (/premises/i.test(label)) {
          indentTwips = Math.round(pt * 205) + 90;
        } else if (/treatment/i.test(label)) {
          indentTwips = Math.round(pt * 218) + 100;
        }
      }

      let baseLeft = 0;
      const indMatch = pBody.match(/<w:ind\b([^>]*)\/?>/i);
      if (indMatch) {
        const leftMatch = indMatch[1].match(/w:left="(\d+)"/i);
        const hangMatch = indMatch[1].match(/w:hanging="(\d+)"/i);
        if (leftMatch) {
          baseLeft = parseInt(leftMatch[1], 10);
          if (hangMatch) {
            baseLeft -= parseInt(hangMatch[1], 10);
          }
        }
      }

      const totalLeft = baseLeft + indentTwips;
      const newInd = `<w:ind w:left="${totalLeft}" w:hanging="${indentTwips}"/>`;
      const tabStop = `<w:tab w:val="left" w:pos="${totalLeft}"/>`;

      let updatedBody = pBody;

      // Update or insert w:ind in w:pPr
      if (indMatch) {
        updatedBody = updatedBody.replace(indMatch[0], newInd);
      } else if (updatedBody.includes("<w:pPr>")) {
        updatedBody = updatedBody.replace("<w:pPr>", `<w:pPr>${newInd}`);
      } else if (updatedBody.includes("<w:pPr/>")) {
        updatedBody = updatedBody.replace("<w:pPr/>", `<w:pPr>${newInd}</w:pPr>`);
      } else {
        updatedBody = `<w:pPr>${newInd}</w:pPr>${updatedBody}`;
      }

      // Add tab stop to w:tabs
      if (updatedBody.includes("<w:tabs>")) {
        if (!updatedBody.includes(`w:pos="${totalLeft}"`)) {
          updatedBody = updatedBody.replace("<w:tabs>", `<w:tabs>${tabStop}`);
        }
      } else {
        updatedBody = updatedBody.replace("</w:pPr>", `<w:tabs>${tabStop}</w:tabs></w:pPr>`);
      }

      // Add slight vertical separation above TYPE OF TREATMENT:
      if (/treatment/i.test(label)) {
        const spacingMatch = updatedBody.match(/<w:spacing\b([^>]*)\/?>/i);
        const treatmentSpacing = `<w:spacing w:before="160" w:after="0" w:line="260" w:lineRule="auto"/>`;
        if (spacingMatch) {
          let sAttr = spacingMatch[1];
          if (/w:before="\d+"/i.test(sAttr)) {
            sAttr = sAttr.replace(/w:before="\d+"/i, 'w:before="160"');
          } else {
            sAttr = `${sAttr} w:before="160"`;
          }
          updatedBody = updatedBody.replace(spacingMatch[0], `<w:spacing${sAttr}/>`);
        } else if (updatedBody.includes("<w:pPr>")) {
          updatedBody = updatedBody.replace("<w:pPr>", `<w:pPr>${treatmentSpacing}`);
        } else if (updatedBody.includes("<w:pPr/>")) {
          updatedBody = updatedBody.replace("<w:pPr/>", `<w:pPr>${treatmentSpacing}</w:pPr>`);
        }
      }

      // Insert tab between label and value if not already present, stripping leading template spaces so label stays at margin
      const labelRunRegex = new RegExp(`(<w:t[^>]*>)(\\s*)(${escapedLabel})(\\s*)([\\s\\S]*?)(<\\/w:t>)`, "i");
      updatedBody = updatedBody.replace(labelRunRegex, (m, openT, preSpaces, lbl, postSpaces, valText, closeT) => {
        const cleanVal = valText.trimStart();
        if (cleanVal.length > 0) {
          return `${openT}${lbl}${closeT}</w:r><w:r><w:tab/></w:r><w:r>${openT}${cleanVal}${closeT}`;
        } else {
          return `${openT}${lbl}${closeT}</w:r><w:r><w:tab/></w:r><w:r>`;
        }
      });

      // Strip any whitespace in the immediate subsequent run's text
      updatedBody = updatedBody.replace(/(<w:tab\/>\s*<\/w:r>\s*<w:r\b[^>]*>\s*<w:t\b[^>]*>)\s+/g, "$1");

      return `${pOpen}${updatedBody}${pClose}`;
    });
  }

  return xml;
}

/**
 * Load DOCX template.
 */
const loadDocxTemplate = (filePath) => {
  const content = fs.readFileSync(filePath, "binary");
  const zip = new PizZip(content);

  return new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });
};

/**
 * Generate DOCX buffer with post-render hanging indent.
 */
const generateBuffer = (doc) => {
  const zip = doc.getZip();
  try {
    const docFile = zip.file("word/document.xml");
    if (docFile) {
      let xml = docFile.asText();
      xml = applyHangingIndentToRenderedXml(xml);
      zip.file("word/document.xml", xml);
    }
  } catch (err) {
    console.warn("Could not apply post-render hanging indent:", err.message);
  }

  return zip.generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
};

/**
 * Get company settings.
 */
const getCompanySettings = async () => {
  if (mongoose.connection?.readyState === 1) {
    try {
      return await CompanySetting.findOne();
    } catch (e) {
      return null;
    }
  }
  return null;
};

// ============================================================
// COMPANY DATA
// ============================================================

const buildCompanyData = (companySettings) => {
  return {
    companyName: companySettings?.companyName || "",

    registerOffice: companySettings?.registerOffice || "",

    corporateOffice: companySettings?.corporateOffice || "",

    companyPhone: companySettings?.phone || "",

    phone: companySettings?.phone || "",

    companyEmail: companySettings?.email || "",

    email: companySettings?.email || "",

    companyWebsite: companySettings?.website || "",

    website: companySettings?.website || "",

    bankName: companySettings?.bankName || "",

    gstAccountNumber: companySettings?.gstAccountNumber || "",

    nonGstAccountNumber: companySettings?.nonGstAccountNumber || "",

    ifsc: companySettings?.ifsc || "",

    pan: companySettings?.pan || "",

    upiId: companySettings?.upiId || "",

    logoPath: companySettings?.logoPath || "",

    signaturePath: companySettings?.signaturePath || "",

    qrCodePath: companySettings?.qrCodePath || "",
  };
};

// ============================================================
// CUSTOMER DATA
// ============================================================

export const buildCustomerData = (customer, documentSnapshot) => {
  customer = customer || {};
  const snap = documentSnapshot || {};
  const jobNo = snap.jobNo || customer.jobNo || customer.archivedJobNo || "";
  const name =
    snap.companyName ||
    snap.fullName ||
    snap.customerName ||
    customer.companyName ||
    customer.fullName ||
    "";
  const address = snap.address || customer.address || "";
  const phone = snap.phone || customer.phone || "";
  const email = snap.email || customer.email || "";

  return {
    customerName: name,

    customerFullName: snap.fullName || snap.customerName || customer.fullName || "",

    customerCompanyName: snap.companyName || customer.companyName || "",

    customerAddress: address,

    customerPhone: phone,

    customerAlternatePhone: customer.alternatePhone || snap.alternatePhone || "",

    customerEmail: email,

    customerType: customer.customerType || snap.customerType || "",

    customerJobNo: jobNo,

    customerJobNumber: jobNo,

    contactPerson: snap.contactPerson || customer.contactPerson || "",

    customerContactPerson: snap.contactPerson || customer.contactPerson || "",
  };
};

// ============================================================
// INVOICE SERVICES
// ============================================================

const buildInvoiceServices = (invoice) => {
  if (Array.isArray(invoice?.services) && invoice.services.length > 0) {
    return invoice.services.map((service, index) => {
      const premisesTreated = firstNonPlaceholderValue(
        invoice?.premisesTreated,
        service?.premisesTreated,
        service?.address,
        service?.location,
        invoice?.customer?.address,
        "",
      );
      const address = firstNonPlaceholderValue(
        service?.address,
        service?.location,
        invoice?.premisesTreated,
        invoice?.customer?.address,
        "",
      );

      return {
        serviceNumber: String(index + 1),
        serviceName: service?.serviceName || invoice?.treatmentType || "",
        description: service?.desc || "",
        amount: formatAmount(service?.amount),
        serviceDate: formatDate(service?.serviceDate),
        nextServiceDate: formatDate(service?.nextServiceDate),
        address,
        location: address,
        frequency: service?.frequency || "",
        status: service?.status || "",
        premisesTreated,
        treatmentType: service?.serviceName || invoice?.treatmentType || "",
      };
    });
  }

  if (invoice?.premisesTreated || invoice?.treatmentType) {
    const premisesTreated = firstNonPlaceholderValue(
      invoice?.premisesTreated,
      invoice?.customer?.address,
      "",
    );

    return [
      {
        serviceNumber: "1",
        serviceName: invoice?.treatmentType || "Pest Control",
        description: "",
        amount: formatAmount(invoice?.subtotal || invoice?.totalAmount),
        serviceDate: formatDate(invoice?.invoiceDate),
        nextServiceDate: "",
        address: premisesTreated,
        location: premisesTreated,
        frequency: "",
        status: "",
        premisesTreated,
        treatmentType: invoice?.treatmentType || "",
      },
    ];
  }

  return [];
};

// ============================================================
// INVOICE TREATMENTS
// ============================================================

const buildInvoiceTreatments = (invoice) => {
  if (Array.isArray(invoice?.services) && invoice.services.length > 0) {
    return invoice.services.map((service, index) => ({
      treatmentNumber: String(index + 1),
      premisesTreated: firstNonPlaceholderValue(
        invoice?.premisesTreated,
        service?.premisesTreated,
        service?.address,
        service?.location,
        invoice?.customer?.address,
        "",
      ),
      treatmentType: service?.serviceName || invoice?.treatmentType || "",
      description: service?.desc || "",
      amount: formatAmount(service?.amount),
      serviceDate: formatDate(service?.serviceDate),
      nextServiceDate: formatDate(service?.nextServiceDate),
      frequency: service?.frequency || "",
      status: service?.status || "",
    }));
  }

  if (invoice?.premisesTreated || invoice?.treatmentType) {
    return [
      {
        treatmentNumber: "1",
        premisesTreated: firstNonPlaceholderValue(
          invoice?.premisesTreated,
          invoice?.customer?.address,
          "",
        ),
        treatmentType: invoice?.treatmentType || "",
        description: "",
        amount: formatAmount(invoice?.subtotal || invoice?.totalAmount),
        serviceDate: formatDate(invoice?.invoiceDate),
        nextServiceDate: "",
        frequency: "",
        status: "",
      },
    ];
  }

  return [];
};

// ============================================================
// QUOTATION SERVICES
// ============================================================

const buildQuotationServices = (quotation) => {
  if (!Array.isArray(quotation?.services)) {
    return [];
  }

  return quotation.services.map((service, index) => ({
    serviceNumber: String(index + 1),

    location: firstNonPlaceholderValue(
      service?.location,
      service?.address,
      service?.premisesTreated,
      quotation?.premisesTreated,
      quotation?.premises,
      quotation?.customer?.address,
      "",
    ),

    serviceName: firstValue(service?.serviceName, service?.name),

    frequency: firstValue(service?.frequency),

    amount: formatAmount(
      firstValue(service?.amount, service?.serviceCost, service?.cost),
    ),

    description: firstValue(service?.desc, service?.description),

    serviceDate: formatDate(service?.serviceDate),

    nextServiceDate: formatDate(service?.nextServiceDate),

    status: service?.status || "",
  }));
};

// ============================================================
// CONTRACT RENEWAL SERVICES
// ============================================================

/**
 * Builds the repeating service rows used by
 * the Contract Renewal DOCX template.
 *
 * Word template:
 *
 * {#services}
 * {serviceNumber}
 * {serviceName}
 * {location}
 * {frequency}
 * {amount}
 * {/services}
 */
const buildRenewalServices = (renewal) => {
  if (!Array.isArray(renewal?.services)) {
    return [];
  }

  return renewal.services.map((service, index) => {
    const serviceName = firstValue(
      service?.serviceName,
      service?.name,
      service?.serviceType,
    );

    const location = firstNonPlaceholderValue(
      service?.address,
      service?.location,
      service?.premisesTreated,
      renewal?.premisesTreated,
      renewal?.premises,
      renewal?.address,
      renewal?.customer?.address,
      "",
    );

    const frequency = firstValue(
      service?.frequency,
      service?.serviceFrequency,
      service?.periodicity,
    );

    const amount = firstValue(
      service?.amount,
      service?.serviceCost,
      service?.cost,
      service?.price,
    );

    return {
      // ----------------------------------------------------
      // Row Number
      // ----------------------------------------------------

      serviceNumber: String(index + 1),

      number: String(index + 1),

      // ----------------------------------------------------
      // Service
      // ----------------------------------------------------

      serviceName,

      serviceType: serviceName,

      treatmentType: serviceName,

      // ----------------------------------------------------
      // Location
      // ----------------------------------------------------

      location,

      premisesTreated: location,

      address: location,

      // ----------------------------------------------------
      // Frequency
      // ----------------------------------------------------

      frequency,

      serviceFrequency: frequency,

      // ----------------------------------------------------
      // Amount
      // ----------------------------------------------------

      amount: formatAmount(amount),

      serviceCost: formatAmount(amount),

      price: formatAmount(amount),

      cost: formatAmount(amount),

      // ----------------------------------------------------
      // Additional Fields
      // ----------------------------------------------------

      description: firstValue(service?.desc, service?.description),

      serviceDate: formatDate(service?.serviceDate),

      nextServiceDate: formatDate(service?.nextServiceDate),

      status: service?.status || "",
    };
  });
};

const resolveCgstPercentage = (invoice) => {
  const isGst = invoice?.invoiceType === "GST";
  if (!isGst) return "0";

  let pct = Number(invoice?.tax?.cgstPercentage || invoice?.cgstPercentage || invoice?.cgstRate || invoice?.tax?.cgstRate || 0);

  if (!pct || pct === 0) {
    const amount = Number(invoice?.tax?.cgstAmount || invoice?.cgstAmount || 0);
    const sub = Number(invoice?.subtotal || 0);
    if (amount > 0 && sub > 0) {
      pct = Math.round((amount / sub) * 100 * 100) / 100;
    }
  }

  return String(pct);
};

const resolveSgstPercentage = (invoice) => {
  const isGst = invoice?.invoiceType === "GST";
  if (!isGst) return "0";

  let pct = Number(invoice?.tax?.sgstPercentage || invoice?.sgstPercentage || invoice?.sgstRate || invoice?.tax?.sgstRate || 0);

  if (!pct || pct === 0) {
    const amount = Number(invoice?.tax?.sgstAmount || invoice?.sgstAmount || 0);
    const sub = Number(invoice?.subtotal || 0);
    if (amount > 0 && sub > 0) {
      pct = Math.round((amount / sub) * 100 * 100) / 100;
    }
  }

  return String(pct);
};

const resolveIgstPercentage = (invoice) => {
  const isGst = invoice?.invoiceType === "GST";
  if (!isGst) return "0";

  let pct = Number(invoice?.tax?.igstPercentage || invoice?.igstPercentage || invoice?.igstRate || invoice?.tax?.igstRate || 0);

  if (!pct || pct === 0) {
    const amount = Number(invoice?.tax?.igstAmount || invoice?.igstAmount || 0);
    const sub = Number(invoice?.subtotal || 0);
    if (amount > 0 && sub > 0) {
      pct = Math.round((amount / sub) * 100 * 100) / 100;
    }
  }

  return String(pct);
};

// ============================================================
// 1. INVOICE DOCX GENERATOR
// ============================================================

export const generateInvoiceDocx = async (invoice) => {
  try {
    if (!invoice) {
      throw new Error("Invoice is required");
    }

    // ------------------------------------------------------
    // Invoice Type
    // ------------------------------------------------------

    const isGstInvoice = invoice.invoiceType === "GST";

    const documentType = isGstInvoice ? "tax-invoice" : "invoice";

    // ------------------------------------------------------
    // Template
    // ------------------------------------------------------

    let template;
    try {
      template = await getActiveTemplate(documentType);
    } catch (_) {
      const fallbackCandidates = isGstInvoice
        ? [
            path.resolve(process.cwd(), "uploads", "templates", "FORMAT TAX BILL PLACEHOLDER.docx"),
            path.resolve(process.cwd(), "uploads", "templates", "FORMAT TAX BILL PLACEHOLDER.pdf"),
            path.resolve(process.cwd(), "server", "uploads", "templates", "FORMAT TAX BILL PLACEHOLDER.docx"),
            path.resolve(process.cwd(), "server", "uploads", "templates", "FORMAT TAX BILL PLACEHOLDER.pdf"),
            path.resolve(process.cwd(), "uploads", "templates", "1792067018549-94905542.docx"),
            path.resolve(process.cwd(), "server", "uploads", "templates", "1792067018549-94905542.docx"),
          ]
        : [
            path.resolve(process.cwd(), "uploads", "templates", "FORMAT - PC INVOICE PLACEHOLDER.docx"),
            path.resolve(process.cwd(), "uploads", "templates", "FORMAT - PC INVOICE PLACEHOLDER.pdf"),
            path.resolve(process.cwd(), "server", "uploads", "templates", "FORMAT - PC INVOICE PLACEHOLDER.docx"),
            path.resolve(process.cwd(), "server", "uploads", "templates", "FORMAT - PC INVOICE PLACEHOLDER.pdf"),
            path.resolve(process.cwd(), "uploads", "templates", "1788674559888-834328369.docx"),
            path.resolve(process.cwd(), "server", "uploads", "templates", "1788674559888-834328369.docx"),
          ];
      const found = fallbackCandidates.find((c) => fs.existsSync(c));
      if (found) {
        template = { filePath: found, documentType };
      } else {
        throw new Error(`The active template file for '${documentType}' could not be found on the server`);
      }
    }

    // ------------------------------------------------------
    // Company
    // ------------------------------------------------------

    const companySettings = await getCompanySettings();

    const companyData = buildCompanyData(companySettings);

    // ------------------------------------------------------
    // Customer
    // ------------------------------------------------------

    const customerData = buildCustomerData(invoice.customer, invoice.customerSnapshot);

    // ------------------------------------------------------
    // Services
    // ------------------------------------------------------

    const services = buildInvoiceServices(invoice);

    const treatments = buildInvoiceTreatments(invoice);

    // ------------------------------------------------------
    // Bank
    // ------------------------------------------------------

    const accountNumber = isGstInvoice
      ? companySettings?.gstAccountNumber || ""
      : companySettings?.nonGstAccountNumber || "";

    const rawCgstPctStr = resolveCgstPercentage(invoice);
    const rawSgstPctStr = resolveSgstPercentage(invoice);
    const rawIgstPctStr = resolveIgstPercentage(invoice);

    // Enforce mutual exclusivity for tax rendering:
    // If IGST rate > 0, treat as inter-state and zero-out CGST/SGST display.
    // If CGST/SGST > 0, zero-out IGST display.
    const isInterState = isGstInvoice && Number(rawIgstPctStr) > 0;
    const cgstPctStr = isInterState ? "0" : rawCgstPctStr;
    const sgstPctStr = isInterState ? "0" : rawSgstPctStr;
    const igstPctStr = isInterState ? rawIgstPctStr : "0";

    const cgstAmt = isGstInvoice && !isInterState ? formatAmount(invoice.tax?.cgstAmount || invoice.cgstAmount) : "0.00";
    const sgstAmt = isGstInvoice && !isInterState ? formatAmount(invoice.tax?.sgstAmount || invoice.sgstAmount) : "0.00";
    const igstAmt = isGstInvoice && isInterState ? formatAmount(invoice.tax?.igstAmount || invoice.igstAmount) : "0.00";

    // ------------------------------------------------------
    // Data
    // ------------------------------------------------------

    const data = {
      ...companyData,

      ...customerData,

      invoiceNumber: invoice.invoiceNumber || "",

      invoiceDate: formatDate(invoice.invoiceDate),

      dueDate: formatDate(invoice.dueDate),

      invoiceType: invoice.invoiceType || "",

      billingPeriod: normalizeBillingPeriod(
        invoice.billingPeriod,
        invoice.invoiceDate
      ),

      contractPeriod: firstValue(invoice.contractPeriod, ""),

      workOrderNumber: invoice.workOrderNumber || "",

      workOrderDate: formatDate(invoice.workOrderDate),

      gstNumber: isGstInvoice ? invoice.gstNumber || "" : "",

      gstin: isGstInvoice ? invoice.gstNumber || "" : "",

      GSTIN: isGstInvoice ? invoice.gstNumber || "" : "",

      companyGstin: companySettings?.companyTaxId || "27BDMPM1204J1ZL",

      companyGstNumber: companySettings?.companyTaxId || "27BDMPM1204J1ZL",

      gstCode: isGstInvoice ? getGstCode(invoice.gstNumber) : "",

      hsnCode: isGstInvoice ? invoice.hsnCode || "" : "",

      sacCode: isGstInvoice ? invoice.sacCode || "" : "",

      particulars: invoice.particulars || "",

      premisesTreated: firstNonPlaceholderValue(
        invoice.premisesTreated,
        invoice.services?.[0]?.address,
        invoice.customer?.address,
        "",
      ),

      treatmentType: invoice.treatmentType || "",

      subtotal: formatAmount(invoice.subtotal),

      totalTax: formatAmount(invoice.totalTax),

      cgstPercentage: cgstPctStr,

      cgstRate: cgstPctStr,

      cgstAmount: cgstAmt,

      sgstPercentage: sgstPctStr,

      sgstRate: sgstPctStr,

      sgstAmount: sgstAmt,

      igstPercentage: igstPctStr,

      igstRate: igstPctStr,

      igstAmount: igstAmt,

      igstTotal: igstAmt,

      totalIgst: igstAmt,

      IGST: igstAmt,

      IGST_RATE: igstPctStr,

      IGST_AMOUNT: igstAmt,

      isIgst: isInterState,

      hasIgst: isInterState,

      isCgstSgst: isGstInvoice && !isInterState && (Number(cgstPctStr) > 0 || Number(sgstPctStr) > 0),

      hasCgstSgst: isGstInvoice && !isInterState && (Number(cgstPctStr) > 0 || Number(sgstPctStr) > 0),

      taxType: isInterState ? "IGST" : "CGST/SGST",

      totalAmount: formatAmount(invoice.totalAmount),

      amountInWords:
        invoice.amountInWords?.trim() ||
        (invoice.totalAmount !== undefined && invoice.totalAmount !== null
          ? numberToWords(invoice.totalAmount)
          : ""),

      amountWords:
        invoice.amountInWords?.trim() ||
        (invoice.totalAmount !== undefined && invoice.totalAmount !== null
          ? numberToWords(invoice.totalAmount)
          : ""),

      totalAmountInWords:
        invoice.amountInWords?.trim() ||
        (invoice.totalAmount !== undefined && invoice.totalAmount !== null
          ? numberToWords(invoice.totalAmount)
          : ""),

      paymentStatus: invoice.paymentStatus || "",

      paymentMethod: invoice.paymentMethod || "",

      amountPaid: formatAmount(invoice.amountPaid),

      balanceAmount: formatAmount(invoice.balanceAmount),

      paymentDate: formatDate(invoice.paymentDate),

      transactionReference: invoice.transactionReference || "",

      notes: invoice.notes || "",

      bankName: companySettings?.bankName || "",

      accountNumber,

      gstAccountNumber: companySettings?.gstAccountNumber || "",

      nonGstAccountNumber: companySettings?.nonGstAccountNumber || "",

      ifsc: companySettings?.ifsc || "",

      pan: companySettings?.pan || "",

      upiId: companySettings?.upiId || "",

      treatments,

      services,
    };

    // ------------------------------------------------------
    // PDF / DOCX Pipeline Routing
    // ------------------------------------------------------

    if (isPdfTemplateFile(template)) {
      const pdfBuffer = await generatePdfFromPdfTemplate(template.filePath, data, documentType);
      return {
        buffer: pdfBuffer,
        template,
        documentType,
        data,
        isPdfDirect: true,
      };
    }

    // ------------------------------------------------------
    // Render DOCX
    // ------------------------------------------------------

    const doc = loadDocxTemplate(template.filePath);
    doc.render(data);

    const buffer = generateBuffer(doc);

    return {
      buffer,
      template,
      documentType,
      data,
    };
  } catch (error) {
    console.error("Invoice DOCX generation error:", error);

    throw error;
  }
};

// ============================================================
// 2. QUOTATION DOCX GENERATOR
// ============================================================
// 2A. ATT QUOTATION DOCX GENERATOR
// ============================================================

export const generateAttQuotationDocx = async (quotation) => {
  try {
    if (!quotation) {
      throw new Error("Quotation is required");
    }

    let template;
    try {
      template = await getActiveTemplate("att-quotation");
    } catch (_) {
      const fallbackCandidates = [
        path.resolve(process.cwd(), "uploads", "templates", "FORMAT - ATT QTN PLACEHOLDER.docx"),
        path.resolve(process.cwd(), "uploads", "templates", "FORMAT - ATT QTN PLACEHOLDER.pdf"),
        path.resolve(process.cwd(), "server", "uploads", "templates", "FORMAT - ATT QTN PLACEHOLDER.docx"),
        path.resolve(process.cwd(), "server", "uploads", "templates", "FORMAT - ATT QTN PLACEHOLDER.pdf"),
      ];
      const found = fallbackCandidates.find((c) => fs.existsSync(c));
      if (found) {
        template = { filePath: found, documentType: "att-quotation" };
      } else {
        throw new Error("ATT Quotation template file could not be found");
      }
    }

    const companySettings = await getCompanySettings();
    const companyData = buildCompanyData(companySettings);
    const customerData = buildCustomerData(quotation.customer, quotation.customerSnapshot);

    const treatments = Array.isArray(quotation.treatments)
      ? quotation.treatments.map((t) => ({
          typeOfTreatment: t.typeOfTreatment || "Anti Termite Pre-construction Treatment",
          warrantyPeriod: t.warrantyPeriod || "",
          chemicalUsed: t.chemicalUsed || "",
          serviceCharges: t.serviceCharges || "",
        }))
      : [];

    const data = {
      ...companyData,
      ...customerData,

      customerName: customerData.customerName,
      customerAddress: customerData.customerAddress,

      quotationNumber: firstValue(
        quotation.quotationNumber,
        quotation.quoteNumber,
        quotation.number,
      ),

      quotationDate: formatDate(
        firstValue(
          quotation.quotationDate,
          quotation.quoteDate,
          quotation.date,
          quotation.createdAt,
        ),
      ),

      subject: firstValue(
        quotation.subject,
        "Anti Termite Pre-construction Treatment at your site.",
      ),

      premises: firstValue(
        quotation.premises,
        customerData.customerAddress,
        "",
      ).trim(),

      premiseToBeTreated: firstValue(
        quotation.premises,
        customerData.customerAddress,
        "",
      ).trim(),

      specification: firstValue(
        quotation.specification,
        "Providing Material and Labour For Injecting Chemical Emulsion For Pre-Constructional Anti Termite Treatment. As Per 6313 (Part II) 2013",
      ),

      equipment: firstValue(
        quotation.equipment,
        "Sprayers & Sprinklers Will Be Used To Ensure Proper Penetration Of Chemicals Into the Earth.",
      ),

      paymentTerm: firstValue(
        quotation.paymentTerm,
        "Within 10 Days From The Date Of Submission Of invoice",
      ),

      paymentTerms: firstValue(
        quotation.paymentTerm,
        "Within 10 Days From The Date Of Submission Of invoice",
      ),

      treatments,
    };

    if (isPdfTemplateFile(template)) {
      const pdfBuffer = await generatePdfFromPdfTemplate(template.filePath, data, "att-quotation");
      return {
        buffer: pdfBuffer,
        template,
        documentType: "att-quotation",
        data,
        isPdfDirect: true,
      };
    }

    const doc = loadDocxTemplate(template.filePath);
    doc.render(data);
    const buffer = generateBuffer(doc);

    return {
      buffer,
      template,
      documentType: "att-quotation",
      data,
    };
  } catch (error) {
    console.error("ATT Quotation DOCX generation error:", error);
    throw error;
  }
};

// ============================================================
// 2B. QUOTATION DOCX GENERATOR (PC QUOTATION / DISPATCHER)
// ============================================================

export const generateQuotationDocx = async (quotation) => {
  try {
    if (!quotation) {
      throw new Error("Quotation is required");
    }

    if (quotation.quotationType === "ATT") {
      return await generateAttQuotationDocx(quotation);
    }

    let template;
    try {
      template = await getActiveTemplate("quotation");
    } catch (_) {
      const fallbackCandidates = [
        path.resolve(process.cwd(), "uploads", "templates", "1791628450521-535595073.pdf"),
        path.resolve(process.cwd(), "server", "uploads", "templates", "1791628450521-535595073.pdf"),
        path.resolve(process.cwd(), "uploads", "templates", "1788674503714-250917028.docx"),
        path.resolve(process.cwd(), "server", "uploads", "templates", "1788674503714-250917028.docx"),
      ];
      const found = fallbackCandidates.find((c) => fs.existsSync(c));
      if (found) {
        template = { filePath: found, documentType: "quotation" };
      } else {
        throw new Error("Quotation template file could not be found");
      }
    }

    const companySettings = await getCompanySettings();

    const companyData = buildCompanyData(companySettings);

    const customerData = buildCustomerData(quotation.customer, quotation.customerSnapshot);

    const services = buildQuotationServices(quotation);

    const computedServicesTotal = Array.isArray(quotation?.services)
      ? quotation.services.reduce(
          (sum, s) => sum + (Number(s.cost ?? s.amount) || 0),
          0,
        )
      : 0;

    const totalAmount = firstValue(
      quotation.totalAmount,
      quotation.total,
      quotation.grandTotal,
      quotation.amount,
      computedServicesTotal > 0 ? computedServicesTotal : "",
    );

    const data = {
      ...companyData,

      ...customerData,

      quotationNumber: firstValue(
        quotation.quotationNumber,
        quotation.quoteNumber,
        quotation.number,
      ),

      quoteNumber: firstValue(
        quotation.quotationNumber,
        quotation.quoteNumber,
        quotation.number,
      ),

      quotationDate: formatDate(
        firstValue(
          quotation.quotationDate,
          quotation.quoteDate,
          quotation.date,
          quotation.createdAt,
        ),
      ),

      quoteDate: formatDate(
        firstValue(
          quotation.quotationDate,
          quotation.quoteDate,
          quotation.date,
          quotation.createdAt,
        ),
      ),

      validity: firstValue(
        quotation.validity,
        quotation.validUntil,
        quotation.validityPeriod,
      ),

      validUntil: formatDate(quotation.validUntil),

      reference: firstValue(quotation.reference, quotation.referenceNumber),

      subject: firstValue(quotation.subject, quotation.title),

      premisesTreated: firstNonPlaceholderValue(
        quotation.premisesTreated,
        quotation.premises,
        customerData.customerAddress,
        "",
      ),

      particulars: firstValue(
        quotation.particulars,
        quotation.description,
        quotation.notes,
      ),

      terms: firstValue(quotation.terms, quotation.termsAndConditions),

      paymentTerms: firstValue(quotation.paymentTerms, quotation.paymentTerm),

      billingTerm: firstValue(quotation.billingTerm, quotation.billingTerms, "Monthly"),

      billingTerms: firstValue(quotation.billingTerm, quotation.billingTerms, "Monthly"),

      subtotal: formatAmount(quotation.subtotal),

      totalTax: formatAmount(quotation.totalTax),

      totalAmount: formatAmount(totalAmount),

      grandTotal: formatAmount(quotation.grandTotal),

      amountInWords: quotation.amountInWords || "",

      services,
    };

    if (isPdfTemplateFile(template)) {
      const pdfBuffer = await generatePdfFromPdfTemplate(template.filePath, data, "quotation");
      return {
        buffer: pdfBuffer,
        template,
        documentType: "quotation",
        data,
        isPdfDirect: true,
      };
    }

    const doc = loadDocxTemplate(template.filePath);

    doc.render(data);

    const buffer = generateBuffer(doc);

    return {
      buffer,
      template,
      documentType: "quotation",
      data,
    };
  } catch (error) {
    console.error("Quotation DOCX generation error:", error);

    throw error;
  }
};

// ============================================================
// 3. CONTRACT RENEWAL DOCX GENERATOR
// ============================================================

export const generateContractRenewalDocx = async (renewal) => {
  try {
    if (!renewal) {
      throw new Error("Contract renewal is required");
    }

    // ------------------------------------------------------
    // ACTIVE TEMPLATE
    // ------------------------------------------------------

    let template;
    try {
      template = await getActiveTemplate("contract-renewal");
    } catch (_) {
      const fallbackCandidates = [
        path.resolve(process.cwd(), "uploads", "templates", "FORMAT - CONTRACT RENEWAL.docx"),
        path.resolve(process.cwd(), "uploads", "templates", "FORMAT - CONTRACT RENEWAL.pdf"),
        path.resolve(process.cwd(), "server", "uploads", "templates", "FORMAT - CONTRACT RENEWAL.docx"),
        path.resolve(process.cwd(), "server", "uploads", "templates", "FORMAT - CONTRACT RENEWAL.pdf"),
        path.resolve(process.cwd(), "uploads", "templates", "1788674588486-303766681.docx"),
        path.resolve(process.cwd(), "server", "uploads", "templates", "1788674588486-303766681.docx"),
      ];
      const found = fallbackCandidates.find((c) => fs.existsSync(c));
      if (found) {
        template = { filePath: found, documentType: "contract-renewal" };
      } else {
        throw new Error("Contract renewal template file could not be found");
      }
    }

    // ------------------------------------------------------
    // COMPANY SETTINGS
    // ------------------------------------------------------

    const companySettings = await getCompanySettings();

    const companyData = buildCompanyData(companySettings);

    // ------------------------------------------------------
    // CUSTOMER
    // ------------------------------------------------------

    const customer = renewal.customer || {};

    const customerData = buildCustomerData(customer, renewal.customerSnapshot);

    // ------------------------------------------------------
    // SERVICES
    // ------------------------------------------------------

    const services = buildRenewalServices(renewal);

    // ------------------------------------------------------
    // CONTRACT DATES
    // ------------------------------------------------------

    const contractStartDate = firstValue(
      renewal.contractStartDate,
      renewal.startDate,
      renewal.fromDate,
      renewal.validFrom,
    );

    const contractEndDate = firstValue(
      renewal.contractEndDate,
      renewal.endDate,
      renewal.toDate,
      renewal.validTo,
    );

    // ------------------------------------------------------
    // CONTRACT NUMBER
    // ------------------------------------------------------

    const contractNumber = firstValue(
      renewal.contractNumber,
      renewal.renewalNumber,
      renewal.number,
      renewal.referenceNumber,
    );

    // ------------------------------------------------------
    // RENEWAL NUMBER
    // ------------------------------------------------------

    const renewalNumber = firstValue(
      renewal.renewalNumber,
      renewal.contractNumber,
      renewal.number,
    );

    // ------------------------------------------------------
    // TOTAL AMOUNT
    // ------------------------------------------------------

    const renewalAmount = firstValue(
      renewal.totalAmount,
      renewal.grandTotal,
      renewal.renewalAmount,
      renewal.amount,
      renewal.total,
    );

    // ------------------------------------------------------
    // CONTRACTEE
    // ------------------------------------------------------

    const contracteeName = firstValue(
      renewal.contracteeName,
      renewal.contractee,
      renewal.contactPerson,
      renewal.contactName,
      customer.fullName,
      customer.companyName,
    );

    const contracteeMobile = firstValue(
      renewal.contracteeMobile,
      renewal.contracteePhone,
      renewal.contactPhone,
      renewal.contactMobile,
      customer.phone,
    );

    // ------------------------------------------------------
    // PREMISES
    // ------------------------------------------------------

    const premisesTreated = firstNonPlaceholderValue(
      renewal.premisesTreated,
      renewal.premises,
      renewal.location,
      renewal.address,
      customer.address,
      "",
    );

    // ------------------------------------------------------
    // SUBJECT
    // ------------------------------------------------------

    const subject = firstValue(
      renewal.subject,
      renewal.title,
      "Pest Management Treatment to your premises.",
    );

    // ------------------------------------------------------
    const defaultRenewalPeriod = renewal.renewalDate
      ? getContractPeriodDates(renewal.renewalDate).contractPeriod
      : "";

    const contractPeriod = firstValue(
      renewal.contractPeriod,
      (contractStartDate && contractEndDate)
        ? `${formatDate(contractStartDate)} to ${formatDate(contractEndDate)}`
        : "",
      defaultRenewalPeriod,
      renewal.period,
      renewal.duration,
      "",
    );

    // ------------------------------------------------------
    // TEMPLATE DATA
    // ------------------------------------------------------

    const data = {
      // ====================================================
      // COMPANY
      // ====================================================

      ...companyData,

      // ====================================================
      // CUSTOMER
      // ====================================================

      ...customerData,

      // ====================================================
      // CONTRACT
      // ====================================================

      contractNumber,

      renewalNumber,

      renewalDate: formatDate(
        firstValue(renewal.renewalDate, renewal.date, renewal.createdAt),
      ),

      contractDate: formatDate(
        firstValue(renewal.contractDate, renewal.date, renewal.createdAt),
      ),

      // ====================================================
      // CONTRACT PERIOD
      // ====================================================

      contractStartDate: formatDate(contractStartDate),

      contractEndDate: formatDate(contractEndDate),

      startDate: formatDate(contractStartDate),

      endDate: formatDate(contractEndDate),

      contractPeriod,

      // ====================================================
      // CUSTOMER / CONTRACTEE
      // ====================================================

      contracteeName,

      contracteeMobile,

      contracteePhone: contracteeMobile,

      contactPerson: contracteeName,

      contactName: contracteeName,

      // ====================================================
      // PREMISES
      // ====================================================

      premisesTreated,

      premises: premisesTreated,

      location: premisesTreated,

      // ====================================================
      // SUBJECT / DESCRIPTION
      // ====================================================

      subject,

      description: firstValue(renewal.description, renewal.desc, renewal.notes),

      particulars: firstValue(
        renewal.particulars,
        renewal.description,
        renewal.desc,
      ),

      serviceName: firstValue(renewal.serviceName, renewal.service),

      treatmentType: firstValue(renewal.treatmentType, renewal.serviceType),

      // ====================================================
      // AMOUNTS
      // ====================================================

      subtotal: formatAmount(renewal.subtotal),

      totalTax: formatAmount(renewal.totalTax),

      totalAmount: formatAmount(renewalAmount),

      grandTotal: formatAmount(renewal.grandTotal),

      renewalAmount: formatAmount(renewal.renewalAmount),

      amount: formatAmount(renewalAmount),

      amountInWords: formatCleanAmountInWords(
        renewal.amountInWords,
        renewalAmount,
      ),

      // ====================================================
      // PAYMENT
      // ====================================================

      paymentTerms: firstValue(renewal.paymentTerms, renewal.paymentTerm),

      paymentTerm: firstValue(renewal.paymentTerm, renewal.paymentTerms),

      paymentStatus: renewal.paymentStatus || "",

      // ====================================================
      // TERMS
      // ====================================================

      terms: firstValue(renewal.terms, renewal.termsAndConditions),

      termsAndConditions: firstValue(renewal.termsAndConditions, renewal.terms),

      // ====================================================
      // STATUS
      // ====================================================

      status: renewal.status || "",

      // ====================================================
      // DYNAMIC SERVICE TABLE
      // ====================================================

      services,
    };

    // ------------------------------------------------------
    // PDF / DOCX Pipeline Routing
    // ------------------------------------------------------

    if (isPdfTemplateFile(template)) {
      const pdfBuffer = await generatePdfFromPdfTemplate(template.filePath, data, "contract-renewal");
      return {
        buffer: pdfBuffer,
        template,
        documentType: "contract-renewal",
        data,
        isPdfDirect: true,
      };
    }

    // ------------------------------------------------------
    // RENDER TEMPLATE
    // ------------------------------------------------------

    const doc = loadDocxTemplate(template.filePath);
    doc.render(data);

    // ------------------------------------------------------
    // GENERATE BUFFER
    // ------------------------------------------------------

    const buffer = generateBuffer(doc);

    return {
      buffer,
      template,
      documentType: "contract-renewal",
      data,
    };
  } catch (error) {
    console.error("Contract Renewal DOCX generation error:", error);

    throw error;
  }
};

// ============================================================
// 4. ONE TIME JOB SERVICE PAPER DOCX GENERATOR
// ============================================================

export const generateOneTimeJobDocx = async (service) => {
  try {
    if (!service) {
      throw new Error("Service is required");
    }

    // ------------------------------------------------------
    // ACTIVE TEMPLATE (DB or fallback)
    // ------------------------------------------------------
    let template;
    try {
      template = await getActiveTemplate("one-time-job");
    } catch (_) {
      const fallbackCandidates = [
        path.resolve(process.cwd(), "uploads", "templates", "FORMAT - ONE TIME JOB.docx"),
        path.resolve(process.cwd(), "uploads", "templates", "FORMAT - ONE TIME JOB.pdf"),
        path.resolve(process.cwd(), "server", "uploads", "templates", "FORMAT - ONE TIME JOB.docx"),
        path.resolve(process.cwd(), "server", "uploads", "templates", "FORMAT - ONE TIME JOB.pdf"),
      ];
      const found = fallbackCandidates.find((c) => fs.existsSync(c));
      if (found) {
        template = { filePath: found, documentType: "one-time-job" };
      } else {
        throw new Error("One Time Job template file could not be found");
      }
    }

    // ------------------------------------------------------
    // COMPANY SETTINGS
    // ------------------------------------------------------
    const companySettings = await getCompanySettings();
    const companyData = buildCompanyData(companySettings);

    // ------------------------------------------------------
    // CUSTOMER & OPERATOR DATA
    // ------------------------------------------------------
    const customer = service.customer || {};
    const customerData = buildCustomerData(customer, service.customerSnapshot);

    // ------------------------------------------------------
    // OCCURRENCES MAPPING (1ST, 2ND, 3RD SERVICE / COMPLAINT)
    // ------------------------------------------------------
    const occurrences = Array.isArray(service.serviceOccurrences)
      ? service.serviceOccurrences
      : [];

    const occ1 = occurrences[0] || null;
    const occ2 = occurrences[1] || null;
    const occ3 = occurrences[2] || null;

    // Operator name helper
    const resolveOperator = (occ) => {
      if (!occ) return "";
      return firstValue(
        occ.operatorName,
        occ.employee?.fullName,
        occ.employee?.name,
        ""
      );
    };

    // 1st Service / ONE TIME
    const serviceDate1 = formatDate(
      firstValue(occ1?.serviceDate, service.serviceDate)
    );
    const serviceTime1 = firstValue(occ1?.serviceTime, service.serviceTime, "");
    const operatorName1 = firstValue(
      resolveOperator(occ1),
      service.employee?.fullName,
      service.employee?.name,
      service.operatorName,
      ""
    );
    const clientSignature1 = firstValue(
      occ1?.clientSignature,
      service.clientSignature,
      ""
    );
    const paymentDetails1 = firstValue(
      occ1?.paymentDetails,
      service.paymentDetails,
      ""
    );

    // 2nd Service / Complaint
    const serviceDate2 = occ2?.serviceDate ? formatDate(occ2.serviceDate) : "";
    const serviceTime2 = firstValue(occ2?.serviceTime, "");
    const operatorName2 = resolveOperator(occ2);
    const clientSignature2 = firstValue(occ2?.clientSignature, "");
    const paymentDetails2 = firstValue(occ2?.paymentDetails, "");

    // 3rd Service / Complaint
    const serviceDate3 = occ3?.serviceDate ? formatDate(occ3.serviceDate) : "";
    const serviceTime3 = firstValue(occ3?.serviceTime, "");
    const operatorName3 = resolveOperator(occ3);
    const clientSignature3 = firstValue(occ3?.clientSignature, "");
    const paymentDetails3 = firstValue(occ3?.paymentDetails, "");

    // Frequency formatting
    const rawFreq = String(service.frequency || "One Time Job").trim();
    const rawLower = rawFreq.toLowerCase();
    const formattedFrequency =
      rawLower === "one-time"
        ? "One Time Job"
        : rawLower === "fourth night" ||
          rawLower === "fourthnight" ||
          rawLower === "fourth-night" ||
          rawLower === "fourth nightly" ||
          rawLower === "fourthnightly"
        ? "Fourth nightly"
        : rawLower === "3 services yearly" ||
          rawLower === "3 service yearly" ||
          rawLower === "3 yearly services" ||
          rawLower === "3-yearly services" ||
          rawLower === "yearly 3 services"
        ? "Yearly 3 services"
        : rawFreq.charAt(0).toUpperCase() + rawFreq.slice(1);

    const data = {
      ...companyData,

      jobNo: (() => {
        const raw = firstValue(
          service.customerSnapshot?.jobNo,
          service.jobNo,
          service.documentNumber,
          service.jobNumber,
          customerData.customerJobNo,
          ""
        );
        return raw.replace(/^job\s*no[\.\s\-\/:]*/i, "");
      })(),

      customerName: firstValue(
        service.customerName,
        customerData.customerName,
        "Customer"
      ),

      customerAddress: firstValue(
        service.address,
        customerData.customerAddress,
        ""
      ),

      address: firstValue(
        service.address,
        customerData.customerAddress,
        ""
      ),

      contactPerson: firstValue(
        service.contactPerson,
        customer.contactPerson,
        service.customerName,
        customerData.customerName,
        ""
      ),

      contactNumber: firstValue(
        service.contactNumber,
        customer.phone,
        customer.alternatePhone,
        customerData.customerPhone,
        ""
      ),

      serviceName: firstValue(service.serviceName, service.name, ""),

      area: firstValue(service.area, service.premisesArea, ""),

      locationOfPest: firstValue(service.locationOfPest, ""),

      frequency: formattedFrequency,

      serviceCharges: formatAmount(service.amount),

      amount: formatAmount(service.amount),

      // 1st Service Column
      serviceDate1,
      serviceTime1,
      operatorName1,
      clientSignature1,
      paymentDetails1,

      // 2nd Service Column
      serviceDate2,
      serviceTime2,
      operatorName2,
      clientSignature2,
      paymentDetails2,

      // 3rd Service Column
      serviceDate3,
      serviceTime3,
      operatorName3,
      clientSignature3,
      paymentDetails3,

      // Single-occurrence aliases for backward compatibility
      serviceDate: serviceDate1,
      serviceTime: serviceTime1,
      operatorName: operatorName1,
      clientSignature: clientSignature1,
      paymentDetails: paymentDetails1,

      remark: firstValue(service.remark, service.desc, ""),

      gpayNumber: firstValue(companySettings?.phone, "8356080548"),

      accountNumber: firstValue(companySettings?.nonGstAccountNumber, companySettings?.accountNumber, "50200067645163"),

      bankName: firstValue(companySettings?.nonGstBankName, companySettings?.bankName, "HDFC BANK"),

      ifsc: firstValue(companySettings?.nonGstBankIfsc, companySettings?.ifsc, "HDFC0000051"),

      pan: firstValue(companySettings?.pan, "JCHPM5440Q"),

      upiId: firstValue(companySettings?.upiId, "8356080548@okbizaxis"),
    };

    if (isPdfTemplateFile(template)) {
      const pdfBuffer = await generatePdfFromPdfTemplate(template.filePath, data, "one-time-job");
      return {
        buffer: pdfBuffer,
        template,
        documentType: "one-time-job",
        data,
        isPdfDirect: true,
      };
    }

    const doc = loadDocxTemplate(template.filePath);
    doc.render(data);
    const buffer = generateBuffer(doc);

    return {
      buffer,
      template,
      documentType: "one-time-job",
      data,
    };
  } catch (error) {
    console.error("One Time Job DOCX generation error:", error);
    throw error;
  }
};
