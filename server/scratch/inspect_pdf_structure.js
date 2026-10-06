/**
 * PDF Structure Inspector — Uses the actual convertDocxToPdf pipeline
 * but intercepts the raw PDF BEFORE trimming to inspect structure.
 *
 * Works on Windows (via PowerShell/Word fallback) and Linux (via LibreOffice).
 */

import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { PDFDocument, PDFName, PDFArray, PDFRawStream, PDFRef, PDFStream } from "pdf-lib";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

const getLibreOfficeExecutable = () => {
  if (os.platform() !== "win32") return "libreoffice";
  const candidates = [
    `C:\\Program Files\\LibreOffice\\program\\soffice.exe`,
    `C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe`,
  ];
  for (const c of candidates) {
    if (fsSync.existsSync(c)) return `"${c}"`;
  }
  return null;
};

/** Convert DOCX buffer to RAW PDF buffer (no trimming) */
const convertToRawPdf = (docxBuffer) => {
  return new Promise((resolve, reject) => {
    const tempDir = os.tmpdir();
    const tempId = Math.random().toString(36).substring(7);
    const baseFileName = `diag_${tempId}`;
    const inputPath = path.join(tempDir, `${baseFileName}.docx`);
    const outputPath = path.join(tempDir, `${baseFileName}.pdf`);

    fs.writeFile(inputPath, docxBuffer).then(() => {
      const libreCmd = getLibreOfficeExecutable();

      if (libreCmd) {
        // LibreOffice path
        const profileDir = path.join(tempDir, `lo_prof_${tempId}`);
        const profileUri = profileDir.replace(/\\/g, "/");
        const command = `${libreCmd} "-env:UserInstallation=file:///${profileUri}" --headless --convert-to pdf "${inputPath}" --outdir "${tempDir}"`;
        console.log("Using LibreOffice:", command);

        exec(command, async (error, stdout, stderr) => {
          try { await fs.rm(profileDir, { recursive: true, force: true }); } catch(_) {}
          try { await fs.unlink(inputPath); } catch(_) {}
          if (error) return reject(new Error(`LibreOffice failed: ${stderr || error.message}`));
          try {
            const pdf = await fs.readFile(outputPath);
            await fs.unlink(outputPath);
            resolve({ pdf, converter: "LibreOffice" });
          } catch(e) { reject(e); }
        });
      } else if (os.platform() === "win32") {
        // PowerShell / MS Word fallback
        const escapedInput = inputPath.replace(/\\/g, "\\\\").replace(/'/g, "''");
        const escapedOutput = outputPath.replace(/\\/g, "\\\\").replace(/'/g, "''");
        const psCommand = `
          $word = New-Object -ComObject Word.Application;
          $word.Visible = $false;
          $word.DisplayAlerts = 0;
          try {
            $doc = $word.Documents.Open('${escapedInput}', $false, $true);
            $doc.SaveAs('${escapedOutput}', 17);
            $doc.Close(0);
          } finally {
            $word.Quit();
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null;
          }
        `;
        const command = `powershell -NoProfile -Command "${psCommand.replace(/\n/g, " ")}"`;
        console.log("Using MS Word via PowerShell");

        exec(command, async (error, stdout, stderr) => {
          try { await fs.unlink(inputPath); } catch(_) {}
          if (error) {
            try { await fs.unlink(outputPath); } catch(_) {}
            return reject(new Error(`Word failed: ${stderr || error.message}`));
          }
          try {
            const pdf = await fs.readFile(outputPath);
            await fs.unlink(outputPath);
            resolve({ pdf, converter: "MS Word (PowerShell)" });
          } catch(e) { reject(e); }
        });
      } else {
        reject(new Error("No converter available"));
      }
    });
  });
};

const inspectPdfStructure = async (pdfBuffer, label) => {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`PDF STRUCTURE INSPECTION: ${label}`);
  console.log(`${"=".repeat(70)}`);
  console.log(`Buffer size: ${pdfBuffer.length} bytes`);

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();
  console.log(`Total page count: ${pageCount}`);

  for (let i = 0; i < pageCount; i++) {
    console.log(`\n--- Page ${i + 1} / ${pageCount} ---`);
    const page = pdfDoc.getPage(i);
    const { width, height } = page.getSize();
    console.log(`Page dimensions: ${width} x ${height}`);

    const node = page.node;
    const contentsRef = node.get(PDFName.of("Contents"));

    if (!contentsRef) {
      console.log("⚠️  No Contents reference — page has no content stream");
      console.log("🔍 CURRENT LOGIC: would classify as BLANK ✓ (correct — truly empty)");
      continue;
    }

    console.log(`Contents ref type: ${contentsRef?.constructor?.name}`);

    const contentsObj = pdfDoc.context.lookup(contentsRef);
    console.log(`Contents object type: ${contentsObj?.constructor?.name}`);

    const isArray = contentsObj instanceof PDFArray;
    console.log(`Is PDFArray: ${isArray}`);

    // ---- Extract combined content ----
    let combinedContent = "";
    let totalStreamBytes = 0;

    if (isArray) {
      const arrSize = contentsObj.size();
      console.log(`Array contains ${arrSize} stream(s)`);
      for (let j = 0; j < arrSize; j++) {
        const ref = contentsObj.get(j);
        const stream = pdfDoc.context.lookup(ref);
        if (stream && stream.contents) {
          const bytes = stream.contents;
          totalStreamBytes += bytes.length;
          combinedContent += Buffer.from(bytes).toString("utf8");
          console.log(`  [${j}] ${stream.constructor.name} — ${bytes.length} bytes`);
        } else {
          console.log(`  [${j}] ${stream?.constructor?.name || "null"} — NO .contents`);
        }
      }
    } else if (contentsObj && contentsObj.contents) {
      totalStreamBytes = contentsObj.contents.length;
      combinedContent = Buffer.from(contentsObj.contents).toString("utf8");
      console.log(`Single stream: ${contentsObj.constructor.name} — ${totalStreamBytes} bytes`);
    } else {
      console.log(`⚠️  Unknown Contents structure`);
      if (contentsObj) {
        console.log("  constructor:", contentsObj.constructor?.name);
        console.log("  keys:", Object.keys(contentsObj).slice(0, 10));
      }
    }

    const hasTextOps = /\b(Tj|TJ|'|"|Do)\b/.test(combinedContent);
    const hasDrawOps = /\b(re|m|l|c|S|f|B|W|n)\b/.test(combinedContent);
    const nonWS = combinedContent.replace(/\s+/g, "").length;

    console.log(`Combined content: ${combinedContent.length} chars, ${nonWS} non-whitespace`);
    console.log(`Has text/image operators (Tj/TJ/Do): ${hasTextOps}`);
    console.log(`Has drawing operators (re/m/l/S/f): ${hasDrawOps}`);

    // Annotations
    const annotsRef = node.get(PDFName.of("Annots"));
    if (annotsRef) {
      const annots = pdfDoc.context.lookup(annotsRef);
      const count = annots instanceof PDFArray ? annots.size() : "?";
      console.log(`Annotations: ${count}`);
    } else {
      console.log(`Annotations: none`);
    }

    // ---- Simulate CURRENT trimTrailingBlankPages logic ----
    let currentLogicBlank = false;
    {
      const cs = pdfDoc.context.lookup(contentsRef);
      let str = "";
      if (cs && cs.contents) {
        str = Buffer.from(cs.contents).toString("utf8");
      } else if (cs && typeof cs.toString === "function") {
        str = cs.toString();
      }
      currentLogicBlank = !/\b(Tj|TJ|'|"|Do)\b/.test(str);
    }

    console.log(`\n🔍 CURRENT trimTrailingBlankPages logic → blank: ${currentLogicBlank}`);
    if (currentLogicBlank && (hasTextOps || nonWS > 50)) {
      console.log(`❌ BUG CONFIRMED: Page has content (${nonWS} non-ws bytes, text ops: ${hasTextOps}) but CURRENT logic misclassifies as BLANK!`);
      console.log(`   ROOT CAUSE: Contents is ${isArray ? "PDFArray" : contentsObj?.constructor?.name} — current code does not handle arrays`);
    } else if (!currentLogicBlank) {
      console.log(`✅ Page correctly identified as non-blank by current logic`);
    } else {
      console.log(`✅ Page appears genuinely blank (${nonWS} non-ws bytes, no text ops)`);
    }
  }
};

// ---- Main ----
const run = async () => {
  try {
    const templatesDir = path.resolve(process.cwd(), "uploads", "templates");
    const files = (await fs.readdir(templatesDir)).filter(f => f.endsWith(".docx"));

    if (files.length === 0) {
      console.log("No template files found in", templatesDir);
      process.exit(1);
    }

    console.log(`Found ${files.length} templates. Testing first 3...\n`);

    for (const file of files.slice(0, 3)) {
      console.log(`\n${"#".repeat(70)}`);
      console.log(`# Template: ${file}`);
      console.log(`${"#".repeat(70)}`);

      const filePath = path.join(templatesDir, file);
      const content = (await fs.readFile(filePath)).toString("binary");
      const zip = new PizZip(content);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
      doc.render({});
      const docxBuffer = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
      console.log(`DOCX buffer: ${docxBuffer.length} bytes`);

      const { pdf, converter } = await convertToRawPdf(docxBuffer);
      console.log(`Converter used: ${converter}`);

      await inspectPdfStructure(pdf, `${file} (${converter})`);
    }
  } catch (err) {
    console.error("Fatal:", err);
  }
  process.exit(0);
};

run();
