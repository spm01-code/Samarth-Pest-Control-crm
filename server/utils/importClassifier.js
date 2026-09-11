import XLSX from "xlsx";

/**
 * Import Classifier Utility
 * Contains deterministic rules to identify sheet target entities based on:
 * - Row/column structures
 * - Column header names
 * - Row values
 * - Sheet name hints
 */

const SIGNALS = {
  customer: {
    headers: ["client name", "party name", "customer name", "company name", "contact person", "mobile no", "mob no", "phone", "email", "address"],
    weights: { "client name": 3, "party name": 3, "customer name": 3, "mobile no": 2, "mob no": 2, "phone": 2, "address": 2 }
  },
  employee: {
    headers: ["emp.name", "employee name", "joining date", "joiningdate", "role", "salary", "joining_date"],
    weights: { "employee name": 4, "emp.name": 3, "joining date": 4, "role": 4, "salary": 2 }
  },
  salary: {
    headers: ["basic", "day", "ot", "salary", "advance", "balance", "signature", "pf", "esic", "pt", "net salary", "sr. no.", "emp.name"],
    weights: { "basic": 3, "day": 2, "ot": 3, "pf": 4, "esic": 4, "pt": 4, "net salary": 4, "signature": 3 }
  },
  oneTimeJob: {
    headers: ["job no", "type of service", "location of pest", "premises area", "service date", "service time", "operator name", "oerater name", "service charges"],
    weights: { "job no": 3, "type of service": 5, "location of pest": 4, "premises area": 3, "service date": 2, "operator name": 4, "oerater name": 4, "service time": 4 }
  },
  service: {
    headers: ["1st service", "2nd service", "3rd service", "4th service", "billing terms", "exp", "expiry", "frequency", "contract no", "con n0"],
    weights: { "1st service": 5, "2nd service": 5, "billing terms": 4, "exp": 4, "contract no": 3, "con n0": 3, "frequency": 3 }
  },
  invoice: {
    headers: ["invoice date", "invoice no", "invoice number", "taxable amount", "taxable value", "cgst", "sgst", "igst", "invoice amount", "hsn", "sac", "tds", "rtn"],
    weights: { "invoice no": 4, "invoice number": 4, "invoice date": 3, "cgst": 4, "sgst": 4, "igst": 4, "invoice amount": 3, "hsn": 3, "sac": 3 }
  },
  quotation: {
    headers: ["qtn no", "qtn number", "quotation no", "quotation number", "premise to be treated", "premise to", "billing term"],
    weights: { "qtn no": 5, "qtn number": 5, "quotation no": 5, "quotation number": 5, "premise to be treated": 5 }
  },
  payment: {
    headers: ["payment balance", "received amount", "received amount2", "payment date", "payment method", "payment status", "balance amount", "balance", "date", "mode"],
    weights: { "payment balance": 4, "received amount": 2, "balance": 2, "mode": 1 }
  }
};

/**
 * Normalizes a string for header matching
 */
function normalizeString(val) {
  if (val === undefined || val === null) return "";
  return String(val).toLowerCase().trim().replace(/[^a-z0-9\s\/\.\-\+]/g, "").replace(/\s+/g, " ");
}

/**
 * Classifies a worksheet based on its headers and row data
 */
