import { exec } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";

export const convertDocxToPdf = async (docxBuffer) => {
  const tempDir = os.tmpdir();
  const tempId = Math.random().toString(36).substring(7);
  const inputPath = path.join(tempDir, `input_${tempId}.docx`);
  const outputPath = path.join(tempDir, `output_${tempId}.pdf`);

  await fs.writeFile(inputPath, docxBuffer);

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

    const command = `powershell -NoProfile -Command "${psCommand.replace(/\n/g, ' ')}"`;

    exec(command, async (error, stdout, stderr) => {
      try {
        await fs.unlink(inputPath);
      } catch (unlinkError) {
        console.error("Failed to delete temp input file:", unlinkError);
      }

      if (error) {
        // Make sure we also try to clean up the output if it was created
        try {
          await fs.unlink(outputPath);
        } catch (_) {}
        return reject(new Error(`DOCX to PDF conversion failed: ${stderr || error.message}`));
      }

      try {
        const pdfBuffer = await fs.readFile(outputPath);
        await fs.unlink(outputPath);
        resolve(pdfBuffer);
      } catch (readError) {
        reject(new Error(`Failed to read converted PDF file: ${readError.message}`));
      }
    });
  });
};
