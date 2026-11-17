import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  generateInvoiceDocx,
  generateQuotationDocx,
  generateContractRenewalDocx,
  generateOneTimeJobDocx,
  generateAttQuotationDocx,
  formatDate,
  normalizeBillingPeriod,
} from "./utils/docGenerator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scratchDir = path.resolve(__dirname, "../scratch");
if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

async function testDocx() {
  console.log("=== TESTING DOCX GENERATION PIPELINE WITH ABBREVIATED BILLING PERIOD ===");

  // 1. Tax Invoice DOCX with user exact example "26 AUG 2026 to 25 SEPT 2026"
  const taxData = {
    invoiceNumber: "SPM/187/2026-27",
    invoiceDate: "46265",
    dueDate: "46265",
    billingPeriod: "26 AUG 2026 to 25 SEPT 2026",
    invoiceType: "TAX_INVOICE",
    customer: {
      fullName: "DRN INFRA PROJECT PVT. LTD",
      address: "27AAHCD2154N1ZE",
      gstNumber: "27AAHCD2154N1ZE",
    },
    gstNumber: "27AAHCD2154N1ZE",
    premisesTreated: "ANDHERI",
    treatmentType: "PC",
    subtotal: 20540,
    tax: {
      cgstAmount: 1848.6,
      sgstAmount: 1848.6,
    },
    totalAmount: 24237.2,
    amountInWords: "RUPEES TWENTY FOUR THOUSAND TWO HUNDRED THIRTY SEVEN ONLY",
  };

  const taxDocxResult = await generateInvoiceDocx(taxData, "tax-invoice");
  console.log("Tax Invoice DOCX generated:", Boolean(taxDocxResult?.buffer));
  fs.writeFileSync(path.join(scratchDir, "tax_drn_output_abbr.docx"), taxDocxResult.buffer);

  // Check generated data in docx result
  console.log("  Tax Docx data.invoiceDate:", taxDocxResult.data?.invoiceDate);
  console.log("  Tax Docx data.billingPeriod:", taxDocxResult.data?.billingPeriod);
  if (taxDocxResult.data?.billingPeriod !== "26 AUG 2026 to 25 SEPT 2026") {
    throw new Error(`Expected billingPeriod to be "26 AUG 2026 to 25 SEPT 2026", got: "${taxDocxResult.data?.billingPeriod}"`);
  }

  // 2. Non-GST Invoice DOCX with 26/08/2026 to 25/09/2026
  const nonGstData = {
    ...taxData,
    billingPeriod: "26/08/2026 to 25/09/2026",
    invoiceType: "NON_GST",
    gstNumber: "",
  };
  const nonGstDocxResult = await generateInvoiceDocx(nonGstData, "invoice");
  console.log("Non-GST Invoice DOCX generated:", Boolean(nonGstDocxResult?.buffer));
  fs.writeFileSync(path.join(scratchDir, "nongst_output_abbr.docx"), nonGstDocxResult.buffer);
  console.log("  Non-GST Docx data.invoiceDate:", nonGstDocxResult.data?.invoiceDate);
  console.log("  Non-GST Docx data.billingPeriod:", nonGstDocxResult.data?.billingPeriod);
  if (nonGstDocxResult.data?.billingPeriod !== "26 AUG 2026 to 25 SEPT 2026") {
    throw new Error(`Expected billingPeriod to be "26 AUG 2026 to 25 SEPT 2026", got: "${nonGstDocxResult.data?.billingPeriod}"`);
  }

  // 3. Tax Invoice with fallback invoiceDate (e.g. 46265)
  const taxDataFallback = {
    ...taxData,
    billingPeriod: "", // empty, should compute "01 AUG 2026 to 31 AUG 2026"
  };
  const taxFallbackResult = await generateInvoiceDocx(taxDataFallback, "tax-invoice");
  console.log("  Tax Fallback data.billingPeriod:", taxFallbackResult.data?.billingPeriod);
  if (taxFallbackResult.data?.billingPeriod !== "01 AUG 2026 to 31 AUG 2026") {
    throw new Error(`Expected fallback billingPeriod to be "01 AUG 2026 to 31 AUG 2026", got: "${taxFallbackResult.data?.billingPeriod}"`);
  }

  console.log("\nALL DOCX TESTS PASSED WITH 100% SUCCESS!");
}

testDocx().catch((err) => {
  console.error("DOCX Test failed:", err);
  process.exit(1);
});
