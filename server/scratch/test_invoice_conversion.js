import fs from "fs";
import path from "path";
import zlib from "zlib";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { PDFDocument, PDFName } from "pdf-lib";
import { convertDocxToPdf, trimTrailingBlankPages } from "../utils/docxToPdf.js";

async function testInvoiceConversion() {
  const templatePath = path.join("server", "uploads", "templates", "1788674544315-20957534.docx");
  if (!fs.existsSync(templatePath)) {
    console.error("Template not found:", templatePath);
    return;
  }

  const content = fs.readFileSync(templatePath);
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  const invoiceData = {
    customerName: "ACME ENTERPRISES PRIVATE LIMITED",
    customerAddress: "Plot 45, Industrial Zone, Andheri East, Mumbai - 400093",
    invoiceNumber: "INV-2026-9999",
    invoiceDate: "10/10/2026",
    dueDate: "25/10/2026",
    billingPeriod: "01 OCTOBER 2026 to 31 OCTOBER 2026",
    workOrderNumber: "WO-8877",
    workOrderDate: "01/10/2026",
    gstin: "27AAACB1234A1Z5",
    companyGstin: "27BDMPM1204J1ZL",
    subtotal: "10,000.00",
    cgstAmount: "900.00",
    sgstAmount: "900.00",
    igstAmount: "0.00",
    totalTax: "1,800.00",
    totalAmount: "11,800.00",
    amountInWords: "RUPEES ELEVEN THOUSAND EIGHT HUNDRED ONLY",
    services: [
      {
        serviceNumber: "1",
        serviceName: "General Pest Control & Disinfection Treatment",
        description: "Comprehensive pest control treatment covering office, warehouse, and kitchen area.",
        amount: "10,000.00",
        location: "Plot 45, Industrial Zone, Andheri East, Mumbai",
        frequency: "Monthly",
      },
    ],
  };

  doc.render(invoiceData);
  const docxBuf = Buffer.from(doc.getZip().generate({ type: "nodebuffer" }));
  const tmpDocxPath = path.join("server", "scratch", "test_pop_invoice.docx");
  fs.writeFileSync(tmpDocxPath, docxBuf);
  console.log("Populated Invoice DOCX written to:", tmpDocxPath, "(" + docxBuf.length + " bytes)");

  // Convert with LibreOffice via convertDocxToPdf
  const finalPdfBuf = await convertDocxToPdf(docxBuf);
  const finalPdfPath = path.join("server", "scratch", "test_pop_invoice_final.pdf");
  fs.writeFileSync(finalPdfPath, finalPdfBuf);

  const pdfDoc = await PDFDocument.load(finalPdfBuf);
  console.log(`\n======================================================`);
  console.log(`CONVERTED INVOICE PDF TOTAL PAGES: ${pdfDoc.getPageCount()}`);
  console.log(`======================================================`);

  for (let i = 0; i < pdfDoc.getPageCount(); i++) {
    const page = pdfDoc.getPage(i);
    const contentsRef = page.node.get(PDFName.of("Contents"));
    console.log(`Page ${i + 1}: ${contentsRef ? "Has Contents stream" : "NO Contents stream"}`);
  }
}

testInvoiceConversion().catch(console.error);
