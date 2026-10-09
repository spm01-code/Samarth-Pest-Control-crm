import { exec } from "child_process";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import PizZip from "pizzip";
import { PDFDocument, PDFName } from "pdf-lib";

/**
 * Normalizes paragraph line spacing in DOCX XML from inflated values (e.g. 273 dxa = 1.14x)
 * to standard single line spacing (240 dxa = 1.0x) so LibreOffice on Linux renders documents
 * with exact page boundaries as MS Word without trailing line overflow.
 */
export const normalizeDocxLineSpacing = (docxBuffer) => {
  try {
    if (!docxBuffer || docxBuffer.length === 0) return docxBuffer;
    const zip = new PizZip(docxBuffer);
    if (zip.files["word/document.xml"]) {
      let xmlStr = zip.files["word/document.xml"].asText();
      const updatedXmlStr = xmlStr.replace(/w:line="273"/g, 'w:line="240"');
      if (updatedXmlStr !== xmlStr) {
        zip.file("word/document.xml", updatedXmlStr);
        return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
      }
    }
  } catch (err) {
    console.warn("Could not normalize DOCX line spacing:", err.message);
  }
  return docxBuffer;
};

/**
 * Trims any trailing blank/empty pages from the PDF buffer.
 */
export const trimTrailingBlankPages = async (pdfBuffer) => {
  try {
    if (!pdfBuffer || pdfBuffer.length === 0) return pdfBuffer;
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfDoc.getPageCount();
    if (pageCount <= 1) return pdfBuffer;

    const pagesToRemove = [];

    for (let i = pageCount - 1; i > 0; i--) {
      const page = pdfDoc.getPage(i);
      const node = page.node;

      // Check annotations - if page has annotations, keep it
      const annotsRef = node.get(PDFName.of("Annots"));
      if (annotsRef) {
        const annotsObj = pdfDoc.context.lookup(annotsRef);
        if (annotsObj) {
          // Has annotations (form fields, links, etc.) -> NOT blank
          break;
        }
      }

      const contentsRef = node.get(PDFName.of("Contents"));
      if (!contentsRef) {
        pagesToRemove.push(i);
        continue;
      }

      const contentsObj = pdfDoc.context.lookup(contentsRef);
      let combinedStreamStr = "";

      if (Array.isArray(contentsObj?.array) || (contentsObj && typeof contentsObj.size === "function")) {
        // Contents is a PDFArray of stream references
        const size = typeof contentsObj.size === "function" ? contentsObj.size() : contentsObj.array.length;
        for (let j = 0; j < size; j++) {
          const streamRef = typeof contentsObj.get === "function" ? contentsObj.get(j) : contentsObj.array[j];
          const stream = pdfDoc.context.lookup(streamRef);
          if (stream && stream.contents) {
            combinedStreamStr += Buffer.from(stream.contents).toString("utf8") + "\n";
          } else if (stream && typeof stream.toString === "function") {
            combinedStreamStr += stream.toString() + "\n";
          }
        }
      } else if (contentsObj && contentsObj.contents) {
        combinedStreamStr = Buffer.from(contentsObj.contents).toString("utf8");
      } else if (contentsObj && typeof contentsObj.toString === "function") {
        combinedStreamStr = contentsObj.toString();
      }

      let isBlank = false;
      if (!combinedStreamStr || combinedStreamStr.trim().length === 0) {
        isBlank = true;
      } else {
        const hasTextOrImage = /\b(Tj|TJ|'|"|Do)\b/.test(combinedStreamStr);
        const hasDrawingOps = /\b(re|m|l|c|S|f|B|W|n)\b/.test(combinedStreamStr);
        const nonWhitespaceLen = combinedStreamStr.replace(/\s+/g, "").length;

        // Conservative rule: If it has text/image, drawing operators, or significant stream size (> 50 bytes), it's NOT blank.
        if (!hasTextOrImage && !hasDrawingOps && nonWhitespaceLen <= 50) {
          isBlank = true;
        }
      }

      if (isBlank) {
        pagesToRemove.push(i);
      } else {
        // Stop checking as soon as we hit a non-blank page (only trim trailing pages)
        break;
      }
    }

    if (pagesToRemove.length > 0 && pagesToRemove.length < pageCount) {
      // Sort descending to ensure page index stability during removal
      pagesToRemove.sort((a, b) => b - a);

      for (const pageIdx of pagesToRemove) {
        pdfDoc.removePage(pageIdx);
      }

      const savedBytes = await pdfDoc.save();
      const trimmedBuffer = Buffer.from(savedBytes);

      // Defensive Validation: Verify trimmed PDF is valid and non-empty
      const checkDoc = await PDFDocument.load(trimmedBuffer);
      if (checkDoc.getPageCount() > 0 && trimmedBuffer.length > 0) {
        return trimmedBuffer;
      }
    }
  } catch (err) {
    console.warn("Could not trim blank PDF pages (falling back to original):", err.message);
  }
  return pdfBuffer;
};

/**
 * Finds the LibreOffice executable binary based on OS.
 */
const getLibreOfficeExecutable = () => {
  if (os.platform() !== "win32") {
    return "libreoffice";
  }

  // Windows candidate paths
  const winCandidates = [
    `C:\\Program Files\\LibreOffice\\program\\soffice.exe`,
    `C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe`,
  ];

  for (const candidate of winCandidates) {
    if (fsSync.existsSync(candidate)) {
      return `"${candidate}"`;
    }
  }

  return null;
};

/**
 * Converts DOCX buffer to PDF buffer using LibreOffice, falling back to MS Word PowerShell on Windows if needed.
 */
export const convertDocxToPdf = async (docxBuffer) => {
  const sanitizedDocxBuffer = normalizeDocxLineSpacing(docxBuffer);
  const tempDir = os.tmpdir();
  const tempId = Math.random().toString(36).substring(7);
  const baseFileName = `doc_${tempId}`;
  const inputPath = path.join(tempDir, `${baseFileName}.docx`);
  const outputPath = path.join(tempDir, `${baseFileName}.pdf`);

  await fs.writeFile(inputPath, sanitizedDocxBuffer);

  // Helper for PowerShell fallback on Windows
  const convertWithPowerShell = () => {
    return new Promise((resolve, reject) => {
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

      exec(command, async (error, stdout, stderr) => {
        try {
          await fs.unlink(inputPath);
        } catch (_) {}

        if (error) {
          try {
            await fs.unlink(outputPath);
          } catch (_) {}
          return reject(
            new Error(`DOCX to PDF conversion failed: ${stderr || error.message}`)
          );
        }

        try {
          const pdfBuffer = await fs.readFile(outputPath);
          await fs.unlink(outputPath);
          const trimmedBuffer = await trimTrailingBlankPages(pdfBuffer);
          resolve(trimmedBuffer);
        } catch (readError) {
          reject(
            new Error(`Failed to read converted PDF file: ${readError.message}`)
          );
        }
      });
    });
  };

  // Helper for LibreOffice conversion (Works on Linux VPS & Windows if installed)
  const convertWithLibreOffice = () => {
    return new Promise((resolve, reject) => {
      const libreCmd = getLibreOfficeExecutable();
      if (!libreCmd) {
        if (os.platform() === "win32") {
          return convertWithPowerShell().then(resolve).catch(reject);
        }
        return reject(new Error("LibreOffice executable not found."));
      }

      const profileDir = path.join(tempDir, `lo_prof_${tempId}`);
      const userDir = path.join(profileDir, "user");
      const profileUri = profileDir.replace(/\\/g, "/");

      // Write MS Word layout compatibility settings into LibreOffice isolated user profile
      const setupProfile = async () => {
        try {
          await fs.mkdir(userDir, { recursive: true });
          const xcuContent = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <item oor:path="/org.openoffice.Office.Writer/Layout">
    <prop oor:name="UsePrinterMetrics" oor:op="fuse"><value>true</value></prop>
  </item>
  <item oor:path="/org.openoffice.Office.Common/Filter/PDF/Export">
    <prop oor:name="UseLosslessCompression" oor:op="fuse"><value>false</value></prop>
    <prop oor:name="Quality" oor:op="fuse"><value>95</value></prop>
    <prop oor:name="ReduceImageResolution" oor:op="fuse"><value>false</value></prop>
    <prop oor:name="ExportFormFields" oor:op="fuse"><value>true</value></prop>
  </item>
</oor:items>`;
          await fs.writeFile(path.join(userDir, "registrymodifications.xcu"), xcuContent, "utf8");
        } catch (_) {}
      };

      setupProfile().then(() => {
        const command = `${libreCmd} "-env:UserInstallation=file:///${profileUri}" --headless --convert-to pdf:writer_pdf_Export "${inputPath}" --outdir "${tempDir}"`;

        exec(command, async (error, stdout, stderr) => {
          // Cleanup isolated profile dir
          try {
            await fs.rm(profileDir, { recursive: true, force: true });
          } catch (_) {}

        if (error) {
          // If on Windows, attempt PowerShell fallback
          if (os.platform() === "win32") {
            return convertWithPowerShell().then(resolve).catch(reject);
          }
          try {
            await fs.unlink(inputPath);
          } catch (_) {}
          try {
            await fs.unlink(outputPath);
          } catch (_) {}
          return reject(
            new Error(`LibreOffice conversion failed: ${stderr || error.message}`)
          );
        }

        try {
          await fs.unlink(inputPath);
        } catch (_) {}

        try {
          const pdfBuffer = await fs.readFile(outputPath);
          await fs.unlink(outputPath);
          const trimmedBuffer = await trimTrailingBlankPages(pdfBuffer);
          resolve(trimmedBuffer);
        } catch (readError) {
          if (os.platform() === "win32") {
            return convertWithPowerShell().then(resolve).catch(reject);
          }
          reject(
            new Error(`Failed to read converted PDF file: ${readError.message}`)
          );
        }
        });
      });
    });
  };

  return convertWithLibreOffice();
};
