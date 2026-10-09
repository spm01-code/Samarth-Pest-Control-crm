import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { PDFDocument, PDFName } from "pdf-lib";
import { trimTrailingBlankPages } from "../utils/docxToPdf.js";

async function testTrim() {
  const scratchDir = path.resolve("./scratch");
  const rawPdfPath = path.join(scratchDir, "raw_local.pdf");
  if (!fsSync.existsSync(rawPdfPath)) {
    console.log("raw_local.pdf not found in scratch");
    return;
  }

  const rawPdfBuf = await fs.readFile(rawPdfPath);
  const rawDoc = await PDFDocument.load(rawPdfBuf);
  console.log("RAW PDF Page Count:", rawDoc.getPageCount());

  // Test trimTrailingBlankPages
  const trimmedBuf = await trimTrailingBlankPages(rawPdfBuf);
  const trimmedDoc = await PDFDocument.load(trimmedBuf);
  console.log("Trimmed PDF Page Count:", trimmedDoc.getPageCount());
}

testTrim().catch(console.error);
