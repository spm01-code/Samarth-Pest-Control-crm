import {
  generateInvoiceDocx,
  generateQuotationDocx,
  generateContractRenewalDocx,
  generateOneTimeJobDocx,
} from "../utils/docGenerator.js";
import { generatePdfFromPdfTemplate } from "../utils/pdfTemplateGenerator.js";
import { updateInvoice } from "../controller/invoiceController.js";
import Invoice from "../model/invoiceModel.js";
import Quotation from "../model/quotationModel.js";
import Renewal from "../model/renewalModel.js";
import Service from "../model/serviceModel.js";

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

async function runDocxPdfAndEditTests() {
  console.log("================================================================================");
  console.log("  DOCUMENT GENERATION & EDIT NUMBERING INTEGRITY TEST SUITE                     ");
  console.log("================================================================================\n");

  // --------------------------------------------------------------------------
  // TEST 1: DOCX GENERATION INTEGRITY ACROSS ALL TYPES
  // --------------------------------------------------------------------------
  console.log("--- TEST 1: DOCX Generation with Standardized Document Numbers ---");

  // 1. Non-GST Invoice DOCX
  const nonGstInvDoc = {
    invoiceNumber: "SPMJ/01/2026-27",
    invoiceDate: new Date(),
    customer: { fullName: "Acme Logistics", phone: "9876543210" },
    customerSnapshot: { fullName: "Acme Logistics", address: "Plot 10, MIDC" },
    services: [],
    customServices: [{ serviceName: "General Disinfestation", amount: 2500 }],
    subtotal: 2500,
    totalTax: 0,
    totalAmount: 2500,
    amountInWords: "Rupees Two Thousand Five Hundred Only",
  };
  const nonGstDocx = await generateInvoiceDocx(nonGstInvDoc);
  assert(Boolean(nonGstDocx?.buffer), "Non-GST Invoice DOCX generated successfully with SPMJ/01/2026-27");

  // 2. GST Invoice DOCX
  const gstInvDoc = {
    invoiceNumber: "SPM/01/2026-27",
    invoiceDate: new Date(),
    customer: { fullName: "Apex Towers Ltd", phone: "9876543211", gstNumber: "27AAAAA0000A1Z5" },
    customerSnapshot: { fullName: "Apex Towers Ltd", address: "Andheri East" },
    services: [],
    customServices: [{ serviceName: "Termite Control", amount: 10000 }],
    subtotal: 10000,
    tax: { cgstAmount: 900, sgstAmount: 900, igstAmount: 0 },
    totalTax: 1800,
    totalAmount: 11800,
    amountInWords: "Rupees Eleven Thousand Eight Hundred Only",
  };
  const gstDocx = await generateInvoiceDocx(gstInvDoc);
  assert(Boolean(gstDocx?.buffer), "GST Invoice DOCX generated successfully with SPM/01/2026-27");

  // 3. PC Quotation DOCX
  const pcQtnDoc = {
    quotationNumber: "SPM/PC/2026/01",
    quotationType: "PC",
    quotationDate: new Date(),
    customer: { fullName: "Green Villa Society" },
    customerSnapshot: { customerName: "Green Villa Society", address: "Kothrud, Pune" },
    premises: "Residential Society",
    services: [{ serviceName: "Cockroach Control", frequency: "Quarterly", cost: 12000 }],
    totalAmount: 12000,
  };
  const pcDocx = await generateQuotationDocx(pcQtnDoc);
  assert(Boolean(pcDocx?.buffer), "PC Quotation DOCX generated successfully with SPM/PC/2026/01");

  // 4. ATT Quotation DOCX
  const attQtnDoc = {
    quotationNumber: "SPM/ATT/2026/01",
    quotationType: "ATT",
    quotationDate: new Date(),
    customer: { fullName: "Metro Builders" },
    customerSnapshot: { customerName: "Metro Builders", address: "Viman Nagar, Pune" },
    premises: "Commercial Construction Site",
    treatmentType: "Anti-Termite Treatment",
    plinthArea: "10000 sq ft",
    ratePerSqFt: 18,
    totalAmount: 180000,
  };
  const attDocx = await generateQuotationDocx(attQtnDoc);
  assert(Boolean(attDocx?.buffer), "ATT Quotation DOCX generated successfully with SPM/ATT/2026/01");

  // 5. Contract Renewal DOCX
  const crDoc = {
    renewalNumber: "SPM/CR/2026/01",
    renewalDate: new Date(),
    customer: { fullName: "Sterling Enterprises" },
    customerSnapshot: { fullName: "Sterling Enterprises", address: "Camp, Pune" },
    services: [{ serviceName: "Annual AMC", frequency: "Monthly", amount: 36000 }],
    totalAmount: 36000,
  };
  const crDocx = await generateContractRenewalDocx(crDoc);
  assert(Boolean(crDocx?.buffer), "Contract Renewal DOCX generated successfully with SPM/CR/2026/01");

  // 6. One-Time Job DOCX
  const otjDoc = {
    jobNo: "Job No/2026/01",
    documentNumber: "Job No/2026/01",
    frequency: "one-time",
    serviceDate: new Date(),
    customerName: "Individual Homeowner Mr. Kulkarni",
    address: "Baner, Pune",
    serviceName: "One Time Fogging",
    amount: 1500,
    totalAmount: 1500,
    paidAmount: 1500,
    balanceAmount: 0,
  };
  const otjDocx = await generateOneTimeJobDocx(otjDoc);
  assert(Boolean(otjDocx?.buffer), "One-Time Job DOCX generated successfully with Job No/2026/01");

  // --------------------------------------------------------------------------
  // TEST 2: EDIT INVOICE & DOCUMENT NUMBER PRESERVATION
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 2: Edit Workflows (Never reassign or overwrite document numbers) ---");

  // Verify Invoice model schema guarantees
  const invPaths = Invoice.schema.paths;
  assert(invPaths.invoiceNumber.options.unique === true, "Invoice model enforces database-level uniqueness on invoiceNumber");
  assert(invPaths.invoiceNumber.options.required === true, "Invoice model enforces required constraint on invoiceNumber");

  // Verify Quotation model schema guarantees
  const qtnPaths = Quotation.schema.paths;
  assert(qtnPaths.quotationNumber.options.unique === true, "Quotation model enforces database-level uniqueness on quotationNumber");

  // Verify Renewal model schema guarantees
  const renPaths = Renewal.schema.paths;
  assert(renPaths.renewalNumber.options.unique === true, "Renewal model enforces database-level uniqueness on renewalNumber");

  // Verify Service model schema guarantees
  const srvIndexes = Service.schema.indexes();
  const hasDocNumUnique = srvIndexes.some((idx) => idx[0]?.documentNumber === 1 && idx[1]?.unique === true);
  assert(hasDocNumUnique, "Service model enforces unique index on documentNumber for One Time Jobs");

  // Test that edit controller does not touch or re-allocate invoiceNumber
  const mockOriginalInvoice = {
    _id: "inv_123",
    invoiceNumber: "SPMJ/01/2026-27",
    subtotal: 5000,
    totalAmount: 5000,
    amountPaid: 0,
    tax: { cgstPercentage: 0, sgstPercentage: 0, igstPercentage: 0 },
  };

  const origFindById = Invoice.findById;
  const origFindOne = Invoice.findOne;
  const origFindByIdAndUpdate = Invoice.findByIdAndUpdate;

  let capturedUpdateData = null;
  Invoice.findById = async () => mockOriginalInvoice;
  Invoice.findOne = async () => null; // No duplicate
  Invoice.findByIdAndUpdate = (id, updateData) => {
    capturedUpdateData = updateData;
    const doc = { ...mockOriginalInvoice, ...updateData };
    const query = {
      populate: () => query,
      then: (resolve) => resolve(doc),
      catch: (reject) => {},
    };
    return query;
  };

  try {
    const req = {
      params: { id: "inv_123" },
      body: {
        paymentStatus: "Paid",
        amountPaid: 5000,
        notes: "Paid in full via UPI",
      },
    };
    let jsonResponse = null;
    let statusCode = 200;
    const res = {
      status: (c) => {
        statusCode = c;
        return { json: (d) => { jsonResponse = d; } };
      },
      json: (d) => { jsonResponse = d; },
    };

    await updateInvoice(req, res);
    if (statusCode !== 200) {
      console.error("updateInvoice failed with:", statusCode, jsonResponse);
    }
    assert(statusCode === 200, "Invoice updated successfully with status 200");
    assert(capturedUpdateData.invoiceNumber === undefined, "Invoice number was NOT modified or re-allocated during edit");
    assert(capturedUpdateData.paymentStatus === "Paid", "Payment status updated correctly");
  } finally {
    Invoice.findById = origFindById;
    Invoice.findOne = origFindOne;
    Invoice.findByIdAndUpdate = origFindByIdAndUpdate;
  }

  console.log("\n================================================================================");
  console.log(`  DOCX & EDIT VERIFICATION RESULTS: ${passedCount} PASSED, ${failedCount} FAILED `);
  console.log("================================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runDocxPdfAndEditTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
