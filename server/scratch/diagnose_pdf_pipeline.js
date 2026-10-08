import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";
import PizZip from "pizzip";
import { exec } from "child_process";
import { PDFDocument, PDFName } from "pdf-lib";

dotenv.config();

import Quotation from "../model/quotationModel.js";
import DocumentTemplate from "../model/documentTemplateModel.js";
import Customer from "../model/customerModel.js";
import Service from "../model/serviceModel.js";
import CompanySetting from "../model/companySettingModel.js";
import { generateQuotationDocx as generateQuotationDocxFile } from "../utils/docGenerator.js";
import { trimTrailingBlankPages } from "../utils/docxToPdf.js";

const computeSha256 = (buffer) => {
  return crypto.createHash("sha256").update(buffer).digest("hex");
};

const execPromise = (cmd) => {
  return new Promise((resolve) => {
    exec(cmd, (err, stdout, stderr) => {
      resolve({ err, stdout: stdout ? stdout.toString() : "", stderr: stderr ? stderr.toString() : "" });
    });
  });
};

const inspectDocxZip = (docxBuffer) => {
  const zip = new PizZip(docxBuffer);
  const files = zip.files;

  let documentXml = "";
  let stylesXml = "";
  let settingsXml = "";

  if (files["word/document.xml"]) {
    documentXml = files["word/document.xml"].asText();
  }
  if (files["word/styles.xml"]) {
    stylesXml = files["word/styles.xml"].asText();
  }
  if (files["word/settings.xml"]) {
    settingsXml = files["word/settings.xml"].asText();
  }

  // Extract page size <w:pgSz .../>
  const pgSzMatch = documentXml.match(/<w:pgSz[^>]*\/>/);
  // Extract margins <w:pgMar .../>
  const pgMarMatch = documentXml.match(/<w:pgMar[^>]*\/>/);
  // Extract rFonts
  const fontMatches = [...documentXml.matchAll(/<w:rFonts[^>]*\/>/g)].map((m) => m[0]);
  // Extract table properties
  const tblCount = (documentXml.match(/<w:tbl\b/g) || []).length;
  const trCount = (documentXml.match(/<w:tr\b/g) || []).length;

  return {
    documentXmlLength: documentXml.length,
    documentXmlHash: computeSha256(Buffer.from(documentXml)),
    pgSz: pgSzMatch ? pgSzMatch[0] : "NOT_FOUND",
    pgMar: pgMarMatch ? pgMarMatch[0] : "NOT_FOUND",
    fontTagsSample: fontMatches.slice(0, 10),
    tableCount: tblCount,
    rowCount: trCount,
  };
};

const detectConverterEngine = async () => {
  const winCandidates = [
    `C:\\Program Files\\LibreOffice\\program\\soffice.exe`,
    `C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe`,
  ];

  let foundSoffice = null;
  if (process.platform === "win32") {
    for (const candidate of winCandidates) {
      if (fsSync.existsSync(candidate)) {
        foundSoffice = candidate;
        break;
      }
    }
  }

  if (foundSoffice) {
    const verRes = await execPromise(`"${foundSoffice}" --version`);
    return {
      type: "LibreOffice (Windows)",
      executable: foundSoffice,
      version: verRes.stdout.trim() || verRes.stderr.trim(),
      command: `"${foundSoffice}" --headless --convert-to pdf`,
    };
  }

  if (process.platform === "win32") {
    const psTest = await execPromise(
      `powershell -NoProfile -Command "(New-Object -ComObject Word.Application).Version"`
    );
    return {
      type: "Microsoft Word COM via PowerShell",
      executable: "PowerShell COM (Word.Application)",
      version: psTest.stdout.trim() ? `MS Word Version: ${psTest.stdout.trim()}` : "MS Word COM Available",
      command: `PowerShell COM Word.Application -> SaveAs(17)`,
    };
  }

  const linuxLo = await execPromise("libreoffice --version");
  return {
    type: "LibreOffice (Linux)",
    executable: "libreoffice",
    version: linuxLo.stdout.trim() || linuxLo.stderr.trim(),
    command: "libreoffice --headless --convert-to pdf",
  };
};

