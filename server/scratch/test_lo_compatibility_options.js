import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { exec } from "child_process";
import { PDFDocument, PDFName } from "pdf-lib";

const execPromise = (cmd) => {
  return new Promise((resolve) => {
    exec(cmd, (err, stdout, stderr) => {
      resolve({ err, stdout: stdout ? stdout.toString() : "", stderr: stderr ? stderr.toString() : "" });
    });
  });
};

async function testLoCompatibility() {
  const scratchDir = path.resolve("./scratch");
  const docxPath = path.join(scratchDir, "populated_local.docx");
  if (!fsSync.existsSync(docxPath)) {
    console.log("populated_local.docx not found");
    return;
  }

  const profileDir = path.join(scratchDir, "lo_compat_prof");
  const userDir = path.join(profileDir, "user");
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

  const profileUri = profileDir.replace(/\\/g, "/");
  const outputPath = path.join(scratchDir, "lo_compat_out.pdf");

  const winLo = `C:\\Program Files\\LibreOffice\\program\\soffice.exe`;
  const libreCmd = fsSync.existsSync(winLo) ? `"${winLo}"` : "libreoffice";

  console.log("Testing LibreOffice execution with profile...");
  const cmd = `${libreCmd} "-env:UserInstallation=file:///${profileUri}" --headless --convert-to pdf "${docxPath}" --outdir "${scratchDir}"`;

  const res = await execPromise(cmd);
  console.log("LibreOffice stdout/stderr:", res.stdout || res.stderr || res.err);

  if (fsSync.existsSync(outputPath)) {
    const pdfBuf = await fs.readFile(outputPath);
    const pdfDoc = await PDFDocument.load(pdfBuf);
    console.log("\nLibreOffice PDF Page Count:", pdfDoc.getPageCount());

    const fontNames = new Set();
    for (const [ref, obj] of pdfDoc.context.enumerateIndirectObjects()) {
      if (obj && typeof obj.get === "function") {
        const type = obj.get(PDFName.of("Type"));
        const baseFont = obj.get(PDFName.of("BaseFont"));
        if (type && type.toString() === "/Font") {
          fontNames.add(baseFont ? baseFont.toString() : "Unknown");
        }
      }
    }
    console.log("Embedded PDF Fonts:", Array.from(fontNames));
  } else {
    console.log("LibreOffice binary not found on local Windows machine.");
  }
}

testLoCompatibility().catch(console.error);
