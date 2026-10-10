import fs from "fs";
import path from "path";
import zlib from "zlib";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { PDFDocument, PDFName } from "pdf-lib";
import { convertDocxToPdf } from "../utils/docxToPdf.js";
import { isPageBlank } from "./test_trim_logic.js";

async function testTrimInvoice() {
  const filePath = path.join("server", "uploads", "templates", "1786984940901-368158168.docx");
  const content = fs.readFileSync(filePath);
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  const mockData = {
    customerName: "NON GST TEST CUSTOMER PVT LTD",
    customerAddress: "Plot 10, Sector 4, Airoli, Navi Mumbai",
    invoiceNumber: "INV-NG-2026-001",
    invoiceDate: "10/10/2026",
    dueDate: "25/10/2026",
    billingPeriod: "01 OCTOBER 2026 to 31 OCTOBER 2026",
    totalAmount: "5,000.00",
    grandTotal: "5,000.00",
    amountInWords: "RUPEES FIVE THOUSAND ONLY",
    services: [
      {
        serviceNumber: "1",
        serviceName: "Pest Control Treatment",
        description: "Monthly pest control service",
        amount: "5,000.00",
        location: "Plot 10, Sector 4, Airoli, Navi Mumbai",
        frequency: "Monthly",
      },
    ],
  };

  doc.render(mockData);
  const docxBuf = Buffer.from(doc.getZip().generate({ type: "nodebuffer" }));

  // Convert using convertDocxToPdf
  const finalPdfBuf = await convertDocxToPdf(docxBuf);
  const pdfDoc = await PDFDocument.load(finalPdfBuf);

  console.log(`\n======================================================`);
  console.log(`CONVERTED NON-GST INVOICE PDF PAGES: ${pdfDoc.getPageCount()}`);
  console.log(`======================================================`);

  for (let i = 0; i < pdfDoc.getPageCount(); i++) {
    const page = pdfDoc.getPage(i);
    const blank = isPageBlank(page, pdfDoc);
    console.log(` - Page ${i + 1}: isPageBlank = ${blank}`);
  }
}

testTrimInvoice().catch(console.error);
