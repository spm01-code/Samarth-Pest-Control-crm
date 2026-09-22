import { exec } from "child_process";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";

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

  return "soffice"; // Fallback to system PATH
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
          resolve(pdfBuffer);
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
          resolve(pdfBuffer);
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
