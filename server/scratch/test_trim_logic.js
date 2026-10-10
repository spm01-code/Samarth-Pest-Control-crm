import fs from "fs";
import path from "path";
import zlib from "zlib";
import { PDFDocument, PDFName } from "pdf-lib";

export const isPageBlank = (page, pdfDoc) => {
  const node = page.node;

  // 1. Check annotations (Form fields, links, etc.)
  const annotsRef = node.get(PDFName.of("Annots"));
  if (annotsRef) {
    const annotsObj = pdfDoc.context.lookup(annotsRef);
    if (annotsObj) {
      if (Array.isArray(annotsObj.array) && annotsObj.array.length > 0) return false;
      if (typeof annotsObj.size === "function" && annotsObj.size() > 0) return false;
    }
  }

  // 2. Extract and decompress page content streams
  const contentsRef = node.get(PDFName.of("Contents"));
  if (!contentsRef) return true;

  const contentsObj = pdfDoc.context.lookup(contentsRef);
  if (!contentsObj) return true;

  let rawBuffers = [];

  const extractStreamBytes = (streamObj) => {
    if (!streamObj) return;
    if (typeof streamObj.getContents === "function") {
      rawBuffers.push(Buffer.from(streamObj.getContents()));
    } else if (streamObj.contents) {
      rawBuffers.push(Buffer.from(streamObj.contents));
    }
  };

  if (Array.isArray(contentsObj.array) || typeof contentsObj.size === "function") {
    const size = typeof contentsObj.size === "function" ? contentsObj.size() : contentsObj.array.length;
    for (let j = 0; j < size; j++) {
      const ref = typeof contentsObj.get === "function" ? contentsObj.get(j) : contentsObj.array[j];
      const streamObj = pdfDoc.context.lookup(ref);
      extractStreamBytes(streamObj);
    }
  } else {
    extractStreamBytes(contentsObj);
  }

  let fullStreamText = "";
  for (const buf of rawBuffers) {
    if (!buf || buf.length === 0) continue;
    let decoded = "";
    try {
      decoded = zlib.inflateSync(buf).toString("latin1");
    } catch (_) {
      try {
        decoded = zlib.unzipSync(buf).toString("latin1");
      } catch (_) {
        try {
          decoded = zlib.rawInflateSync(buf).toString("latin1");
        } catch (_) {
          decoded = buf.toString("latin1");
        }
      }
    }
    fullStreamText += decoded + "\n";
  }

  if (!fullStreamText || fullStreamText.trim().length === 0) return true;

  // 3. Check for XObject invocation (Images / Form XObjects)
  if (/\bDo\b/.test(fullStreamText)) return false;

  // 4. Check for Path Painting / Fill / Stroke operators
  // Painting operators: f, F, f*, S, s, B, B*, b, b*, sh
  if (/\b(f|F|f\*|S|s|B|B\*|b|b\*|sh)\b/.test(fullStreamText)) return false;

  // 5. Check for actual visible text contents in Tj / TJ / ' / " operators
  const textMatches = fullStreamText.match(/\[(.*?)\]\s*TJ|\((.*?)\)\s*Tj|/g) || [];
  let visibleTextCharCount = 0;

  // Match all Tj, TJ, ', " text strings
  const tjRegex = /\[([\s\S]*?)\]\s*TJ|\(([\s\S]*?)\)\s*Tj|<([0-9a-fA-F\s]+)>\s*Tj/g;
  let match;
  while ((match = tjRegex.exec(fullStreamText)) !== null) {
    const rawContent = match[1] || match[2] || match[3] || "";
    // Remove kerning numbers, hex character codes like <0003>, whitespace, spaces
    const cleaned = rawContent
      .replace(/-?\d+(\.\d+)?/g, "")
      .replace(/<[0-9a-fA-F]+>/g, (hexMatch) => {
        // <0003> or <0000> are space character encodings in embedded fonts
        const hexStr = hexMatch.replace(/[<>]/g, "");
        if (hexStr === "0003" || hexStr === "0000" || hexStr === "0020") return "";
        return hexStr;
      })
      .replace(/[\(\)\[\]\s\\\r\n]/g, "");

    if (cleaned.length > 0) {
      visibleTextCharCount += cleaned.length;
    }
  }

  return visibleTextCharCount === 0;
};

// Test function on scratch PDFs
async function runTest() {
  const scratchFiles = fs.readdirSync("server/scratch").filter(f => f.endsWith(".pdf"));
  console.log("=== TESTING ISPAGEBLANK LOGIC ON ALL SCRATCH PDFs ===");

  for (const filename of scratchFiles) {
    const filePath = path.join("server", "scratch", filename);
    const bytes = fs.readFileSync(filePath);
    const doc = await PDFDocument.load(bytes);
    console.log(`\nPDF File: ${filename} (Total Pages: ${doc.getPageCount()})`);
    for (let i = 0; i < doc.getPageCount(); i++) {
      const page = doc.getPage(i);
      const blank = isPageBlank(page, doc);
      console.log(` - Page ${i + 1}: isBlank = ${blank}`);
    }
  }
}

runTest().catch(console.error);
