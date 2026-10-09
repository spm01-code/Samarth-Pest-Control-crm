import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { exec } from "child_process";
import { PDFDocument } from "pdf-lib";

const execPromise = (cmd) => {
  return new Promise((resolve) => {
    exec(cmd, (err, stdout, stderr) => {
      resolve({ err, stdout: stdout ? stdout.toString() : "", stderr: stderr ? stderr.toString() : "" });
    });
  });
};

const createLoProfile = async (profileDir) => {
  const userDir = path.join(profileDir, "user");
  await fs.mkdir(userDir, { recursive: true });

  // registrymodifications.xcu with Word compatibility options
  const xcuContent = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <item oor:path="/org.openoffice.Office.Writer/Layout">
    <prop oor:name="UsePrinterMetrics" oor:op="fuse"><value>true</value></prop>
  </item>
  <item oor:path="/org.openoffice.Office.Common/Filter/PDF/Export">
    <prop oor:name="UseLosslessCompression" oor:op="fuse"><value>false</value></prop>
    <prop oor:name="Quality" oor:op="fuse"><value>90</value></prop>
    <prop oor:name="ReduceImageResolution" oor:op="fuse"><value>false</value></prop>
    <prop oor:name="ExportFormFields" oor:op="fuse"><value>true</value></prop>
    <prop oor:name="ExportBookmarks" oor:op="fuse"><value>true</value></prop>
  </item>
</oor:items>`;

  await fs.writeFile(path.join(userDir, "registrymodifications.xcu"), xcuContent, "utf8");
};

async function testLibreOfficeProfile() {
  const tempDir = path.resolve("./scratch");
  const docxPath = path.join(tempDir, "populated_local.docx");
  if (!fsSync.existsSync(docxPath)) {
    console.log("populated_local.docx not found in scratch");
    return;
  }

  const profileDir = path.join(tempDir, "test_lo_prof");
  await createLoProfile(profileDir);

  const profileUri = profileDir.replace(/\\/g, "/");
  const outputPath = path.join(tempDir, "test_profile_out.pdf");

  // Run LibreOffice if available
  const winLo = `C:\\Program Files\\LibreOffice\\program\\soffice.exe`;
  const libreCmd = fsSync.existsSync(winLo) ? `"${winLo}"` : "libreoffice";

  console.log("Running LibreOffice command...");
  const cmd = `${libreCmd} "-env:UserInstallation=file:///${profileUri}" --headless --convert-to pdf:writer_pdf_Export "${docxPath}" --outdir "${tempDir}"`;

  const res = await execPromise(cmd);
  console.log("LibreOffice output:", res.stdout || res.stderr || res.err);

  if (fsSync.existsSync(outputPath)) {
    const pdfBuf = await fs.readFile(outputPath);
    const pdfDoc = await PDFDocument.load(pdfBuf);
    console.log("Converted PDF Page Count:", pdfDoc.getPageCount());
  } else {
    console.log("Output PDF was not created (LibreOffice might not be installed on this local system).");
  }
}

testLibreOfficeProfile().catch(console.error);
