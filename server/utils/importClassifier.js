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
 * 
 * @param {string} workbookName 
 * @param {string} sheetName 
 * @param {Array<Array<any>>} rawRows 
 * @param {number} headerRowIndex - 1-indexed header row
 * @param {Array<string>} headers - Headers extracted from the sheet
 * @returns {object} Structured classification report
 */
export function classifyWorksheet(workbookName, sheetName, rawRows, headerRowIndex, headers) {
  const rowCount = rawRows.length;
  
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

  return {
    workbookName,
    sheetName,
    rowCount,
    headerRow: headerRowIndex,
    headers,
    sampleRows,
    likelyEntity: bestEntity,
    confidence: Number(confidence.toFixed(2)),
    matchedSignals: Array.from(new Set(matchedSignals)),
    uncertainSignals,
    reason,
    classificationStatus: status
  };
}
