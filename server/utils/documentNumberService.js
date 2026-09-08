import DocumentSequence from "../model/documentSequenceModel.js";
import CompanySetting from "../model/companySettingModel.js";

/**
 * Authoritative mapping of document types to fixed prefixes.
 * These are strictly backend-controlled constants and can NEVER be modified by users.
 */
export const DOCUMENT_CONFIG = Object.freeze({
  INVOICE: {
    type: "INVOICE",
    label: "Invoice",
    prefix: "SPM/INV/",
  },
  PC_QUOTATION: {
    type: "PC_QUOTATION",
    label: "PC Quotation",
    prefix: "SPM/PC/",
  },
  ATT_QUOTATION: {
    type: "ATT_QUOTATION",
    label: "ATT Quotation",
    prefix: "SPM/ATT/",
  },
  CONTRACT_RENEWAL: {
    type: "CONTRACT_RENEWAL",
    label: "Contract Renewal",
    prefix: "SPM/CR/",
  },
  ONE_TIME_JOB: {
    type: "ONE_TIME_JOB",
    label: "One Time Job",
    prefix: "Job No/",
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
 *    financialYear: "2026-2027",
 *    rawInput: "2026" | "2026-2027"
 *  }
 */
export const parseYearInput = (yearInput) => {
  if (!yearInput) {
    const current = new Date().getFullYear();
    return {
      baseYear: current,
      financialYear: `${current}-${current + 1}`,
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
        `Invalid financial year format: "${str}". Example: 2026-2027.`
      );
    }
    return {
      baseYear: startYear,
      financialYear: `${startYear}-${endYear}`,
      rawInput: str,
    };
  }

  // Check 4-digit calendar year: 2026
  const num = Number(str);
  if (Number.isInteger(num) && num >= 2000 && num <= 2099 && str.length === 4) {
    return {
      baseYear: num,
      financialYear: `${num}-${num + 1}`,
      rawInput: str,
    };
  }

  throw new Error(
    `Invalid numbering year: "${yearInput}". Year must be a 4-digit year (e.g. 2026) or financial year (e.g. 2026-2027).`
  );
};

/**
 * Returns the appropriate year string for a given document type.
 * Invoices strictly use the full financial year (e.g. 2026-2027),
 * while quotations, renewals, and one time jobs use the calendar year (e.g. 2026).
 */
export const getYearForDocType = (documentType, parsedYear) => {
  if (documentType === "INVOICE") {
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
 * Formats a sequence number with 4-digit zero-padding.
 * 1 -> 0001, 10 -> 0010, 100 -> 0100, 1000 -> 1000
 */
export const formatSequence = (seq, padding = 4) => {
  return String(seq).padStart(padding, "0");
};

/**
 * Formats the final document number string:
 * {PREFIX}{YEAR}/{DYNAMIC_NUMBER}
 */
export const formatDocumentNumber = (prefix, year, seq, padding = 4) => {
  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return `${normalizedPrefix}${year}/${formatSequence(seq, padding)}`;
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
 * @param {string} documentType - One of DOCUMENT_CONFIG keys
 * @param {object} options - Optional overrides: { year, session }
 * @returns {Promise<{ documentNumber: string, documentType: string, year: string|number, seq: number }>}
 */
export const generateDocumentNumber = async (documentType, options = {}) => {
  const config = DOCUMENT_CONFIG[documentType];
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
  const docYear = getYearForDocType(documentType, parsed);

  const updateQuery = { $inc: { seq: 1 } };
  const findOptions = {
    returnDocument: 'after',
    upsert: true,
    setDefaultsOnInsert: true,
  };
  if (options.session) {
    findOptions.session = options.session;
  }

  const counter = await DocumentSequence.findOneAndUpdate(
    { documentType, year: baseYear },
    updateQuery,
    findOptions
  );

  const documentNumber = formatDocumentNumber(config.prefix, docYear, counter.seq);

  return {
    documentNumber,
    documentType,
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
 */
export const getDocumentNumberPreview = (documentType, year, sampleSeq = 1) => {
  const config = DOCUMENT_CONFIG[documentType];
  if (!config) {
    throw new Error(`Unknown document type "${documentType}"`);
  }
  const parsed = parseYearInput(year || new Date().getFullYear());
  const docYear = getYearForDocType(documentType, parsed);
  return {
    documentType,
    label: config.label,
    prefix: config.prefix,
    previewNumber: formatDocumentNumber(config.prefix, docYear, sampleSeq),
    year: docYear,
    baseYear: parsed.baseYear,
  };
};

/**
 * Generates non-mutating previews for all 5 document types.
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

  for (const [key, config] of Object.entries(DOCUMENT_CONFIG)) {
    const docYear = getYearForDocType(key, parsed);
    previews[key] = {
      type: key,
      label: config.label,
      prefix: config.prefix,
      format: `${config.prefix}${docYear}/0001`,
      sample: formatDocumentNumber(config.prefix, docYear, 1),
    };
  }

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

  // 1. Invoices
  if (Invoice) {
    const invoices = await Invoice.find().select("invoiceNumber");
    for (const inv of invoices) {
      if (!inv.invoiceNumber) continue;
      // Match formats: SPM/INV/YYYY-YYYY/NNNN, SPM/INV/YYYY/NNNN, SPM-YYYY-NNNN, INV-YYYY-NNNN, INV-NNNN
      const m0 = inv.invoiceNumber.match(/SPM\/INV\/(\d{4})[-/](?:\d{2,4})[-\/](\d+)/i);
      if (m0) {
        await ensureMaxSeq("INVOICE", Number(m0[1]), Number(m0[2]));
      } else {
        const m1 = inv.invoiceNumber.match(/(?:SPM\/INV\/|SPM-|INV-)(\d{4})[-\/](\d+)/i);
        if (m1) {
          await ensureMaxSeq("INVOICE", Number(m1[1]), Number(m1[2]));
        } else {
          const m2 = inv.invoiceNumber.match(/INV-(\d+)/i);
          if (m2) {
            await ensureMaxSeq("INVOICE", new Date().getFullYear(), Number(m2[1]));
          }
        }
      }
    }
  }

  // 2. Quotations
  if (Quotation) {
    const quotations = await Quotation.find().select("quotationNumber quotationType");
    for (const q of quotations) {
      if (!q.quotationNumber) continue;
      const isAtt =
        q.quotationType === "ATT" ||
        q.quotationNumber.toUpperCase().includes("ATT");
      const docType = isAtt ? "ATT_QUOTATION" : "PC_QUOTATION";

      // Match SPM/PC/YYYY/NNNN, SPM/ATT/YYYY/NNNN, SPM/QT/PC/YYYY/NNNN, SPM/PC/NNN/YYYY, etc.
      const m1 = q.quotationNumber.match(/(?:SPM\/(?:QT\/)?(?:PC|ATT)\/|SPM-)(\d{4})[-\/](\d+)/i);
      if (m1) {
        await ensureMaxSeq(docType, Number(m1[1]), Number(m1[2]));
      } else {
        const m2 = q.quotationNumber.match(/SPM\/(?:PC|ATT)\/(\d+)\/(\d{4})/i);
        if (m2) {
          await ensureMaxSeq(docType, Number(m2[2]), Number(m2[1]));
        } else {
          const m3 = q.quotationNumber.match(/QTN-(\d+)/i);
          if (m3) {
            await ensureMaxSeq(docType, new Date().getFullYear(), Number(m3[1]));
          }
        }
      }
    }
  }

  // 3. Renewals
  if (Renewal) {
    const renewals = await Renewal.find().select("renewalNumber");
    for (const r of renewals) {
      if (!r.renewalNumber) continue;
      // Match SPM/CR/YYYY/NNNN, CR-YYYY-NNNN, REN-YYYY-NNNN, REN-NNNN
      const m1 = r.renewalNumber.match(/(?:SPM\/CR\/|CR-|REN-)(\d{4})[-\/](\d+)/i);
      if (m1) {
        await ensureMaxSeq("CONTRACT_RENEWAL", Number(m1[1]), Number(m1[2]));
      } else {
        const m2 = r.renewalNumber.match(/REN-(\d+)/i);
        if (m2) {
          await ensureMaxSeq("CONTRACT_RENEWAL", new Date().getFullYear(), Number(m2[1]));
        }
      }
    }
  }

  // 4. One Time Jobs
  if (Service) {
    const jobs = await Service.find({ jobNo: { $exists: true, $ne: "" } }).select("jobNo");
    for (const j of jobs) {
      if (!j.jobNo) continue;
      // Match Job No/YYYY/NNNN, Job No./YYYY/NNNN, SPM/OTJ/YYYY/NNNN
      const m1 = j.jobNo.match(/(?:(?:Job\s*No[\.\/]*|SPM\/OTJ\/))(\d{4})[\/](\d+)/i);
      if (m1) {
        await ensureMaxSeq("ONE_TIME_JOB", Number(m1[1]), Number(m1[2]));
      }
    }
  }

  return results;
};
