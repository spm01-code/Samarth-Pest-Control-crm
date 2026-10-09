import fs from "fs";
import path from "path";
import PizZip from "pizzip";

const templatePath = path.resolve("./uploads/templates/1791265093032-349139013.docx");
if (!fs.existsSync(templatePath)) {
  console.log("Template file not found at:", templatePath);
  process.exit(1);
}

const content = fs.readFileSync(templatePath);
const zip = new PizZip(content);
const docXml = zip.files["word/document.xml"].asText();

console.log("=== TOTAL DOCUMENT LENGTH ===", docXml.length);

// Search for Annexure II
const annIdx = docXml.indexOf("Annexure");
console.log("Annexure position:", annIdx);
if (annIdx !== -1) {
  console.log("\n=== XML AROUND ANNEXURE II ===");
  console.log(docXml.substring(annIdx - 200, annIdx + 800));
}

// Search for Terms and conditions
const termsIdx = docXml.indexOf("Terms and conditions") !== -1 ? docXml.indexOf("Terms and conditions") : docXml.indexOf("Terms");
console.log("Terms position:", termsIdx);
if (termsIdx !== -1) {
  console.log("\n=== XML AROUND TERMS AND CONDITIONS ===");
  console.log(docXml.substring(termsIdx - 200, termsIdx + 1200));
}
