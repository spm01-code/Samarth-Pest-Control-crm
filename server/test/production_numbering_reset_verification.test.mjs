import {
  DOCUMENT_CONFIG,
  formatDocumentNumber,
  formatSequence,
  generateDocumentNumber,
  syncExistingDocumentSequences,
} from "../utils/documentNumberService.js";

import DocumentSequence from "../model/documentSequenceModel.js";

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName, details = "") {
  if (condition) {
    passedCount++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    failedCount++;
    console.error(`  ❌ FAIL: ${testName} - ${details}`);
    throw new Error(`Assertion failed: ${testName} (${details})`);
  }
}

async function runTestSuite() {
  console.log("================================================================================");
  console.log("  PRODUCTION NUMBERING INITIALIZATION & 6-SERIES ISOLATION VERIFICATION TEST   ");
  console.log("================================================================================\n");

  const year = 2026;
  const financialYear = "2026-27";

  // In-memory mock store for DocumentSequence
  const seqStore = new Map();

  const originalFindOneAndUpdate = DocumentSequence.findOneAndUpdate;
  const originalFindOne = DocumentSequence.findOne;
  const originalCreate = DocumentSequence.create;

  DocumentSequence.findOneAndUpdate = async (filter, update, options) => {
    const key = `${filter.documentType}_${filter.year}`;
    let doc = seqStore.get(key);
    if (!doc) {
      doc = {
        _id: `mock_${key}`,
        documentType: filter.documentType,
        year: filter.year,
        seq: 0,
      };
      seqStore.set(key, doc);
    }
    if (update.$inc && update.$inc.seq) {
      doc.seq += update.$inc.seq;
    }
    return { ...doc };
  };

  DocumentSequence.findOne = async (filter) => {
    const key = `${filter.documentType}_${filter.year}`;
    const doc = seqStore.get(key);
    if (!doc) return null;
    return {
      ...doc,
      save: async function () {
        seqStore.set(key, { ...this });
      },
    };
  };

  DocumentSequence.create = async (payload) => {
    const key = `${payload.documentType}_${payload.year}`;
    const doc = {
      _id: `mock_${key}`,
      ...payload,
      save: async function () {
        seqStore.set(key, { ...this });
      },
    };
    seqStore.set(key, doc);
    return doc;
  };

  try {
    // --------------------------------------------------------------------------
    // PART 1: VERIFY INITIAL STATE AT 0 PRODUCES 01 FOR ALL 6 SERIES
    // --------------------------------------------------------------------------
    console.log("--- PART 1: First Generated Number Verification (0 -> 01) ---");

    // Initialize all 6 series to 0
    const seriesList = [
      { docType: "GST_INVOICE", category: "INVOICE", opt: { invoiceType: "GST" }, expected1: "SPM/01/2026-27", expected2: "SPM/02/2026-27" },
      { docType: "NON_GST_INVOICE", category: "INVOICE", opt: { invoiceType: "NON_GST" }, expected1: "SPMJ/01/2026-27", expected2: "SPMJ/02/2026-27" },
      { docType: "PC_QUOTATION", category: "PC_QUOTATION", opt: {}, expected1: "SPM/PC/2026/01", expected2: "SPM/PC/2026/02" },
      { docType: "ATT_QUOTATION", category: "ATT_QUOTATION", opt: {}, expected1: "SPM/ATT/2026/01", expected2: "SPM/ATT/2026/02" },
      { docType: "CONTRACT_RENEWAL", category: "CONTRACT_RENEWAL", opt: {}, expected1: "SPM/CR/2026/01", expected2: "SPM/CR/2026/02" },
      { docType: "ONE_TIME_JOB", category: "ONE_TIME_JOB", opt: {}, expected1: "Job No/2026/01", expected2: "Job No/2026/02" },
    ];

    for (const s of seriesList) {
      seqStore.set(`${s.docType}_${year}`, { documentType: s.docType, year, seq: 0 });
    }

    // Generate #01 for all series
    for (const s of seriesList) {
      const res = await generateDocumentNumber(s.category, { ...s.opt, year });
      assert(
        res.documentNumber === s.expected1,
        `${s.docType} first document is '${s.expected1}'`,
        `Got: ${res.documentNumber}`
      );
      assert(res.seq === 1, `${s.docType} seq is 1`);
    }

    // Generate #02 for all series
    console.log("\n--- PART 2: Second Generated Number Verification (1 -> 02) ---");
    for (const s of seriesList) {
      const res = await generateDocumentNumber(s.category, { ...s.opt, year });
      assert(
        res.documentNumber === s.expected2,
        `${s.docType} second document is '${s.expected2}'`,
        `Got: ${res.documentNumber}`
      );
      assert(res.seq === 2, `${s.docType} seq is 2`);
    }

    // --------------------------------------------------------------------------
    // PART 3: STRICT INDEPENDENCE OF ALL 6 COUNTERS
    // --------------------------------------------------------------------------
    console.log("\n--- PART 3: Counter Isolation & Independence ---");
    // Increment GST_INVOICE 5 times
    for (let i = 0; i < 5; i++) {
      await generateDocumentNumber("INVOICE", { invoiceType: "GST", year });
    }
    const gstDoc = seqStore.get(`GST_INVOICE_${year}`);
    assert(gstDoc.seq === 7, "GST_INVOICE advanced to 7");

    // Verify all other 5 series remained strictly at 2
    for (const s of seriesList) {
      if (s.docType === "GST_INVOICE") continue;
      const doc = seqStore.get(`${s.docType}_${year}`);
      assert(doc.seq === 2, `${s.docType} counter remained strictly isolated at 2`);
    }

    // --------------------------------------------------------------------------
    // PART 4: CONCURRENT GENERATION SIMULATION (NO DUPLICATES)
    // --------------------------------------------------------------------------
    console.log("\n--- PART 4: Concurrency Simulation (50 Parallel Requests) ---");
    const concurrentRequests = 50;
    const promises = Array.from({ length: concurrentRequests }, () =>
      generateDocumentNumber("PC_QUOTATION", { year })
    );
    const results = await Promise.all(promises);
    const generatedNumbers = results.map((r) => r.documentNumber);
    const uniqueNumbers = new Set(generatedNumbers);

    assert(
      uniqueNumbers.size === concurrentRequests,
      `All ${concurrentRequests} concurrent requests generated unique document numbers`,
      `Unique count: ${uniqueNumbers.size}`
    );
    assert(
      seqStore.get(`PC_QUOTATION_${year}`).seq === 52, // 2 initial + 50 concurrent
      "PC_QUOTATION counter accurately reflects total increments (52)"
    );

    // --------------------------------------------------------------------------
    // PART 5: STARTUP RECONCILIATION & SOFT-DELETE IGNORING
    // --------------------------------------------------------------------------
    console.log("\n--- PART 5: Startup Reconciliation & Soft-Delete Protection ---");

    // Test A: Empty collections do not bump initialized 0 counters
    seqStore.set(`ATT_QUOTATION_${year}`, { documentType: "ATT_QUOTATION", year, seq: 0 });
    const mockEmptyModel = { find: () => ({ select: () => [] }) };

    await syncExistingDocumentSequences({
      Invoice: mockEmptyModel,
      Quotation: mockEmptyModel,
      Renewal: mockEmptyModel,
      Service: mockEmptyModel,
    });

    const postSyncAtt = seqStore.get(`ATT_QUOTATION_${year}`);
    assert(
      postSyncAtt.seq === 0,
      "Empty collections leave initialized 0 counter strictly at 0 after startup sync"
    );

    // Test B: Soft-deleted invoices are filtered out and do NOT inflate counters
    seqStore.set(`GST_INVOICE_${year}`, { documentType: "GST_INVOICE", year, seq: 0 });

    // Simulate database with 1 soft-deleted invoice #18 and 1 active invoice #01
    const mockInvoiceModel = {
      find: (filter) => {
        const docs = [
          { invoiceNumber: "SPM/01/2026-27", invoiceType: "GST", isDeleted: false },
          { invoiceNumber: "SPM/18/2026-27", invoiceType: "GST", isDeleted: true },
        ];
        const filtered = filter?.isDeleted?.$ne === true
          ? docs.filter((d) => !d.isDeleted)
          : docs;
        return { select: () => filtered };
      },
    };

    await syncExistingDocumentSequences({ Invoice: mockInvoiceModel });

    const postSyncGst = seqStore.get(`GST_INVOICE_${year}`);
    assert(
      postSyncGst.seq === 1,
      `Reconciled to active invoice #01 (seq: 1) and correctly ignored soft-deleted invoice #18 (seq: ${postSyncGst.seq})`
    );

    // --------------------------------------------------------------------------
    // PART 6: ONE-TIME JOB FORMATTING AND ALIAS CHECK
    // --------------------------------------------------------------------------
    console.log("\n--- PART 6: One-Time Job Numbering Format ---");
    assert(
      formatDocumentNumber("ONE_TIME_JOB", 2026, 1) === "Job No/2026/01",
      "One-Time Job #1 formats to 'Job No/2026/01'"
    );
    assert(
      formatDocumentNumber("ONE_TIME_JOB", 2026, 2) === "Job No/2026/02",
      "One-Time Job #2 formats to 'Job No/2026/02'"
    );
    assert(
      formatDocumentNumber("ONE_TIME_JOB", 2026, 99) === "Job No/2026/99",
      "One-Time Job #99 formats to 'Job No/2026/99'"
    );
    assert(
      formatDocumentNumber("ONE_TIME_JOB", 2026, 100) === "Job No/2026/100",
      "One-Time Job #100 formats to 'Job No/2026/100'"
    );

  } finally {
    DocumentSequence.findOneAndUpdate = originalFindOneAndUpdate;
    DocumentSequence.findOne = originalFindOne;
    DocumentSequence.create = originalCreate;
  }

  console.log("\n================================================================================");
  console.log(`  TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED                          `);
  console.log("================================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