export function classifyWorksheet(workbookOrName, sheetName, rawRows, headerRowIndex, headers) {
  let workbookName = typeof workbookOrName === "string" ? workbookOrName : "workbook.xlsx";
  let actualRawRows = rawRows;
  let actualHeaderRowIndex = headerRowIndex !== undefined ? headerRowIndex : 0;
  let actualHeaders = headers;

  if (workbookOrName && typeof workbookOrName === "object" && workbookOrName.Sheets) {
    const sheet = workbookOrName.Sheets[sheetName];
    if (sheet) {
      actualRawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      actualHeaderRowIndex = 0;
      let maxCells = 0;
      for (let i = 0; i < Math.min(actualRawRows.length, 10); i++) {
        const row = actualRawRows[i];
        if (Array.isArray(row)) {
          const count = row.filter((cell) => cell !== null && cell !== "").length;
          if (count > maxCells && count >= 2) {
            maxCells = count;
            actualHeaderRowIndex = i;
          }
        }
      }
      actualHeaders = (actualRawRows[actualHeaderRowIndex] || []).map((h) => String(h).trim());
    } else {
      actualRawRows = [];
      actualHeaders = [];
      actualHeaderRowIndex = 0;
    }
  }

  const rowCount = actualRawRows?.length || 0;
  headers = actualHeaders || [];
  headerRowIndex = actualHeaderRowIndex;
  rawRows = actualRawRows || [];
  
  // Clean up sheet row checks (exclude header row)
  const nonEmptyRows = rawRows.filter(r => r && r.some(c => c !== undefined && c !== null && String(c).trim() !== ""));
  
  // 1. Identify Empty / Formatting / Reference templates
  if (nonEmptyRows.length === 0 || rowCount <= 1) {
    return {
      workbookName,
      sheetName,
      rowCount,
      headerRow: headerRowIndex,
      headers,
      sampleRows: [],
      likelyEntity: "unknown",
      confidence: 0,
      matchedSignals: [],
      uncertainSignals: ["empty-worksheet"],
      reason: "The sheet contains no records or only header metadata.",
      classificationStatus: "reference"
    };
  }

  // Check if it's a reference list or single job format template
  // E.g. "TA REPORT FORMAT" with 15 rows but no actual data records (all empty except DATE column)
  const rowsWithDataBelowHeader = rawRows.slice(headerRowIndex);
  const rowsWithMultipleValues = rowsWithDataBelowHeader.filter(r => r && r.filter(c => c !== undefined && c !== null && String(c).trim() !== "").length > 2);
  
  const isReferenceOrTemplate = rowsWithMultipleValues.length === 0;

  // Normalize headers
  const normalizedHeaders = headers.map(h => normalizeString(h));

  // Compute weights for each target category
  const scores = {};
  const matchedSignalsMap = {};

  Object.keys(SIGNALS).forEach(entity => {
    scores[entity] = 0;
    matchedSignalsMap[entity] = [];

    const entityDef = SIGNALS[entity];
    
    normalizedHeaders.forEach((header, index) => {
      if (header === "") return;

      // Direct match in headers list
      entityDef.headers.forEach(sig => {
        if (header.includes(sig) || sig.includes(header)) {
          const weight = entityDef.weights[sig] || 1;
          scores[entity] += weight;
          matchedSignalsMap[entity].push(headers[index]);
        }
      });
    });
  });

  // Apply Sheet Name secondary signals
  const normSheetName = normalizeString(sheetName);
  if (normSheetName.includes("qtn") || normSheetName.includes("quotation")) {
    scores.quotation += 3;
  }
  if (normSheetName.includes("invoice") || normSheetName.includes("gst") || normSheetName.includes("bill")) {
    scores.invoice += 3;
  }
  if (normSheetName.includes("salary") || normSheetName.includes("paysheet")) {
    scores.salary += 3;
  }
  if (normSheetName.includes("expiry") || normSheetName.includes("amc") || normSheetName.includes("schedule")) {
    scores.service += 2;
  }
  if (normSheetName.includes("one time") || normSheetName.includes("singl job")) {
    scores.oneTimeJob += 2;
  }
  if (normSheetName.includes("customer") || normSheetName.includes("client")) {
    scores.customer += 2;
  }
  if (normSheetName.includes("payment") || normSheetName.includes("balance")) {
    scores.payment += 2;
  }

  // Find the highest scoring classification
  let bestEntity = "unknown";
  let maxScore = 0;

  Object.keys(scores).forEach(entity => {
    if (scores[entity] > maxScore) {
      maxScore = scores[entity];
      bestEntity = entity;
    }
  });

  // Priority override: Repeating payment columns belong to Invoices or Renewals, NOT a standalone payment entity
  const hasInvoicePrimaryHeader = normalizedHeaders.some(h =>
    h.includes("invoice no") || h.includes("invoice number") || h.includes("invoice date") || h.includes("bill no") || h.includes("bii no")
  );
  if (hasInvoicePrimaryHeader && scores.invoice > 0) {
    bestEntity = "invoice";
  }

  const hasRenewalPrimaryHeader = normalizedHeaders.some(h =>
    h.includes("contract no") || h.includes("con n0") || h.includes("1st service") || h.includes("exp")
  );
  if (hasRenewalPrimaryHeader && scores.service > 0 && !hasInvoicePrimaryHeader) {
    bestEntity = "service";
  }

  const hasQuotationPrimaryHeader = normalizedHeaders.some(h =>
    h.includes("qtn no") || h.includes("quotation no") || h.includes("qtn number") || h.includes("premise to be treated")
  );
  if (hasQuotationPrimaryHeader && (scores.quotation > 0 || normSheetName.includes("qtn") || normWb.includes("qtn")) && !hasInvoicePrimaryHeader) {
    bestEntity = "quotation";
  }

  // Calculate confidence based on maximum score and header length matches
  let confidence = 0;
  let status = "unknown";
  let matchedSignals = matchedSignalsMap[bestEntity] || [];
  let uncertainSignals = [];
  let reason = "";

  if (bestEntity !== "unknown" && maxScore > 0) {
    if (maxScore >= 10) {
      confidence = 0.95;
      status = "auto";
      reason = `Strong matching header columns detected for entity type ${bestEntity} (Score: ${maxScore}).`;
    } else if (maxScore >= 5) {
      confidence = 0.75;
      status = "auto";
      reason = `Recognizable header patterns matched entity type ${bestEntity} (Score: ${maxScore}).`;
    } else {
      confidence = 0.40;
      status = "manual-review";
      reason = `Weak matches observed for entity type ${bestEntity} (Score: ${maxScore}). Needs manual mapping confirmation.`;
    }
  } else {
    reason = "No matching headers or recognizable structures found.";
    status = "unknown";
  }

  // Adjust for reference templates or empty rows
  if (isReferenceOrTemplate) {
    status = "reference";
    confidence = Math.max(0.1, confidence - 0.3);
    reason += " (WARNING: Sheet contains header structure but has no data rows below the header row)";
    uncertainSignals.push("empty-data-rows");
  }

  // Handle ambiguous cases: e.g. AMC sheet has both client details, service schedules, and payment details
  if (bestEntity === "service" && scores.customer >= 5) {
    uncertainSignals.push("contains-customer-attributes");
    reason += " Contains strong customer data, which may be imported as linked customer profile records.";
  }
  if (bestEntity === "invoice" && scores.payment >= 5) {
    uncertainSignals.push("contains-payment-details");
    reason += " Sheet contains payment receipt data associated with invoices.";
  }

  // Format sample rows (first 3 actual rows under header row)
  const sampleRows = [];
  let sampleCount = 0;
  for (let idx = headerRowIndex; idx < rawRows.length; idx++) {
    const row = rawRows[idx];
    if (row && row.some(c => c !== undefined && c !== null && String(c).trim() !== "")) {
      // Create a nice key-value object matching headers to cell values
      const rowObj = {};
      headers.forEach((h, colIdx) => {
        const val = row[colIdx];
        if (val !== undefined && val !== null && String(val).trim() !== "") {
          rowObj[h || `Col_${colIdx + 1}`] = String(val).trim();
        }
      });
      if (Object.keys(rowObj).length > 0) {
        sampleRows.push(rowObj);
        sampleCount++;
      }
    }
    if (sampleCount >= 3) break;
  }

  // Enforce zero confidence for low score
  if (confidence < 0.3) {
    bestEntity = "unknown";
    status = "unknown";
  }

  const normWb = normalizeString(workbookName || "");
  let sourceProfile = "UNKNOWN";
  if (bestEntity === "oneTimeJob") sourceProfile = "ONE_TIME_JOB";
  else if (bestEntity === "service") sourceProfile = "AMC_PC";
  else if (bestEntity === "invoice") {
    const hasGstHeaders = normalizedHeaders.some((h) => h.includes("gst") || h.includes("cgst") || h.includes("sgst"));
    if (normSheetName.includes("performa") || normWb.includes("performa")) sourceProfile = "PERFORMA_BILL";
    else if (normSheetName.includes("gst") || normWb.includes("gst") || hasGstHeaders) sourceProfile = "GST_ALL_INVOICE";
    else sourceProfile = "INVOICE_PC";
  } else if (bestEntity === "quotation") {
    if (normSheetName.includes("att") || normWb.includes("att")) sourceProfile = "ATT_QTN_LIST";
    else sourceProfile = "QTN_PC";
  } else if (bestEntity === "salary") sourceProfile = "ALL_SALARY";
  else if (bestEntity === "customer") sourceProfile = "CUSTOMER";
  else if (bestEntity === "employee") sourceProfile = "EMPLOYEE";

  return {
    workbookName,
    sheetName,
    rowCount,
    headerRow: headerRowIndex,
    headers,
    sampleRows,
    likelyEntity: bestEntity,
    sourceProfile,
    confidence: Number(confidence.toFixed(2)),
    matchedSignals: Array.from(new Set(matchedSignals)),
    uncertainSignals,
    reason,
    classificationStatus: status
  };
}

