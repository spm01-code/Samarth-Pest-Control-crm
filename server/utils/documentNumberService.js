import DocumentSequence from "../model/documentSequenceModel.js";
import CompanySetting from "../model/companySettingModel.js";

/**
 * Authoritative mapping of document types to fixed prefixes, padding, and layout order.
 * Strictly backend-controlled constants.
 */
export const DOCUMENT_CONFIG = Object.freeze({
  NON_GST_INVOICE: {
    type: "NON_GST_INVOICE",
    label: "Invoice — Non-GST",
    prefix: "SPMJ/",
    padding: 2,
    order: "SEQ_THEN_YEAR",
  },
  GST_INVOICE: {
    type: "GST_INVOICE",
    label: "Tax Invoice — GST",
    prefix: "SPM/",
    padding: 2,
    order: "SEQ_THEN_YEAR",
  },
  INVOICE: {
    type: "INVOICE",
    label: "Invoice",
    prefix: "SPM/",
    padding: 2,
    nonGstPrefix: "SPMJ/",
    nonGstPadding: 2,
    order: "SEQ_THEN_YEAR",
  },
  PC_QUOTATION: {
    type: "PC_QUOTATION",
    label: "PC Quotation",
    prefix: "SPM/PC/",
    padding: 2,
    order: "YEAR_THEN_SEQ",
  },
  ATT_QUOTATION: {
    type: "ATT_QUOTATION",
    label: "ATT Quotation",
    prefix: "SPM/ATT/",
    padding: 2,
    order: "YEAR_THEN_SEQ",
  },
  CONTRACT_RENEWAL: {
    type: "CONTRACT_RENEWAL",
    label: "Contract Renewal",
    prefix: "SPM/CR/",
    padding: 2,
    order: "YEAR_THEN_SEQ",
  },
  ONE_TIME_JOB: {
    type: "ONE_TIME_JOB",
    label: "One Time Job",
    prefix: "Job No/",
    padding: 2,
    order: "YEAR_THEN_SEQ",
  },
});

/**
 * Parses and validates year input.
 * Accepts:
 *  - 4-digit number/string: 2026, "2026"
 *  - Financial year string: "2026-2027", "2026-27"
 * Returns:
 *  {
 *    baseYear: 2026,
 *    financialYear: "2026-27",
 *    financialYearFull: "2026-2027",
 *    rawInput: "2026" | "2026-27"
 *  }
 */
export const parseYearInput = (yearInput) => {
  if (!yearInput) {
    const current = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const fyStart = currentMonth >= 3 ? current : current - 1;
    const fyEnd = fyStart + 1;
    const fyEndShort = String(fyEnd).slice(-2);
    return {
      baseYear: fyStart,
      financialYear: `${fyStart}-${fyEndShort}`,
      financialYearFull: `${fyStart}-${fyEnd}`,
      rawInput: String(current),
    };
  }

  const str = String(yearInput).trim();

  // Check financial year format: 2026-2027 or 2026-27
  const fyMatch = str.match(/^(\d{4})[-/](\d{2,4})$/);
  if (fyMatch) {
    const startYear = Number(fyMatch[1]);
    let endYear = Number(fyMatch[2]);
    if (fyMatch[2].length === 2) {
      endYear = Math.floor(startYear / 100) * 100 + endYear;
    }
    if (startYear < 2000 || startYear > 2099 || endYear !== startYear + 1) {
      throw new Error(
        `Invalid financial year format: "${str}". Example: 2026-27 or 2026-2027.`
      );
    }
    const endShort = String(endYear).slice(-2);
    return {
      baseYear: startYear,
      financialYear: `${startYear}-${endShort}`,
      financialYearFull: `${startYear}-${endYear}`,
      rawInput: str,
    };
  }

  // Check 4-digit calendar year: 2026
  const num = Number(str);
  if (Number.isInteger(num) && num >= 2000 && num <= 2099 && str.length === 4) {
    const nextYearShort = String(num + 1).slice(-2);
    return {
      baseYear: num,
      financialYear: `${num}-${nextYearShort}`,
      financialYearFull: `${num}-${num + 1}`,
      rawInput: str,
    };
  }

  throw new Error(
    `Invalid numbering year: "${yearInput}". Year must be a 4-digit year (e.g. 2026) or financial year (e.g. 2026-27).`
  );
};

