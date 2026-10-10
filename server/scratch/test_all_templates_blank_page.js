import fs from "fs";
import path from "path";
import zlib from "zlib";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { PDFDocument, PDFName } from "pdf-lib";
import { convertDocxToPdf } from "../utils/docxToPdf.js";

const templateFiles = fs.readdirSync("server/uploads/templates").filter(f => f.endsWith(".docx"));

async function testTemplate(fileName) {
  const filePath = path.join("server", "uploads", "templates", fileName);
  console.log(`\n======================================================`);
  console.log(`TESTING TEMPLATE: ${fileName}`);
  console.log(`======================================================`);

  try {
    const content = fs.readFileSync(filePath);
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    const mockData = {
      customerName: "SAMARTH PEST TEST CUSTOMER PVT LTD",
      customerAddress: "Plot 100, Sector 15, Vashi, Navi Mumbai - 400703",
      quotationNumber: "QTN-2026-9999",
      quoteNumber: "QTN-2026-9999",
      quotationDate: "10/10/2026",
      quoteDate: "10/10/2026",
      invoiceNumber: "INV-2026-9999",
      invoiceDate: "10/10/2026",
      dueDate: "25/10/2026",
      billingPeriod: "01 OCTOBER 2026 to 31 OCTOBER 2026",
      contractPeriod: "01/10/2026 to 30/09/2027 (12 Months)",
      renewalNumber: "RN-2026-9999",
      contractNumber: "CN-2026-9999",
      workOrderNumber: "WO-8877",
      workOrderDate: "01/10/2026",
      gstin: "27AAACB1234A1Z5",
      companyGstin: "27BDMPM1204J1ZL",
      premisesTreated: "Plot 100, Sector 15, Vashi, Navi Mumbai",
      treatmentType: "General Pest Control",
      subtotal: "15,000.00",
      cgstAmount: "1,350.00",
      sgstAmount: "1,350.00",
      igstAmount: "0.00",
      totalTax: "2,700.00",
      totalAmount: "17,700.00",
      grandTotal: "17,700.00",
      amountInWords: "RUPEES SEVENTEEN THOUSAND SEVEN HUNDRED ONLY",
      billingTerm: "Monthly",
      billingTerms: "Monthly",
      paymentTerm: "Within 10 days from invoice submission.",
      paymentTerms: "Within 10 days from invoice submission.",
      services: [
        {
          serviceNumber: "1",
          number: "1",
          serviceName: "General Pest Control Treatment & Disinfection",
          serviceType: "General Pest Control Treatment & Disinfection",
          description: "Monthly pest control treatment covering full office and factory area.",
          location: "Plot 100, Sector 15, Vashi, Navi Mumbai",
          address: "Plot 100, Sector 15, Vashi, Navi Mumbai",
          premisesTreated: "Plot 100, Sector 15, Vashi, Navi Mumbai",
          frequency: "Monthly",
          amount: "15,000.00",
          serviceCost: "15,000.00",
          cost: "15,000.00",
        },
      ],
      treatments: [
        {
          treatmentNumber: "1",
          treatmentType: "General Pest Control",
          premisesTreated: "Plot 100, Sector 15, Vashi, Navi Mumbai",
          description: "Monthly pest control treatment covering full office.",
          amount: "15,000.00",
          frequency: "Monthly",
        },
      ],
    };

    doc.render(mockData);
    const docxBuf = Buffer.from(doc.getZip().generate({ type: "nodebuffer" }));
    const convertedPdfBuf = await convertDocxToPdf(docxBuf);
    const pdfDoc = await PDFDocument.load(convertedPdfBuf);

    console.log(`RESULT -> File: ${fileName} | PDF Pages: ${pdfDoc.getPageCount()}`);
    for (let i = 0; i < pdfDoc.getPageCount(); i++) {
      const page = pdfDoc.getPage(i);
      const contentsRef = page.node.get(PDFName.of("Contents"));
      let streamLen = 0;
      let textContent = "";
      if (contentsRef) {
        const contentsObj = pdfDoc.context.lookup(contentsRef);
        let rawBytes = contentsObj?.getContents ? contentsObj.getContents() : contentsObj?.contents;
        streamLen = rawBytes ? rawBytes.length : 0;
        if (rawBytes) {
          try {
            textContent = zlib.inflateSync(Buffer.from(rawBytes)).toString("latin1");
          } catch (e) {
            try { textContent = zlib.unzipSync(Buffer.from(rawBytes)).toString("latin1"); } catch(e2) { textContent = Buffer.from(rawBytes).toString("latin1"); }
          }
        }
      }
      console.log(` - Page ${i + 1}: streamLen=${streamLen}, decodedTextLen=${textContent.length}`);
      if (textContent.length > 0) {
        const hasTj = /\b(Tj|TJ)\b/.test(textContent);
        const textSnippets = textContent.match(/\[(.*?)\]\s*TJ|\((.*?)\)\s*Tj/g) || [];
        console.log(`   Text operators (Tj/TJ): ${hasTj}, Text count: ${textSnippets.length}`);
        if (textSnippets.length < 10) {
          console.log(`   Text snippets:`, textSnippets);
        }
      }
    }
  } catch (err) {
    console.error(`Error testing template ${fileName}:`, err.message);
  }
}

async function runAll() {
  for (const file of templateFiles) {
    await testTemplate(file);
  }
}

runAll().catch(console.error);
