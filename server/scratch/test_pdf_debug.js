import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { PDFDocument, PDFName } from "pdf-lib";

dotenv.config();

import Invoice from "../model/invoiceModel.js";
import Quotation from "../model/quotationModel.js";
import Service from "../model/serviceModel.js";
import Renewal from "../model/renewalModel.js";
import Customer from "../model/customerModel.js";

import { generateInvoiceDocx } from "../utils/docGenerator.js";
import { convertDocxToPdf, trimTrailingBlankPages } from "../utils/docxToPdf.js";

async function testDebug() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  // Get a sample invoice
  const sampleInvoice = await Invoice.findOne().populate("customer");
  if (!sampleInvoice) {
    console.log("No sample invoice found.");
    await mongoose.disconnect();
    return;
  }

  console.log(`Testing Invoice: ${sampleInvoice.invoiceNumber} (${sampleInvoice._id})`);

  // 1. Generate DOCX
  const docxResult = await generateInvoiceDocx(sampleInvoice._id);
  await fs.writeFile("./scratch/debug_invoice.docx", docxResult.buffer);
  console.log(`Saved scratch/debug_invoice.docx (size: ${docxResult.buffer.length} bytes)`);

  // Convert to PDF using convertDocxToPdf
  const pdfBuffer = await convertDocxToPdf(docxResult.buffer);
  await fs.writeFile("./scratch/debug_invoice_final.pdf", pdfBuffer);
  console.log(`Saved scratch/debug_invoice_final.pdf (size: ${pdfBuffer.length} bytes)`);

  // Check PDF details with pdf-lib
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  console.log(`Final PDF Page Count: ${pdfDoc.getPageCount()}`);

  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const node = page.node;
    const contentsRef = node.get(PDFName.of("Contents"));
    console.log(`Page ${i + 1} contentsRef:`, contentsRef ? contentsRef.toString() : "NULL");
    if (contentsRef) {
      const contentStream = pdfDoc.context.lookup(contentsRef);
      let streamStr = "";
      if (contentStream && contentStream.contents) {
        streamStr = Buffer.from(contentStream.contents).toString("utf8");
      } else if (contentStream && typeof contentStream.toString === "function") {
        streamStr = contentStream.toString();
      }
      console.log(`Page ${i + 1} stream length: ${streamStr.length} chars. Sample: ${streamStr.substring(0, 150)}`);
      const hasTextOrImage = /\b(Tj|TJ|'|"|Do)\b/.test(streamStr);
      console.log(`Page ${i + 1} hasTextOrImage regex test: ${hasTextOrImage}`);
    }
  }

  await mongoose.disconnect();
}

testDebug().catch(console.error);