/**
 * Resolves worksheet classification to CRM target entity
 */
export function resolveTargetCrmEntity(classification, workbookName, sheetName, headers) {
  // Support string source profiles directly
  if (typeof classification === "string") {
    const s = classification.toUpperCase();
    let entity = "Customer";
    let isOutOfScope = false;
    let reason = "";

    if (s.includes("SALARY")) {
      entity = "OUT_OF_SCOPE";
      isOutOfScope = true;
      reason = "Salary data is out of scope.";
    } else if (s.includes("ONE_TIME") || s === "SERVICE") {
      entity = "Service";
      reason = "One time service.";
    } else if (s.includes("AMC") || s === "RENEWAL") {
      entity = "Renewal";
      reason = "AMC Contract Renewal.";
    } else if (s.includes("INVOICE") || s.includes("PERFORMA") || s.includes("GST")) {
      entity = "Invoice";
      reason = "Invoice / Billing.";
    } else if (s.includes("QTN") || s.includes("QUOTATION") || s.includes("ATT")) {
      entity = "Quotation";
      reason = "Quotation.";
    } else if (s.includes("EMPLOYEE")) {
      entity = "Employee";
      reason = "Employee.";
    }

    return {
      crmEntity: entity,
      isOutOfScope,
      reason,
      toString() {
        return this.crmEntity;
      },
    };
  }

  const normWb = normalizeString(workbookName || "");
  const normSheet = normalizeString(sheetName || "");
  const upperHeaders = (headers || []).map((h) => String(h).trim().toUpperCase());

  let crmEntity = "Customer";
  let isOutOfScope = false;
  let reason = "Default entity format.";

  // Check out of scope salary sheets first
  if (classification?.likelyEntity === "salary" || normWb.includes("salary") || normSheet.includes("salary")) {
    crmEntity = "OUT_OF_SCOPE";
    isOutOfScope = true;
    reason = "Employee salary and paysheet records are strictly OUT OF SCOPE for CRM import.";
  } else if (
    classification?.likelyEntity === "quotation" ||
    normWb.includes("qtn") ||
    normSheet.includes("qtn") ||
    upperHeaders.includes("QTN NO") ||
    upperHeaders.includes("PREMISE TO BE TREATED")
  ) {
    crmEntity = "Quotation";
    reason = "Identified as Quotation format.";
  } else if (
    classification?.likelyEntity === "invoice" ||
    normWb.includes("invoice") ||
    normSheet.includes("invoice") ||
    normSheet.includes("gst") ||
    normWb.includes("performa") ||
    upperHeaders.includes("INVOICE NO") ||
    upperHeaders.includes("INVOICE NUMBER") ||
    upperHeaders.includes("INVOICE DATE") ||
    upperHeaders.includes("BII NO") ||
    upperHeaders.includes("BILL NO") ||
    upperHeaders.includes("TAXABLE AMOUNT")
  ) {
    crmEntity = "Invoice";
    reason = "Identified as Invoice format.";
  } else if (
    classification?.likelyEntity === "oneTimeJob" ||
    normWb.includes("one time") ||
    normSheet.includes("one time") ||
    (upperHeaders.includes("JOB NO") && (upperHeaders.includes("TYPE OF SERVICE") || upperHeaders.includes("LOCATION OF PEST")))
  ) {
    crmEntity = "Service";
    reason = "Identified as Service (One Time Job) format.";
  } else if (
    classification?.likelyEntity === "service" ||
    normWb.includes("amc") ||
    normSheet.includes("amc") ||
    upperHeaders.includes("CONTRACT NO") ||
    upperHeaders.includes("CON N0") ||
    upperHeaders.includes("1ST SERVICE") ||
    upperHeaders.includes("EXP")
  ) {
    crmEntity = "Renewal";
    reason = "Identified as Contract Renewal (AMC) format.";
  } else if (upperHeaders.includes("ROLE") && (upperHeaders.includes("JOINING DATE") || upperHeaders.includes("SALARY"))) {
    crmEntity = "Employee";
    reason = "Identified as Employee format.";
  }

  return {
    crmEntity,
    isOutOfScope,
    reason,
    toString() {
      return this.crmEntity;
    },
  };
}
