import mongoose from "mongoose";
import dotenv from "dotenv";
import { PDFDocument } from "pdf-lib";

dotenv.config();

import Customer from "../model/customerModel.js";
import Employee from "../model/employeeModel.js";
import Invoice from "../model/invoiceModel.js";
import Quotation from "../model/quotationModel.js";
import Service from "../model/serviceModel.js";
import Renewal from "../model/renewalModel.js";

import {
  generateInvoiceDocx,
  generateQuotationDocx,
  generateAttQuotationDocx,
  generateContractRenewalDocx,
  generateOneTimeJobDocx,
} from "../utils/docGenerator.js";
import { convertDocxToPdf } from "../utils/docxToPdf.js";

async function testAllDocs() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB for PDF audit.\n");

  const results = [];

  // 1. Invoice
  try {
    const invoice = await Invoice.findOne().populate("customer");
    if (invoice) {
      console.log(`Testing Invoice (${invoice.invoiceNumber})...`);
      const docx = await generateInvoiceDocx(invoice);
      const pdf = await convertDocxToPdf(docx.buffer);
      const pdfDoc = await PDFDocument.load(pdf);
      const count = pdfDoc.getPageCount();
      console.log(`  -> Invoice PDF generated: ${pdf.length} bytes, ${count} page(s)`);
      results.push({ type: "Invoice", size: pdf.length, pages: count, pass: pdf.length > 5000 && count > 0 });
    }
  } catch (err) {
    console.error("Invoice test failed:", err.message);
  }

  // 2. PC Quotation
  try {
    const pcQuotation = await Quotation.findOne({ quotationType: "PC" }).populate("customer");
    if (pcQuotation) {
      console.log(`Testing PC Quotation (${pcQuotation.quotationNumber})...`);
      const docx = await generateQuotationDocx(pcQuotation);
      const pdf = await convertDocxToPdf(docx.buffer);
      const pdfDoc = await PDFDocument.load(pdf);
      const count = pdfDoc.getPageCount();
      console.log(`  -> PC Quotation PDF generated: ${pdf.length} bytes, ${count} page(s)`);
      results.push({ type: "Quotation (PC)", size: pdf.length, pages: count, pass: pdf.length > 5000 && count > 0 });
    }
  } catch (err) {
    console.error("PC Quotation test failed:", err.message);
  }

  // 3. ATT Quotation
  try {
    const attQuotation = await Quotation.findOne({ quotationType: "ATT" }).populate("customer");
    if (attQuotation) {
      console.log(`Testing ATT Quotation (${attQuotation.quotationNumber})...`);
      const docx = await generateAttQuotationDocx(attQuotation);
      const pdf = await convertDocxToPdf(docx.buffer);
      const pdfDoc = await PDFDocument.load(pdf);
      const count = pdfDoc.getPageCount();
      console.log(`  -> ATT Quotation PDF generated: ${pdf.length} bytes, ${count} page(s)`);
      results.push({ type: "Quotation (ATT)", size: pdf.length, pages: count, pass: pdf.length > 5000 && count > 0 });
    }
  } catch (err) {
    console.error("ATT Quotation test failed:", err.message);
  }

  // 4. Contract Renewal
  try {
    const renewal = await Renewal.findOne().populate("customer");
    if (renewal) {
      console.log(`Testing Contract Renewal (${renewal.renewalNumber})...`);
      const docx = await generateContractRenewalDocx(renewal);
      const pdf = await convertDocxToPdf(docx.buffer);
      const pdfDoc = await PDFDocument.load(pdf);
      const count = pdfDoc.getPageCount();
      console.log(`  -> Contract Renewal PDF generated: ${pdf.length} bytes, ${count} page(s)`);
      results.push({ type: "Contract Renewal", size: pdf.length, pages: count, pass: pdf.length > 5000 && count > 0 });
    }
  } catch (err) {
    console.error("Contract Renewal test failed:", err.message);
  }

  // 5. Service Paper
  try {
    const service = await Service.findOne().populate("customer");
    if (service) {
      console.log(`Testing Service Paper (${service.jobNo || service._id})...`);
      const docx = await generateOneTimeJobDocx(service);
      const pdf = await convertDocxToPdf(docx.buffer);
      const pdfDoc = await PDFDocument.load(pdf);
      const count = pdfDoc.getPageCount();
      console.log(`  -> Service Paper PDF generated: ${pdf.length} bytes, ${count} page(s)`);
      results.push({ type: "Service Paper", size: pdf.length, pages: count, pass: pdf.length > 5000 && count > 0 });
    }
  } catch (err) {
    console.error("Service Paper test failed:", err.message);
  }

  console.log("\n=================================");
  console.log("PDF GENERATION AUDIT SUMMARY:");
  console.log("=================================");
  console.table(results);

  await mongoose.disconnect();
}

testAllDocs().catch(console.error);