/**
 * Returns the appropriate year string for a given document type.
 * Invoices strictly use the Indian financial year formatted as YYYY-YY (e.g. 2026-27),
 * while quotations, renewals, and one time jobs use the calendar year (e.g. 2026).
 */
export const getYearForDocType = (documentType, parsedYear) => {
  if (
    documentType === "INVOICE" ||
    documentType === "GST_INVOICE" ||
    documentType === "NON_GST_INVOICE"
  ) {
    return parsedYear.financialYear;
  }
  return parsedYear.baseYear;
};

/**
 * Validates year input and returns validated string representation.
 */
export const validateYear = (year) => {
  const parsed = parseYearInput(year);
  return parsed.rawInput;
};

/**
 * Formats a sequence number with a minimum of 2 digits.
 * 1 -> 01, 9 -> 09, 10 -> 10, 99 -> 99, 100 -> 100, 101 -> 101.
 * Never uses unnecessary padding such as 0001, 0002.
 */
export const formatSequence = (seq, padding = 2) => {
  const num = Number(seq);
  const minPad = Math.max(2, padding);
  if (Number.isNaN(num)) return String(seq);
  return String(num).padStart(minPad, "0");
};

/**
 * Formats the final document number string.
 *
 * For Invoices (GST & Non-GST):
 *  {PREFIX}/{DYNAMIC_NUMBER}/{FINANCIAL_YEAR}
 *  e.g. SPMJ/01/2026-27, SPM/01/2026-27
 *
 * For Quotations, Renewals, One Time Jobs:
 *  {PREFIX}{YEAR}/{DYNAMIC_NUMBER}
 *  e.g. SPM/PC/2026/01, SPM/ATT/2026/01, SPM/CR/2026/01, Job No/2026/01
 */
export const formatDocumentNumber = (
  prefixOrType,
  year,
  seq,
  padding = 2,
  order = null
) => {
  const formattedSeq = formatSequence(seq, padding);
  const config = DOCUMENT_CONFIG[prefixOrType];
  const prefix = config ? config.prefix : String(prefixOrType);
  const resolvedOrder =
    order ||
    (config ? config.order : null) ||
    (prefix.startsWith("SPMJ") || prefix === "SPM/" || prefix === "SPM"
      ? "SEQ_THEN_YEAR"
      : "YEAR_THEN_SEQ");

  if (resolvedOrder === "SEQ_THEN_YEAR") {
    const cleanPrefix = prefix.replace(/\/+$/, "");
    return `${cleanPrefix}/${formattedSeq}/${year}`;
  } else {
    const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
    return `${normalizedPrefix}${year}/${formattedSeq}`;
  }
};

/**
 * Gets the configured numbering year from CompanySetting.
 * Falls back to current calendar year if not set or invalid.
 */
export const getConfiguredYear = async () => {
  try {
    const settings = await CompanySetting.findOne();
    if (settings && settings.numberingYear) {
      return settings.numberingYear;
    }
  } catch (err) {
    console.error("Error reading configured numbering year:", err.message);
  }
  return new Date().getFullYear();
};

/**
 * Atomically generates the next strictly sequential document number.
 * Uses MongoDB findOneAndUpdate with $inc and upsert for race-condition-free concurrency.
 *
 * @param {string} documentType - One of DOCUMENT_CONFIG keys or "INVOICE"
 * @param {object} options - Optional overrides: { invoiceType, isNonGst, year, session }
 * @returns {Promise<{ documentNumber: string, documentType: string, year: string|number, seq: number }>}
 */