const convertDocxToRawPdfCustom = async (docxBuffer, converterInfo) => {
  const tempDir = path.resolve("./scratch");
  if (!fsSync.existsSync(tempDir)) {
    await fs.mkdir(tempDir, { recursive: true });
  }
  const tempId = Math.random().toString(36).substring(7);
  const inputPath = path.join(tempDir, `raw_test_${tempId}.docx`);
  const outputPath = path.join(tempDir, `raw_test_${tempId}.pdf`);

  await fs.writeFile(inputPath, docxBuffer);

  if (converterInfo.type.includes("LibreOffice")) {
    const profileDir = path.join(tempDir, `lo_prof_${tempId}`);
    const profileUri = profileDir.replace(/\\/g, "/");
    const libreCmd = converterInfo.executable === "libreoffice" ? "libreoffice" : `"${converterInfo.executable}"`;
    const cmd = `${libreCmd} "-env:UserInstallation=file:///${profileUri}" --headless --convert-to pdf "${inputPath}" --outdir "${tempDir}"`;
    await execPromise(cmd);
    try {
      await fs.rm(profileDir, { recursive: true, force: true });
    } catch (_) {}
  } else {
    // PowerShell Word COM
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
    await execPromise(command);
  }

  let pdfBuffer = null;
  try {
    pdfBuffer = await fs.readFile(outputPath);
  } catch (e) {
    console.error("RAW PDF read error:", e.message);
  }

  try {
    await fs.unlink(inputPath);
  } catch (_) {}
  try {
    await fs.unlink(outputPath);
  } catch (_) {}

  return pdfBuffer;
};

const inspectPdfBuffer = async (pdfBuffer) => {
  if (!pdfBuffer) return null;
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();
  const pagesDetails = [];

  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();
    const mediaBox = page.getMediaBox();
    const cropBox = page.getCropBox();

    pagesDetails.push({
      pageIndex: i + 1,
      width,
      height,
      mediaBox,
      cropBox,
    });
  }

  // Extract font references from PDF catalog context
  const fontNames = new Set();
  const pdfContext = pdfDoc.context;
  for (const [ref, obj] of pdfContext.enumerateIndirectObjects()) {
    if (obj && typeof obj.get === "function") {
      const type = obj.get(PDFName.of("Type"));
      const subtype = obj.get(PDFName.of("Subtype"));
      const baseFont = obj.get(PDFName.of("BaseFont"));
      if (type && type.toString() === "/Font") {
        const fontName = baseFont ? baseFont.toString() : subtype ? subtype.toString() : "UnknownFont";
        fontNames.add(fontName);
      }
    }
  }

  return {
    pageCount,
    pagesDetails,
    fonts: Array.from(fontNames),
    byteLength: pdfBuffer.length,
    sha256: computeSha256(pdfBuffer),
  };
};

