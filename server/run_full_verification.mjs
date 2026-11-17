import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument } from "pdf-lib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
  normalizeDate,
  formatDate,
  getBillingPeriod,
  normalizeBillingPeriod,
  formatBillingDatePart,
  getContractPeriodDates,
} from "./utils/docGenerator.js";
import {
  generatePdfFromPdfTemplate,
} from "./utils/pdfTemplateGenerator.js";

async function runTests() {
  console.log("=== STEP 1: BILLING PERIOD ABBREVIATED FORMAT TESTS ===");
  const formatCases = [
    { input: "26 AUG 2026 to 25 SEPT 2026", expected: "26 AUG 2026 to 25 SEPT 2026", name: "Exact required user style" },
    { input: "26/08/2026 to 25/09/2026", expected: "26 AUG 2026 to 25 SEPT 2026", name: "Slash format preserving 26 Aug to 25 Sept" },
    { input: "26-08-2026 to 25-09-2026", expected: "26 AUG 2026 to 25 SEPT 2026", name: "Hyphen format preserving 26 Aug to 25 Sept" },
    { input: "26 AUGUST 2026 to 25 SEPTEMBER 2026", expected: "26 AUG 2026 to 25 SEPT 2026", name: "Full month names normalized to uppercase abbreviations" },
    { input: "26-aug-2026 to 25-sep-2026", expected: "26 AUG 2026 to 25 SEPT 2026", name: "Lowercase/3-letter sep normalized to SEPT" },
    { input: "01 AUGUST 2026 to 31 AUGUST 2026", expected: "01 AUG 2026 to 31 AUG 2026", name: "Full calendar month normalized to AUG" },
    { input: "01 JANUARY 46265 to 31 JANUARY 46265", fallback: 46265, expected: "01 AUG 2026 to 31 AUG 2026", name: "Corrupted string with 46265 recovered to AUG" },
    { input: "46265", expected: "01 AUG 2026 to 31 AUG 2026", name: "Raw serial in billingPeriod" },
    { input: "", fallback: 46265, expected: "01 AUG 2026 to 31 AUG 2026", name: "Empty billingPeriod with serial fallback" },
    { input: "", fallback: new Date("46265"), expected: "01 AUG 2026 to 31 AUG 2026", name: "Empty billingPeriod with corrupted Date fallback" },
    { input: "", fallback: "31/08/2026", expected: "01 AUG 2026 to 31 AUG 2026", name: "Empty billingPeriod with DD/MM/YYYY fallback" },
  ];

  for (const fc of formatCases) {
    const res = normalizeBillingPeriod(fc.input, fc.fallback);
    console.log(`[${fc.name}]`);
    console.log(`  Input:    "${fc.input}"`);
    console.log(`  Result:   "${res}"`);
    console.log(`  Expected: "${fc.expected}"`);
    if (res !== fc.expected) {
      throw new Error(`Billing period formatting failed for [${fc.name}]: expected "${fc.expected}", got "${res}"`);
    }
  }

  console.log("\n=== STEP 2: ALL 12 MONTH ABBREVIATIONS VERIFICATION ===");
  const expectedMonths = [
    { num: 1, abbr: "JAN" },
    { num: 2, abbr: "FEB" },
    { num: 3, abbr: "MAR" },
    { num: 4, abbr: "APR" },
    { num: 5, abbr: "MAY" },
    { num: 6, abbr: "JUN" },
    { num: 7, abbr: "JUL" },
    { num: 8, abbr: "AUG" },
    { num: 9, abbr: "SEPT" },
    { num: 10, abbr: "OCT" },
    { num: 11, abbr: "NOV" },
    { num: 12, abbr: "DEC" },
  ];

  for (const m of expectedMonths) {
    const dStr = `15/${String(m.num).padStart(2, "0")}/2026`;
    const formatted = formatBillingDatePart(dStr);
    const expected = `15 ${m.abbr} 2026`;
    console.log(`Month ${m.num} (${dStr}) -> "${formatted}" (Expected: "${expected}")`);
    if (formatted !== expected) {
      throw new Error(`Month abbreviation failed for month ${m.num}: expected "${expected}", got "${formatted}"`);
    }
  }

  console.log("\n=== STEP 3: GENERATE TAX INVOICE WITH USER EXACT EXAMPLE (26 AUG 2026 to 25 SEPT 2026) ===");
  const taxTemplatePath = "uploads/templates/FORMAT TAX BILL PLACEHOLDER.pdf";
  if (!fs.existsSync(taxTemplatePath)) {
    throw new Error(`Tax template not found at ${taxTemplatePath}`);
  }

  // Ensure scratch directory exists inside CRM main
  const scratchDir = path.resolve(__dirname, "../scratch");
  if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

  // Test 3A: User exact billing period "26 AUG 2026 to 25 SEPT 2026"
  const taxData1 = {
    invoiceNumber: "SPM/187/2026-27",
    invoiceDate: formatDate("46265"), // "31/08/2026"
    dueDate: formatDate("46265"),
    billingPeriod: normalizeBillingPeriod("26 AUG 2026 to 25 SEPT 2026"),
    customerName: "DRN INFRA PROJECT PVT. LTD",
    customerAddress: "27AAHCD2154N1ZE",
    gstNumber: "27AAHCD2154N1ZE",
    stateCode: "27",
    hsnCode: "3808",
    sacCode: "998531",
    workOrderNumber: "N/A",
    workOrderDate: "",
    premisesTreated: "ANDHERI",
    treatmentType: "PC",
    subtotal: "20,540.00",
    cgstPercentage: "9",
    cgstAmount: "1,848.60",
    sgstPercentage: "9",
    sgstAmount: "1,848.60",
    totalAmount: "24,237.20",
    amountInWords: "RUPEES TWENTY FOUR THOUSAND TWO HUNDRED THIRTY SEVEN AND PAISA TWENTY ONLY",
    treatments: [
      {
        premisesTreated: "ANDHERI",
        treatmentType: "PC",
      },
    ],
  };

  const taxBuf1 = await generatePdfFromPdfTemplate(taxTemplatePath, taxData1, "tax-invoice");
  fs.writeFileSync(path.join(scratchDir, "tax_drn_user_abbr.pdf"), taxBuf1);
  console.log("Generated scratch/tax_drn_user_abbr.pdf");

  // Test 3B: Full calendar month abbreviation "01 AUG 2026 to 31 AUG 2026"
  const taxData2 = {
    ...taxData1,
    invoiceNumber: "SPM/188/2026-27",
    billingPeriod: normalizeBillingPeriod("46265"),
    premisesTreated: "M/s AHLUWALIA CONTRACTS (INDIA) LIMITED, CSMT -WADI BANDER, LABOUR COLONY,",
    treatments: [
      {
        premisesTreated: "M/s AHLUWALIA CONTRACTS (INDIA) LIMITED, CSMT -WADI BANDER, LABOUR COLONY,",
        treatmentType: "PC",
      },
    ],
  };
  const taxBuf2 = await generatePdfFromPdfTemplate(taxTemplatePath, taxData2, "tax-invoice");
  fs.writeFileSync(path.join(scratchDir, "tax_ahluwalia_user_abbr.pdf"), taxBuf2);
  console.log("Generated scratch/tax_ahluwalia_user_abbr.pdf");

  console.log("\n=== STEP 4: GENERATE NON-GST INVOICE WITH USER EXACT EXAMPLE ===");
  const nonGstTemplatePath = "uploads/templates/FORMAT - PC INVOICE PLACEHOLDER.pdf";
  const nonGstData = {
    invoiceNumber: "SPM/NG/045/2026-27",
    invoiceDate: formatDate("46265"),
    billingPeriod: normalizeBillingPeriod("26/08/2026 to 25/09/2026"), // should format to "26 AUG 2026 to 25 SEPT 2026"
    contractPeriod: "01/04/2026 to 31/03/2027",
    customerName: "SHAPOORJI PALLONJI REAL ESTATE",
    customerAddress: "SUITE 401, FORT, MUMBAI - 400001",
    premisesTreated: "VIRAR RESIDENTIAL COMPLEX, BUILDING NO 4",
    treatmentType: "PC",
    subtotal: "15,000.00",
    totalAmount: "15,000.00",
    amountInWords: "RUPEES FIFTEEN THOUSAND ONLY",
    treatments: [
      {
        premisesTreated: "VIRAR RESIDENTIAL COMPLEX, BUILDING NO 4",
        treatmentType: "PC",
      },
    ],
  };
  const nonGstBuf = await generatePdfFromPdfTemplate(nonGstTemplatePath, nonGstData, "invoice");
  fs.writeFileSync(path.join(scratchDir, "nongst_invoice_abbr.pdf"), nonGstBuf);
  console.log("Generated scratch/nongst_invoice_abbr.pdf");

  console.log("\nALL VERIFICATION STEPS COMPLETED WITH 100% SUCCESS!");
}

runTests().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