export const generateDocumentNumber = async (documentType, options = {}) => {
  let targetDocType = documentType;
  if (documentType === "INVOICE") {
    const isNonGst =
      options.invoiceType === "NON_GST" || options.isNonGst === true;
    targetDocType = isNonGst ? "NON_GST_INVOICE" : "GST_INVOICE";
  }

  const config =
    DOCUMENT_CONFIG[targetDocType] || DOCUMENT_CONFIG[documentType];
  if (!config) {
    throw new Error(
      `Unknown document type "${documentType}". Must be one of: ${Object.keys(
        DOCUMENT_CONFIG
      ).join(", ")}`
    );
  }

  const rawYear = options.year || (await getConfiguredYear());
  const parsed = parseYearInput(rawYear);
  const baseYear = parsed.baseYear;
  const docYear = getYearForDocType(targetDocType, parsed);

  const updateQuery = { $inc: { seq: 1 } };
  const findOptions = {
    returnDocument: "after",
    upsert: true,
    setDefaultsOnInsert: true,
  };
  if (options.session) {
    findOptions.session = options.session;
  }

  const counter = await DocumentSequence.findOneAndUpdate(
    { documentType: targetDocType, year: baseYear },
    updateQuery,
    findOptions
  );

  const padding = config.padding || 2;
  const documentNumber = formatDocumentNumber(
    targetDocType,
    docYear,
    counter.seq,
    padding
  );

  return {
    documentNumber,
    documentType: targetDocType,
    year: docYear,
    baseYear,
    seq: counter.seq,
  };
};

/**
 * Non-mutating pure preview for a document type and year.
 * NEVER increments, touches, or reserves sequence numbers.
 *
 * @param {string} documentType
 * @param {string|number} [year]
 * @param {number} [sampleSeq=1]
 * @param {object} [options={}]
 */
export const getDocumentNumberPreview = (
  documentType,
  year,
  sampleSeq = 1,
  options = {}
) => {
  if (typeof year === "object" && year !== null) {
    options = year;
    year = undefined;
    sampleSeq = 1;
  } else if (typeof sampleSeq === "object" && sampleSeq !== null) {
    options = sampleSeq;
    sampleSeq = 1;
  }

  let targetDocType = documentType;
  if (documentType === "INVOICE") {
    const isNonGst =
      options.invoiceType === "NON_GST" || options.isNonGst === true;
    targetDocType = isNonGst ? "NON_GST_INVOICE" : "GST_INVOICE";
  }

  const config =
    DOCUMENT_CONFIG[targetDocType] || DOCUMENT_CONFIG[documentType];
  if (!config) {
    throw new Error(`Unknown document type "${documentType}"`);
  }
  const parsed = parseYearInput(year || new Date().getFullYear());
  const docYear = getYearForDocType(targetDocType, parsed);
  const padding = config.padding || 2;

  return {
    documentType: targetDocType,
    label: config.label,
    prefix: config.prefix,
    previewNumber: formatDocumentNumber(
      targetDocType,
      docYear,
      sampleSeq,
      padding
    ),
    year: docYear,
    baseYear: parsed.baseYear,
  };
};

/**
 * Generates non-mutating previews for all 6 document types.
 *
 * @param {string|number} [year]
 */
export const getAllDocumentPreviews = async (year) => {
  let effectiveYear = year;
  if (!effectiveYear) {
    const settings = await CompanySetting.findOne();
    effectiveYear = settings?.numberingYear || new Date().getFullYear();
  }
  const parsed = parseYearInput(effectiveYear);
  const previews = {};

  const previewKeys = [
    "NON_GST_INVOICE",
    "GST_INVOICE",
    "PC_QUOTATION",
    "ATT_QUOTATION",
    "CONTRACT_RENEWAL",
    "ONE_TIME_JOB",
  ];

  for (const key of previewKeys) {
    const config = DOCUMENT_CONFIG[key];
    const docYear = getYearForDocType(key, parsed);
    const padding = config.padding || 2;
    const sample = formatDocumentNumber(key, docYear, 1, padding);
    previews[key] = {
      type: key,
      label: config.label,
      prefix: config.prefix,
      format: sample,
      sample,
    };
  }

  // Backwards compatibility alias for INVOICE -> NON_GST_INVOICE
  previews.INVOICE = previews.NON_GST_INVOICE;

  return {
    year: parsed.rawInput,
    baseYear: parsed.baseYear,
    financialYear: parsed.financialYear,
    previews,
  };
};

/**
 * Parses existing document numbers to initialize the DocumentSequence collection.
 * Idempotent: Never lowers an existing sequence counter.
 * Handles both 2-digit (01) and legacy 4-digit (0001) formatting.
 */