async function runDiagnostics() {
  const envLabel = process.env.IS_LIVE === "true" ? "LIVE (Hostinger VPS)" : "LOCAL Baseline";
  console.log("=================================================");
  console.log(`STARTING PDF PIPELINE DIAGNOSTICS (${envLabel})`);
  console.log("=================================================");

  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI environment variable missing!");
    return;
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  let sampleQuotation = null;
  const payloadPath = "./scratch/sample_quotation_input_payload.json";

  if (fsSync.existsSync(payloadPath)) {
    console.log(`Loading pre-captured input payload from ${payloadPath} for exact input parity...`);
    const rawPayload = await fs.readFile(payloadPath, "utf8");
    sampleQuotation = JSON.parse(rawPayload);
  } else {
    const pcQuotation = await Quotation.findOne({ quotationType: "PC" })
      .populate("customer")
      .populate("services")
      .sort({ createdAt: -1 });

    sampleQuotation = pcQuotation ? pcQuotation.toObject() : null;

    if (sampleQuotation) {
      await fs.writeFile(payloadPath, JSON.stringify(sampleQuotation, null, 2));
      console.log(`Captured sample quotation payload to ${payloadPath}`);
    }
  }

  if (!sampleQuotation) {
    console.error("No sample quotation available.");
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    return;
  }

  // 1. Find all active Templates
  let allTemplatesInfo = [];
  if (mongoose.connection.readyState !== 0) {
    const allTemplates = await DocumentTemplate.find({ isActive: true });
    for (const tmpl of allTemplates) {
      const rawPath = tmpl.filePath || "";
      const normalizedFilePath = rawPath.replace(/\\/g, "/");
      const diskFileName = path.basename(normalizedFilePath);
      const candidatePaths = [
        rawPath,
        normalizedFilePath,
        path.resolve(process.cwd(), normalizedFilePath),
        path.resolve(process.cwd(), "uploads", "templates", diskFileName),
        path.resolve(process.cwd(), "server", "uploads", "templates", diskFileName),
        path.resolve(process.cwd(), "templates", diskFileName),
        path.resolve(process.cwd(), "server", "templates", diskFileName),
      ];
      const resolvedPath = candidatePaths.find((p) => p && fsSync.existsSync(p));
      let sha256 = "FILE_NOT_FOUND";
      let size = 0;
      if (resolvedPath) {
        const buf = await fs.readFile(resolvedPath);
        sha256 = computeSha256(buf);
        size = buf.length;
      }
      allTemplatesInfo.push({
        id: tmpl._id.toString(),
        documentType: tmpl.documentType,
        fileName: tmpl.fileName,
        resolvedPath,
        size,
        sha256,
      });
    }
  }

  console.log("\n[STAGE 1] ACTIVE TEMPLATES INFO:", allTemplatesInfo);

  // 2. Input Payload Summary
  const inputPayloadSummary = {
    id: sampleQuotation._id ? sampleQuotation._id.toString() : "N/A",
    quotationNumber: sampleQuotation.quotationNumber || sampleQuotation.quoteNumber,
    customerName: sampleQuotation.customer?.companyName || sampleQuotation.customer?.fullName || "N/A",
    serviceCount: Array.isArray(sampleQuotation.services) ? sampleQuotation.services.length : 0,
    totalAmount: sampleQuotation.totalAmount,
    quotationType: sampleQuotation.quotationType || "PC",
  };
  console.log("\n[STAGE 2] INPUT PAYLOAD SUMMARY:", inputPayloadSummary);

  // 3. Generate Populated DOCX
  const docxResult = await generateQuotationDocxFile(sampleQuotation);
  const populatedDocxBuffer = docxResult.buffer;
  const docxFileName = process.env.IS_LIVE === "true" ? "./scratch/populated_live.docx" : "./scratch/populated_local.docx";
  await fs.writeFile(docxFileName, populatedDocxBuffer);
  const populatedDocxHash = computeSha256(populatedDocxBuffer);
  const xmlDetails = inspectDocxZip(populatedDocxBuffer);

  console.log("\n[STAGE 3] POPULATED DOCX METRICS:");
  console.log(`- File Saved: ${docxFileName}`);
  console.log(`- Size: ${populatedDocxBuffer.length} bytes`);
  console.log(`- SHA-256: ${populatedDocxHash}`);
  console.log(`- document.xml Hash: ${xmlDetails.documentXmlHash}`);
  console.log(`- Page Size Tag (<w:pgSz>): ${xmlDetails.pgSz}`);
  console.log(`- Page Margins Tag (<w:pgMar>): ${xmlDetails.pgMar}`);
  console.log(`- Table Count: ${xmlDetails.tableCount}, Row Count: ${xmlDetails.rowCount}`);

  // 4. Detect Converter Engine
  const converterInfo = await detectConverterEngine();
  console.log("\n[STAGE 4] PDF CONVERTER ENGINE:");
  console.log(`- Type: ${converterInfo.type}`);
  console.log(`- Executable: ${converterInfo.executable}`);
  console.log(`- Version: ${converterInfo.version}`);
  console.log(`- Command: ${converterInfo.command}`);

  // 5. Generate RAW PDF
  const rawPdfBuffer = await convertDocxToRawPdfCustom(populatedDocxBuffer, converterInfo);
  let rawPdfDetails = null;
  const rawPdfFileName = process.env.IS_LIVE === "true" ? "./scratch/raw_live.pdf" : "./scratch/raw_local.pdf";
  if (rawPdfBuffer) {
    await fs.writeFile(rawPdfFileName, rawPdfBuffer);
    rawPdfDetails = await inspectPdfBuffer(rawPdfBuffer);
  }

  console.log("\n[STAGE 5] RAW PDF METRICS:");
  console.log(rawPdfDetails);

  // 6. Generate FINAL PDF
  let finalPdfDetails = null;
  const finalPdfFileName = process.env.IS_LIVE === "true" ? "./scratch/final_live.pdf" : "./scratch/final_local.pdf";
  if (rawPdfBuffer) {
    const finalPdfBuffer = await trimTrailingBlankPages(rawPdfBuffer);
    await fs.writeFile(finalPdfFileName, finalPdfBuffer);
    finalPdfDetails = await inspectPdfBuffer(finalPdfBuffer);
  }

  console.log("\n[STAGE 6] FINAL PDF METRICS:");
  console.log(finalPdfDetails);

  // Save diagnostic matrix JSON
  const matrixFileName = process.env.IS_LIVE === "true" ? "./scratch/live_diagnostic_matrix.json" : "./scratch/local_diagnostic_matrix.json";
  const diagnosticResults = {
    envLabel,
    allTemplatesInfo,
    inputPayloadSummary,
    populatedDocx: {
      size: populatedDocxBuffer.length,
      sha256: populatedDocxHash,
      xmlDetails,
    },
    converterInfo,
    rawPdf: rawPdfDetails,
    finalPdf: finalPdfDetails,
  };

  await fs.writeFile(matrixFileName, JSON.stringify(diagnosticResults, null, 2));

  console.log(`\nSaved full diagnostic metrics to ${matrixFileName}`);

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log("MongoDB disconnected.");
  }
}

runDiagnostics().catch((err) => {
  console.error("Diagnostic execution error:", err);
  if (mongoose.connection.readyState !== 0) mongoose.disconnect();
});
