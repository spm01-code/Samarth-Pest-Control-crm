import { exec } from "child_process";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import { PDFDocument, PDFName } from "pdf-lib";

/**
 * Trims any trailing blank/empty pages from the PDF buffer.
 */
export const trimTrailingBlankPages = async (pdfBuffer) => {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfDoc.getPageCount();
    if (pageCount <= 1) return pdfBuffer;

    const pagesToRemove = [];

    for (let i = pageCount - 1; i > 0; i--) {
      const page = pdfDoc.getPage(i);
      const node = page.node;
      const contentsRef = node.get(PDFName.of("Contents"));

      let isBlank = false;
      if (!contentsRef) {
        isBlank = true;
      } else {
        const contentStream = pdfDoc.context.lookup(contentsRef);
        let streamStr = "";
        if (contentStream && contentStream.contents) {
          streamStr = Buffer.from(contentStream.contents).toString("utf8");
        } else if (contentStream && typeof contentStream.toString === "function") {
          streamStr = contentStream.toString();
        }

        const hasTextOrImage = /\b(Tj|TJ|'|"|Do)\b/.test(streamStr);
        if (!hasTextOrImage) {
          isBlank = true;
        }
      }

      if (isBlank) {
        pagesToRemove.push(i);
      } else {
        break;
      }
    }

    if (pagesToRemove.length > 0 && pagesToRemove.length < pageCount) {
      for (const pageIdx of pagesToRemove) {
        pdfDoc.removePage(pageIdx);
      }
      const savedBytes = await pdfDoc.save();
      return Buffer.from(savedBytes);
    }
  } catch (err) {
    console.warn("Could not trim blank PDF pages:", err.message);
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
      const profileUri = profileDir.replace(/\\/g, "/");
      const command = `${libreCmd} "-env:UserInstallation=file:///${profileUri}" --headless --convert-to pdf "${inputPath}" --outdir "${tempDir}"`;

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
  };

  return convertWithLibreOffice();
};
