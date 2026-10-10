import zlib from "zlib";
import { exec } from "child_process";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import { PDFDocument, PDFName } from "pdf-lib";

/**
 * Determines whether a PDF page is genuinely blank (contains no visible text, images, path fills/strokes, or annotations).
 */
const isPdfPageBlank = (page, pdfDoc) => {
  try {
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

    const rawBuffers = [];

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

    // 4. Check for Path Painting / Fill / Stroke operators (f, F, f*, S, s, B, B*, b, b*, sh)
    if (/\b(f|F|f\*|S|s|B|B\*|b|b\*|sh)\b/.test(fullStreamText)) return false;

    // 5. Check for actual visible text contents in Tj / TJ / ' / " operators
    const tjRegex = /\[([\s\S]*?)\]\s*TJ|\(([\s\S]*?)\)\s*Tj|<([0-9a-fA-F\s]+)>\s*Tj/g;
    let visibleTextCharCount = 0;
    let match;

    while ((match = tjRegex.exec(fullStreamText)) !== null) {
      const rawContent = match[1] || match[2] || match[3] || "";
      const cleaned = rawContent
        .replace(/-?\d+(\.\d+)?/g, "")
        .replace(/<[0-9a-fA-F]+>/g, (hexMatch) => {
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
  } catch (err) {
    console.warn("isPdfPageBlank analysis error:", err.message);
    return false; // Safely default to keeping the page if analysis fails
  }
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
      const isBlank = isPdfPageBlank(page, pdfDoc);

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
  const tempDir = os.tmpdir();
  const tempId = Math.random().toString(36).substring(7);
  const baseFileName = `doc_${tempId}`;
  const inputPath = path.join(tempDir, `${baseFileName}.docx`);
  const outputPath = path.join(tempDir, `${baseFileName}.pdf`);

  await fs.writeFile(inputPath, docxBuffer);

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
