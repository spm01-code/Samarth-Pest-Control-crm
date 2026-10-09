import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import PizZip from "pizzip";
import { exec } from "child_process";
import { PDFDocument } from "pdf-lib";

const execPromise = (cmd) => {
  return new Promise((resolve) => {
    exec(cmd, (err, stdout, stderr) => {
      resolve({ err, stdout: stdout ? stdout.toString() : "", stderr: stderr ? stderr.toString() : "" });
    });
  });
};

async function testLineSpacingFix() {
  const scratchDir = path.resolve("./scratch");
  const inputDocx = path.join(scratchDir, "populated_local.docx");
  if (!fsSync.existsSync(inputDocx)) {
    console.log("populated_local.docx not found");
    return;
  }

  const content = await fs.readFile(inputDocx);
  const zip = new PizZip(content);

  let docXml = zip.files["word/document.xml"].asText();

  // Replace w:spacing w:line="273" with w:spacing w:line="240"
  console.log("Original document.xml length:", docXml.length);
  const updatedDocXml = docXml.replace(/w:line="273"/g, 'w:line="240"');

  zip.file("word/document.xml", updatedDocXml);
  const modifiedDocxBuffer = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });

  const testDocxPath = path.join(scratchDir, "test_spacing_240.docx");
  const testPdfPath = path.join(scratchDir, "test_spacing_240.pdf");
  await fs.writeFile(testDocxPath, modifiedDocxBuffer);

  console.log("Saved test_spacing_240.docx. Converting with PowerShell COM Word...");

  const psCommand = `
    $word = New-Object -ComObject Word.Application;
    $word.Visible = $false;
    $word.DisplayAlerts = 0;
    try {
      $doc = $word.Documents.Open('${testDocxPath.replace(/\\/g, "\\\\")}', $false, $true);
      $doc.SaveAs('${testPdfPath.replace(/\\/g, "\\\\")}', 17);
      $doc.Close(0);
    } finally {
      $word.Quit();
      [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null;
    }
  `;
  await execPromise(`powershell -NoProfile -Command "${psCommand.replace(/\n/g, " ")}"`);

  if (fsSync.existsSync(testPdfPath)) {
    const pdfBuf = await fs.readFile(testPdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuf);
    console.log("Modified PDF Page Count:", pdfDoc.getPageCount());
  }
}

testLineSpacingFix().catch(console.error);
