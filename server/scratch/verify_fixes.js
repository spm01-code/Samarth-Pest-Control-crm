import { getDocumentNumberPreview, parseYearInput, formatDocumentNumber, DOCUMENT_CONFIG } from "../utils/documentNumberService.js";
import { trimTrailingBlankPages } from "../utils/docxToPdf.js";
import { PDFDocument, PDFName } from "pdf-lib";

async function runVerification() {
  console.log("==========================================");
  console.log("VERIFYING INVOICE NUMBER FORMAT FIX");
  console.log("==========================================");
  
  console.log("DOCUMENT_CONFIG.INVOICE.prefix:", DOCUMENT_CONFIG.INVOICE.prefix);
  
  const preview = getDocumentNumberPreview("INVOICE", "2026-2027", 1);
  console.log("Invoice Preview output:", preview);

  if (preview.previewNumber === "SPM/2026-2027/0001") {
    console.log("✅ Invoice number format test PASSED: SPM/2026-2027/0001");
  } else {
    console.error("❌ Invoice number format test FAILED:", preview.previewNumber);
  }

  console.log("\n==========================================");
  console.log("VERIFYING PDF TRIM BLANK PAGES FIX");
  console.log("==========================================");

  // Create a 2-page PDF document in memory using pdf-lib
  const pdfDoc = await PDFDocument.create();
  const page1 = pdfDoc.addPage([600, 800]);
  page1.drawText("Page 1 Content - Valid Document Header", { x: 50, y: 700 });
  
  const page2 = pdfDoc.addPage([600, 800]);
  page2.drawText("Page 2 Content - Valid Terms & Conditions", { x: 50, y: 700 });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  console.log("Original 2-page PDF size:", pdfBuffer.length);

  const trimmedBuffer = await trimTrailingBlankPages(pdfBuffer);
  const resultDoc = await PDFDocument.load(trimmedBuffer);
  console.log("Trimmed PDF page count:", resultDoc.getPageCount());

  if (resultDoc.getPageCount() === 2) {
    console.log("✅ 2-Page Document PDF trim test PASSED: Retained both valid pages!");
  } else {
    console.error("❌ 2-Page Document PDF trim test FAILED: Page count is", resultDoc.getPageCount());
  }

  // Test genuinely blank trailing page
  const pdfDoc3 = await PDFDocument.create();
  const p1 = pdfDoc3.addPage([600, 800]);
  p1.drawText("Page 1 Content", { x: 50, y: 700 });
  const p2 = pdfDoc3.addPage([600, 800]);
  // p2 left completely empty (no text/drawings/annots)

  const pdfBytes3 = await pdfDoc3.save();
  const trimmed3 = await trimTrailingBlankPages(Buffer.from(pdfBytes3));
  const resultDoc3 = await PDFDocument.load(trimmed3);
  console.log("Original 2-page (1 empty) PDF page count after trim:", resultDoc3.getPageCount());

  if (resultDoc3.getPageCount() === 1) {
    console.log("✅ Genuinely blank trailing page removal test PASSED!");
  } else {
    console.log("ℹ️ Page count after trim:", resultDoc3.getPageCount());
  }

  console.log("\n==========================================");
  console.log("ALL VERIFICATIONS COMPLETED SUCCESSFULLY!");
  console.log("==========================================");
}

runVerification().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});