export const syncExistingDocumentSequences = async (models = {}) => {
  const { Invoice, Quotation, Renewal, Service } = models;
  const results = {};

  const ensureMaxSeq = async (documentType, year, seq) => {
    if (!year || !seq || seq < 1) return;
    const existing = await DocumentSequence.findOne({ documentType, year });
    if (!existing) {
      await DocumentSequence.create({ documentType, year, seq });
      results[`${documentType}_${year}`] = seq;
    } else if (existing.seq < seq) {
      existing.seq = seq;
      await existing.save();
      results[`${documentType}_${year}`] = seq;
    }
  };

  // 1. Invoices (Separate counters for NON_GST_INVOICE and GST_INVOICE)
  if (Invoice) {
    const invoices = await Invoice.find({ isDeleted: { $ne: true } }).select(
      "invoiceNumber invoiceType"
    );
    for (const inv of invoices) {
      if (!inv.invoiceNumber) continue;
      const numStr = String(inv.invoiceNumber).trim();
      const isNonGst =
        inv.invoiceType === "NON_GST" ||
        numStr.toUpperCase().startsWith("SPMJ");
      const targetDocType = isNonGst ? "NON_GST_INVOICE" : "GST_INVOICE";

      // 1.1 Slash-separated parts (SPMJ/01/2026-27, SPMJ/2026-2027/0025, SPMJ/INV/2026-27/01)
      if (numStr.includes("/")) {
        const parts = numStr.split("/").map((p) => p.trim()).filter(Boolean);
        let tokens = parts;
        if (/^(SPMJ|SPM)$/i.test(tokens[0])) {
          tokens = tokens.slice(1);
        }
        if (/^INV$/i.test(tokens[0])) {
          tokens = tokens.slice(1);
        }
        if (tokens.length >= 2) {
          const t0 = tokens[0];
          const t1 = tokens[1];
          const fy0 = t0.match(/^(\d{4})(?:[-/]\d{2,4})?$/);
          const fy1 = t1.match(/^(\d{4})(?:[-/]\d{2,4})?$/);

          // If t0 is sequence and t1 is year/financial year (e.g. 01/2026-27)
          if (fy1 && /^\d+$/.test(t0)) {
            await ensureMaxSeq(targetDocType, Number(fy1[1]), Number(t0));
            continue;
          }
          // If t0 is year/financial year and t1 is sequence (e.g. 2026-2027/0025 or 2026/01)
          if (fy0 && /^\d+$/.test(t1)) {
            await ensureMaxSeq(targetDocType, Number(fy0[1]), Number(t1));
            continue;
          }
        }
      }

      // 1.2 Dash-separated format (e.g. SPM-2026-0001, INV-2026-01)
      const mDashYear = numStr.match(/(?:SPMJ-|SPM-|INV-)?(\d{4})[-/](\d+)/i);
      if (mDashYear) {
        await ensureMaxSeq(
          targetDocType,
          Number(mDashYear[1]),
          Number(mDashYear[2])
        );
        continue;
      }

      // 1.3 Simple sequence (e.g. INV-0001)
      const mDashSimple = numStr.match(/INV-(\d+)/i);
      if (mDashSimple) {
        await ensureMaxSeq(
          targetDocType,
          new Date().getFullYear(),
          Number(mDashSimple[1])
        );
        continue;
      }
    }
  }

  // 2. Quotations (Separate counters for PC_QUOTATION and ATT_QUOTATION)
  if (Quotation) {
    const quotations = await Quotation.find({ isDeleted: { $ne: true } }).select(
      "quotationNumber quotationType"
    );
    for (const q of quotations) {
      if (!q.quotationNumber) continue;
      const qNumStr = String(q.quotationNumber).trim();
      const isAtt =
        q.quotationType === "ATT" || qNumStr.toUpperCase().includes("ATT");
      const docType = isAtt ? "ATT_QUOTATION" : "PC_QUOTATION";

      if (qNumStr.includes("/")) {
        const parts = qNumStr.split("/").map((p) => p.trim()).filter(Boolean);
        const tokens = parts.filter(
          (p) => !/^(SPM|QT|PC|ATT)$/i.test(p)
        );
        if (tokens.length >= 2) {
          const t0 = tokens[0];
          const t1 = tokens[1];
          if (/^\d{4}$/.test(t0) && /^\d+$/.test(t1)) {
            await ensureMaxSeq(docType, Number(t0), Number(t1));
            continue;
          }
          if (/^\d+$/.test(t0) && /^\d{4}$/.test(t1)) {
            await ensureMaxSeq(docType, Number(t1), Number(t0));
            continue;
          }
        }
      }

      const m1 = qNumStr.match(
        /(?:SPM\/(?:QT\/)?(?:PC|ATT)\/|SPM-)(\d{4})[-\/](\d+)/i
      );
      if (m1) {
        await ensureMaxSeq(docType, Number(m1[1]), Number(m1[2]));
        continue;
      }
      const m3 = qNumStr.match(/QTN-(\d+)/i);
      if (m3) {
        await ensureMaxSeq(docType, new Date().getFullYear(), Number(m3[1]));
        continue;
      }
    }
  }

  // 3. Renewals (CONTRACT_RENEWAL)
  if (Renewal) {
    const renewals = await Renewal.find({ isDeleted: { $ne: true } }).select(
      "renewalNumber"
    );
    for (const r of renewals) {
      if (!r.renewalNumber) continue;
      const rNumStr = String(r.renewalNumber).trim();
      const docType = "CONTRACT_RENEWAL";

      if (rNumStr.includes("/")) {
        const parts = rNumStr.split("/").map((p) => p.trim()).filter(Boolean);
        const tokens = parts.filter((p) => !/^(SPM|CR|REN)$/i.test(p));
        if (tokens.length >= 2) {
          const t0 = tokens[0];
          const t1 = tokens[1];
          if (/^\d{4}$/.test(t0) && /^\d+$/.test(t1)) {
            await ensureMaxSeq(docType, Number(t0), Number(t1));
            continue;
          }
          if (/^\d+$/.test(t0) && /^\d{4}$/.test(t1)) {
            await ensureMaxSeq(docType, Number(t1), Number(t0));
            continue;
          }
        }
      }

      const m1 = rNumStr.match(/(?:SPM\/CR\/|CR-|REN-)(\d{4})[-\/](\d+)/i);
      if (m1) {
        await ensureMaxSeq(docType, Number(m1[1]), Number(m1[2]));
        continue;
      }
      const m3 = rNumStr.match(/REN-(\d+)/i);
      if (m3) {
        await ensureMaxSeq(
          docType,
          new Date().getFullYear(),
          Number(m3[1])
        );
        continue;
      }
    }
  }

  // 4. One Time Jobs (ONE_TIME_JOB)
  if (Service) {
    const jobs = await Service.find({
      isDeleted: { $ne: true },
      $or: [
        { jobNo: { $exists: true, $ne: "" } },
        { documentNumber: { $exists: true, $ne: "" } },
      ],
    }).select("jobNo documentNumber frequency");
    for (const j of jobs) {
      if (j.frequency && String(j.frequency).toLowerCase() !== "one-time") {
        continue;
      }
      const jNumStr = String(j.jobNo || j.documentNumber || "").trim();
      if (!jNumStr) continue;

      if (/^[A-Za-z]\/\d+$/.test(jNumStr)) {
        continue;
      }

      const docType = "ONE_TIME_JOB";

      if (jNumStr.includes("/")) {
        const parts = jNumStr.split("/").map((p) => p.trim()).filter(Boolean);
        const tokens = parts.filter(
          (p) => !/^(SPM|OTJ|Job\s*No[\.]*)$/i.test(p)
        );
        if (tokens.length >= 2) {
          const t0 = tokens[0];
          const t1 = tokens[1];
          if (/^\d{4}$/.test(t0) && /^\d+$/.test(t1)) {
            await ensureMaxSeq(docType, Number(t0), Number(t1));
            continue;
          }
          if (/^\d+$/.test(t0) && /^\d{4}$/.test(t1)) {
            await ensureMaxSeq(docType, Number(t1), Number(t0));
            continue;
          }
        }
      }

      const m1 = jNumStr.match(
        /(?:(?:Job\s*No[\.\/:\s\-]*|SPM\/OTJ\/))(\d{4})[\/\-](\d+)/i
      );
      if (m1) {
        await ensureMaxSeq(docType, Number(m1[1]), Number(m1[2]));
        continue;
      }
      const m2 = jNumStr.match(
        /(?:(?:Job\s*No[\.\/:\s\-]*|SPM\/OTJ\/))(\d+)[\/\-](\d{4})/i
      );
      if (m2) {
        await ensureMaxSeq(docType, Number(m2[2]), Number(m2[1]));
        continue;
      }
    }
  }

  return results;
};
