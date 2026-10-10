import fs from "fs";
import path from "path";
import zlib from "zlib";
import { PDFDocument, PDFName } from "pdf-lib";
import { convertDocxToPdf, trimTrailingBlankPages } from "../utils/docxToPdf.js";
import { generateInvoiceDocx, generateQuotationDocx, generateContractRenewalDocx, generateAttQuotationDocx, generateOneTimeJobDocx } from "../utils/docGenerator.js";

// Mock data for Invoice
const mockInvoice = {
  _id: "60d5ecb8b5c9c22b1c8e1111",
  invoiceNumber: "INV-2026-0001",
  invoiceDate: new Date(),
  dueDate: new Date(Date.now() + 15 * 86400 * 1000),
  invoiceType: "GST",
  gstNumber: "27AAACB1234A1Z5",
  billingPeriod: "01 OCTOBER 2026 to 31 OCTOBER 2026",
  customer: {
    companyName: "ACME ENTERPRISES PVT LTD",
    fullName: "John Doe",
    address: "Plot No. 45, Industrial Area, Phase II, Mumbai - 400093",
    phone: "9876543210",
    email: "accounts@acme.com",
    gstNumber: "27AAACB1234A1Z5",
  },
  premisesTreated: "Plot No. 45, Industrial Area, Phase II, Mumbai",
  treatmentType: "General Pest Control",
  subtotal: 10000,
  cgstAmount: 900,
  sgstAmount: 900,
  igstAmount: 0,
  totalTax: 1800,
  totalAmount: 11800,
  grandTotal: 11800,
  amountInWords: "RUPEES ELEVEN THOUSAND EIGHT HUNDRED ONLY",
  services: [
    {
      serviceName: "General Pest Control Treatment",
      desc: "Monthly pest control service covering office and warehouse premises.",
      amount: 10000,
      serviceDate: new Date(),
      frequency: "Monthly",
    },
  ],
};

async function diagnoseDoc(docName, generatorFn, dataPayload) {
  console.log(`\n======================================================`);
  console.log(`DIAGNOSING: ${docName}`);
  console.log(`======================================================`);

  try {
    const docResult = await generatorFn(dataPayload);
    console.log(`1. Populated DOCX generated successfully. Buffer size: ${docResult.buffer.length} bytes`);

    // Let's inspect raw PDF from LibreOffice conversion before trimTrailingBlankPages
    // Save temporary DOCX to test LibreOffice conversion manually
    const tmpDocxPath = path.join("server", "scratch", `diag_${docName}.docx`);
    fs.writeFileSync(tmpDocxPath, docResult.buffer);

    // Call convertDocxToPdf which does LibreOffice conversion + trimTrailingBlankPages
    const finalPdfBuf = await convertDocxToPdf(docResult.buffer);
    const finalDoc = await PDFDocument.load(finalPdfBuf);
    console.log(`2. Final PDF generated. Total Pages: ${finalDoc.getPageCount()}, Buffer size: ${finalPdfBuf.length} bytes`);

    for (let i = 0; i < finalDoc.getPageCount(); i++) {
      const page = finalDoc.getPage(i);
      const contentsRef = page.node.get(PDFName.of("Contents"));
      console.log(` - Page ${i + 1}: ${contentsRef ? "Has Contents" : "NO Contents"}`);
    }
  } catch (err) {
    console.error(`Error diagnosing ${docName}:`, err.message);
  }
}

async function runDiagnosis() {
  await diagnoseDoc("Invoice_GST", generateInvoiceDocx, mockInvoice);
}

runDiagnosis().catch(console.error);
