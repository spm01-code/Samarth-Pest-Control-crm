import {
  DOCUMENT_CONFIG,
  parseYearInput,
  getYearForDocType,
  validateYear,
  formatSequence,
  formatDocumentNumber,
  generateDocumentNumber,
  getDocumentNumberPreview,
  getAllDocumentPreviews,
  syncExistingDocumentSequences,
} from "../utils/documentNumberService.js";
import DocumentSequence from "../model/documentSequenceModel.js";

let passedCount = 0;
let failedCount = 0;
const resultsLog = [];

function assert(condition, testName, details = "") {
  if (condition) {
    passedCount++;
    console.log(`  ✅ PASS: ${testName}`);
    resultsLog.push({ testName, status: "PASS", details });
  } else {
    failedCount++;
    console.error(`  ❌ FAIL: ${testName} - ${details}`);
    resultsLog.push({ testName, status: "FAIL", details });
    throw new Error(`Assertion failed: ${testName} (${details})`);
  }
}

async function runTestSuite() {
  console.log("================================================================================");
  console.log("  SAMARTH CRM DOCUMENT NUMBERING SYSTEM - COMPREHENSIVE END-TO-END VERIFICATION  ");
  console.log("================================================================================\n");

  // --------------------------------------------------------------------------
  // SUITE 1: SEQUENTIAL NUMBER FORMATTING (MINIMUM 2 DIGITS, NO 0001 PADDING)
  // --------------------------------------------------------------------------
  console.log("--- SUITE 1: Sequential Number Formatting ---");
  assert(formatSequence(1) === "01", "Seq 1 formats to '01'");
  assert(formatSequence(2) === "02", "Seq 2 formats to '02'");
  assert(formatSequence(3) === "03", "Seq 3 formats to '03'");
  assert(formatSequence(4) === "04", "Seq 4 formats to '04'");
  assert(formatSequence(5) === "05", "Seq 5 formats to '05'");
  assert(formatSequence(9) === "09", "Seq 9 formats to '09'");
  assert(formatSequence(10) === "10", "Seq 10 formats to '10'");
  assert(formatSequence(11) === "11", "Seq 11 formats to '11'");
  assert(formatSequence(12) === "12", "Seq 12 formats to '12'");
  assert(formatSequence(99) === "99", "Seq 99 formats to '99'");
  assert(formatSequence(100) === "100", "Seq 100 naturally expands to '100'");
  assert(formatSequence(101) === "101", "Seq 101 naturally expands to '101'");
  assert(formatSequence(1000) === "1000", "Seq 1000 naturally expands to '1000'");

  // --------------------------------------------------------------------------
  // SUITE 2: FINANCIAL YEAR FORMATTING (YYYY-YY e.g. 2026-27)
  // --------------------------------------------------------------------------
  console.log("\n--- SUITE 2: Financial Year Calculation & Parsing ---");
  const parsedFromCalendarYear = parseYearInput(2026);
  assert(parsedFromCalendarYear.baseYear === 2026, "Calendar year 2026 gives baseYear 2026");
  assert(parsedFromCalendarYear.financialYear === "2026-27", "Calendar year 2026 gives financialYear '2026-27'");

  const parsedFromFyFull = parseYearInput("2026-2027");
  assert(parsedFromFyFull.baseYear === 2026, "'2026-2027' gives baseYear 2026");
  assert(parsedFromFyFull.financialYear === "2026-27", "'2026-2027' gives financialYear '2026-27'");

  const parsedFromFyShort = parseYearInput("2026-27");
  assert(parsedFromFyShort.baseYear === 2026, "'2026-27' gives baseYear 2026");
  assert(parsedFromFyShort.financialYear === "2026-27", "'2026-27' gives financialYear '2026-27'");

  const parsedDefault = parseYearInput();
  assert(Boolean(parsedDefault.financialYear), "Default year gives valid financial year");
  assert(/^\d{4}-\d{2}$/.test(parsedDefault.financialYear), "Default financial year matches YYYY-YY format", parsedDefault.financialYear);

  // --------------------------------------------------------------------------
  // SUITE 3: DOCUMENT NUMBER FORMATTING FOR ALL 6 DOCUMENT TYPES
  // --------------------------------------------------------------------------
  console.log("\n--- SUITE 3: Final Document Number Formatting Across All 6 Types ---");

  // A. Non-GST Invoice: SPMJ/01/2026-27
  assert(
    formatDocumentNumber("NON_GST_INVOICE", "2026-27", 1) === "SPMJ/01/2026-27",
    "Non-GST Invoice #1: SPMJ/01/2026-27"
  );
  assert(
    formatDocumentNumber("NON_GST_INVOICE", "2026-27", 2) === "SPMJ/02/2026-27",
    "Non-GST Invoice #2: SPMJ/02/2026-27"
  );
  assert(
    formatDocumentNumber("NON_GST_INVOICE", "2026-27", 3) === "SPMJ/03/2026-27",
    "Non-GST Invoice #3: SPMJ/03/2026-27"
  );
  assert(
    formatDocumentNumber("NON_GST_INVOICE", "2026-27", 99) === "SPMJ/99/2026-27",
    "Non-GST Invoice #99: SPMJ/99/2026-27"
  );
  assert(
    formatDocumentNumber("NON_GST_INVOICE", "2026-27", 100) === "SPMJ/100/2026-27",
    "Non-GST Invoice #100: SPMJ/100/2026-27"
  );

  // B. GST (Tax) Invoice: SPM/01/2026-27
  assert(
    formatDocumentNumber("GST_INVOICE", "2026-27", 1) === "SPM/01/2026-27",
    "GST Invoice #1: SPM/01/2026-27"
  );
  assert(
    formatDocumentNumber("GST_INVOICE", "2026-27", 2) === "SPM/02/2026-27",
    "GST Invoice #2: SPM/02/2026-27"
  );
  assert(
    formatDocumentNumber("GST_INVOICE", "2026-27", 3) === "SPM/03/2026-27",
    "GST Invoice #3: SPM/03/2026-27"
  );
  assert(
    formatDocumentNumber("GST_INVOICE", "2026-27", 100) === "SPM/100/2026-27",
    "GST Invoice #100: SPM/100/2026-27"
  );

  // C. PC Quotation: SPM/PC/2026/01
  assert(
    formatDocumentNumber("PC_QUOTATION", 2026, 1) === "SPM/PC/2026/01",
    "PC Quotation #1: SPM/PC/2026/01"
  );
  assert(
    formatDocumentNumber("PC_QUOTATION", 2026, 2) === "SPM/PC/2026/02",
    "PC Quotation #2: SPM/PC/2026/02"
  );
  assert(
    formatDocumentNumber("PC_QUOTATION", 2026, 3) === "SPM/PC/2026/03",
    "PC Quotation #3: SPM/PC/2026/03"
  );
  assert(
    formatDocumentNumber("PC_QUOTATION", 2026, 100) === "SPM/PC/2026/100",
    "PC Quotation #100: SPM/PC/2026/100"
  );

  // D. ATT Quotation: SPM/ATT/2026/01
  assert(
    formatDocumentNumber("ATT_QUOTATION", 2026, 1) === "SPM/ATT/2026/01",
    "ATT Quotation #1: SPM/ATT/2026/01"
  );
  assert(
    formatDocumentNumber("ATT_QUOTATION", 2026, 2) === "SPM/ATT/2026/02",
    "ATT Quotation #2: SPM/ATT/2026/02"
  );
  assert(
    formatDocumentNumber("ATT_QUOTATION", 2026, 3) === "SPM/ATT/2026/03",
    "ATT Quotation #3: SPM/ATT/2026/03"
  );
  assert(
    formatDocumentNumber("ATT_QUOTATION", 2026, 100) === "SPM/ATT/2026/100",
    "ATT Quotation #100: SPM/ATT/2026/100"
  );

  // E. Contract Renewal: SPM/CR/2026/01
  assert(
    formatDocumentNumber("CONTRACT_RENEWAL", 2026, 1) === "SPM/CR/2026/01",
    "Contract Renewal #1: SPM/CR/2026/01"
  );
  assert(
    formatDocumentNumber("CONTRACT_RENEWAL", 2026, 2) === "SPM/CR/2026/02",
    "Contract Renewal #2: SPM/CR/2026/02"
  );
  assert(
    formatDocumentNumber("CONTRACT_RENEWAL", 2026, 3) === "SPM/CR/2026/03",
    "Contract Renewal #3: SPM/CR/2026/03"
  );
  assert(
    formatDocumentNumber("CONTRACT_RENEWAL", 2026, 100) === "SPM/CR/2026/100",
    "Contract Renewal #100: SPM/CR/2026/100"
  );

  // F. One-Time Job: Job No/2026/01
  assert(
    formatDocumentNumber("ONE_TIME_JOB", 2026, 1) === "Job No/2026/01",
    "One-Time Job #1: Job No/2026/01"
  );
  assert(
    formatDocumentNumber("ONE_TIME_JOB", 2026, 2) === "Job No/2026/02",
    "One-Time Job #2: Job No/2026/02"
  );
  assert(
    formatDocumentNumber("ONE_TIME_JOB", 2026, 3) === "Job No/2026/03",
    "One-Time Job #3: Job No/2026/03"
  );
  assert(
    formatDocumentNumber("ONE_TIME_JOB", 2026, 100) === "Job No/2026/100",
    "One-Time Job #100: Job No/2026/100"
  );

  // --------------------------------------------------------------------------
  // SUITE 4: SETTINGS PAGE LIVE DOCUMENT PREVIEWS
  // --------------------------------------------------------------------------
  console.log("\n--- SUITE 4: Settings Page Live Document Previews ---");
  const allPreviews = await getAllDocumentPreviews(2026);
  assert(allPreviews.previews.NON_GST_INVOICE.sample === "SPMJ/01/2026-27", "Non-GST Invoice Preview matches SPMJ/01/2026-27");
  assert(allPreviews.previews.GST_INVOICE.sample === "SPM/01/2026-27", "GST Invoice Preview matches SPM/01/2026-27");
  assert(allPreviews.previews.PC_QUOTATION.sample === "SPM/PC/2026/01", "PC Quotation Preview matches SPM/PC/2026/01");
  assert(allPreviews.previews.ATT_QUOTATION.sample === "SPM/ATT/2026/01", "ATT Quotation Preview matches SPM/ATT/2026/01");
  assert(allPreviews.previews.CONTRACT_RENEWAL.sample === "SPM/CR/2026/01", "Contract Renewal Preview matches SPM/CR/2026/01");
  assert(allPreviews.previews.ONE_TIME_JOB.sample === "Job No/2026/01", "One Time Job Preview matches Job No/2026/01");

  // --------------------------------------------------------------------------
  // SUITE 5: IN-MEMORY ATOMIC SEQUENCE GENERATION & INDEPENDENCE
  // --------------------------------------------------------------------------
  console.log("\n--- SUITE 5: Atomic Sequence Allocation & Independence ---");
  // Set up in-memory sequence storage simulator to test concurrency and counter independence
  const inMemorySequences = new Map();

  const originalFindOneAndUpdate = DocumentSequence.findOneAndUpdate;
  DocumentSequence.findOneAndUpdate = async (filter, update, options) => {
    const key = `${filter.documentType}_${filter.year}`;
    let current = inMemorySequences.get(key) || {
      documentType: filter.documentType,
      year: filter.year,
      seq: 0,
    };
    if (update.$inc && update.$inc.seq) {
      current.seq += update.$inc.seq;
    }
    inMemorySequences.set(key, current);
    return { ...current };
  };

  try {
    // 1. Two independent invoice series:
    const nonGst1 = await generateDocumentNumber("INVOICE", { invoiceType: "NON_GST", year: 2026 });
    const nonGst2 = await generateDocumentNumber("INVOICE", { invoiceType: "NON_GST", year: 2026 });
    const gst1 = await generateDocumentNumber("INVOICE", { invoiceType: "GST", year: 2026 });
    const nonGst3 = await generateDocumentNumber("NON_GST_INVOICE", { year: 2026 });
    const gst2 = await generateDocumentNumber("GST_INVOICE", { year: 2026 });

    assert(nonGst1.documentNumber === "SPMJ/01/2026-27", "First Non-GST invoice is SPMJ/01/2026-27");
    assert(nonGst2.documentNumber === "SPMJ/02/2026-27", "Second Non-GST invoice is SPMJ/02/2026-27");
    assert(gst1.documentNumber === "SPM/01/2026-27", "First GST invoice is SPM/01/2026-27 (Independent counter)");
    assert(nonGst3.documentNumber === "SPMJ/03/2026-27", "Third Non-GST invoice is SPMJ/03/2026-27");
    assert(gst2.documentNumber === "SPM/02/2026-27", "Second GST invoice is SPM/02/2026-27");

    assert(nonGst3.seq === 3, "Non-GST sequence reached 3");
    assert(gst2.seq === 2, "GST sequence reached 2 (GST was not affected by Non-GST)");

    // 2. PC and ATT Quotation independence:
    const pc1 = await generateDocumentNumber("PC_QUOTATION", { year: 2026 });
    const pc2 = await generateDocumentNumber("PC_QUOTATION", { year: 2026 });
    const att1 = await generateDocumentNumber("ATT_QUOTATION", { year: 2026 });

    assert(pc1.documentNumber === "SPM/PC/2026/01", "PC Quotation 1 is SPM/PC/2026/01");
    assert(pc2.documentNumber === "SPM/PC/2026/02", "PC Quotation 2 is SPM/PC/2026/02");
    assert(att1.documentNumber === "SPM/ATT/2026/01", "ATT Quotation 1 is SPM/ATT/2026/01 (Independent counter)");

    // 3. Contract Renewal & One Time Job independence:
    const cr1 = await generateDocumentNumber("CONTRACT_RENEWAL", { year: 2026 });
    const otj1 = await generateDocumentNumber("ONE_TIME_JOB", { year: 2026 });

    assert(cr1.documentNumber === "SPM/CR/2026/01", "Contract Renewal 1 is SPM/CR/2026/01");
    assert(otj1.documentNumber === "Job No/2026/01", "One-Time Job 1 is Job No/2026/01");

    // --------------------------------------------------------------------------
    // SUITE 6: CONCURRENCY SIMULATION (NO DUPLICATES UNDER HIGH LOAD)
    // --------------------------------------------------------------------------
    console.log("\n--- SUITE 6: Concurrency Simulation (Parallel Requests) ---");
    const concurrentCount = 50;
    const promises = [];
    for (let i = 0; i < concurrentCount; i++) {
      promises.push(generateDocumentNumber("NON_GST_INVOICE", { year: 2026 }));
    }
    const results = await Promise.all(promises);
    const assignedNumbers = results.map((r) => r.documentNumber);
    const uniqueAssigned = new Set(assignedNumbers);

    assert(
      uniqueAssigned.size === concurrentCount,
      `All ${concurrentCount} concurrent Non-GST invoice numbers are distinct`,
      `Expected ${concurrentCount}, got ${uniqueAssigned.size}`
    );
    assert(
      assignedNumbers[assignedNumbers.length - 1] === `SPMJ/${53}/2026-27`,
      `Sequential sequence reached SPMJ/53/2026-27 cleanly`
    );

    // --------------------------------------------------------------------------
    // SUITE 7: HISTORICAL RECORDS MIGRATION & RECONCILIATION IDEMPOTENCY
    // --------------------------------------------------------------------------
    console.log("\n--- SUITE 7: Historical Migration & Counter Preservation ---");
    // Mock existing document records containing a mix of old 4-digit and new 2-digit numbers
    const mockInvoices = [
      { invoiceNumber: "SPMJ/2026-2027/0001", invoiceType: "NON_GST" },
      { invoiceNumber: "SPMJ/2026-2027/0025", invoiceType: "NON_GST" },
      { invoiceNumber: "SPM/2026-2027/0010", invoiceType: "GST" },
      { invoiceNumber: "SPMJ/01/2026-27", invoiceType: "NON_GST" },
    ];
    const mockQuotations = [
      { quotationNumber: "SPM/PC/2026/0008", quotationType: "PC" },
      { quotationNumber: "SPM/ATT/2026/0005", quotationType: "ATT" },
    ];
    const mockRenewals = [
      { renewalNumber: "SPM/CR/2026/0012" },
    ];
    const mockServices = [
      { jobNo: "Job No/2026/0015", frequency: "one-time" },
    ];

    const mockSeqDb = new Map();
    const MockDocumentSequence = {
      findOne: async ({ documentType, year }) => {
        const item = mockSeqDb.get(`${documentType}_${year}`);
        return item ? { ...item, save: async function() { mockSeqDb.set(`${documentType}_${year}`, this); } } : null;
      },
      create: async ({ documentType, year, seq }) => {
        const doc = { documentType, year, seq, save: async function() { mockSeqDb.set(`${documentType}_${year}`, this); } };
        mockSeqDb.set(`${documentType}_${year}`, doc);
        return doc;
      },
      findOneAndUpdate: DocumentSequence.findOneAndUpdate,
    };

    // Temporarily replace DocumentSequence.findOne / create for syncExistingDocumentSequences
    const origFindOne = DocumentSequence.findOne;
    const origCreate = DocumentSequence.create;
    DocumentSequence.findOne = MockDocumentSequence.findOne;
    DocumentSequence.create = MockDocumentSequence.create;

    const syncResult = await syncExistingDocumentSequences({
      Invoice: { find: () => ({ select: () => mockInvoices }) },
      Quotation: { find: () => ({ select: () => mockQuotations }) },
      Renewal: { find: () => ({ select: () => mockRenewals }) },
      Service: { find: () => ({ select: () => mockServices }) },
    });

    assert(mockSeqDb.get("NON_GST_INVOICE_2026")?.seq === 25, "Non-GST invoice max counter detected as 25 from historical records");
    assert(mockSeqDb.get("GST_INVOICE_2026")?.seq === 10, "GST invoice max counter detected as 10 from historical records");
    assert(mockSeqDb.get("PC_QUOTATION_2026")?.seq === 8, "PC quotation max counter detected as 8 from historical records");
    assert(mockSeqDb.get("ATT_QUOTATION_2026")?.seq === 5, "ATT quotation max counter detected as 5 from historical records");
    assert(mockSeqDb.get("CONTRACT_RENEWAL_2026")?.seq === 12, "Contract renewal max counter detected as 12 from historical records");
    assert(mockSeqDb.get("ONE_TIME_JOB_2026")?.seq === 15, "One-Time Job max counter detected as 15 from historical records");

    // Next document generation after migration:
    DocumentSequence.findOneAndUpdate = async (filter, update) => {
      const key = `${filter.documentType}_${filter.year}`;
      const existing = mockSeqDb.get(key);
      const newSeq = (existing ? existing.seq : 0) + (update.$inc?.seq || 1);
      const updated = { documentType: filter.documentType, year: filter.year, seq: newSeq };
      mockSeqDb.set(key, updated);
      return updated;
    };

    const nextNonGst = await generateDocumentNumber("NON_GST_INVOICE", { year: 2026 });
    assert(nextNonGst.documentNumber === "SPMJ/26/2026-27", "Next Non-GST number after 25 is SPMJ/26/2026-27 (No duplicates, no reset)");

    const nextGst = await generateDocumentNumber("GST_INVOICE", { year: 2026 });
    assert(nextGst.documentNumber === "SPM/11/2026-27", "Next GST number after 10 is SPM/11/2026-27");

    const nextPc = await generateDocumentNumber("PC_QUOTATION", { year: 2026 });
    assert(nextPc.documentNumber === "SPM/PC/2026/09", "Next PC quotation after 8 is SPM/PC/2026/09");

    const nextOtj = await generateDocumentNumber("ONE_TIME_JOB", { year: 2026 });
    assert(nextOtj.documentNumber === "Job No/2026/16", "Next One-Time Job after 15 is Job No/2026/16");

    // Test Idempotency: Running sync again does not alter or lower higher sequences
    await syncExistingDocumentSequences({
      Invoice: { find: () => ({ select: () => mockInvoices }) },
      Quotation: { find: () => ({ select: () => mockQuotations }) },
      Renewal: { find: () => ({ select: () => mockRenewals }) },
      Service: { find: () => ({ select: () => mockServices }) },
    });
    assert(mockSeqDb.get("NON_GST_INVOICE_2026")?.seq === 26, "Sync idempotency preserved: Non-GST sequence remains 26");

    // Restore original methods
    DocumentSequence.findOne = origFindOne;
    DocumentSequence.create = origCreate;
  } finally {
    DocumentSequence.findOneAndUpdate = originalFindOneAndUpdate;
  }

  console.log("\n================================================================================");
  console.log(`  VERIFICATION RESULTS: ${passedCount} PASSED, ${failedCount} FAILED           `);
  console.log("================================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
