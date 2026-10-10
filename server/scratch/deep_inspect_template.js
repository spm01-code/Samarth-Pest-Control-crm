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

console.log("=== ZIP FILES LIST ===");
Object.keys(zip.files).forEach((f) => console.log("-", f));

const fontTableXml = zip.files["word/fontTable.xml"] ? zip.files["word/fontTable.xml"].asText() : "";
const stylesXml = zip.files["word/styles.xml"] ? zip.files["word/styles.xml"].asText() : "";
const themeXml = zip.files["word/theme/theme1.xml"] ? zip.files["word/theme/theme1.xml"].asText() : "";
const docXml = zip.files["word/document.xml"] ? zip.files["word/document.xml"].asText() : "";

console.log("\n=== FONTS IN fontTable.xml ===");
const fontNamesInTable = [...fontTableXml.matchAll(/w:name="([^"]+)"/g)].map((m) => m[1]);
console.log(Array.from(new Set(fontNamesInTable)));

console.log("\n=== THEME FONTS IN theme1.xml ===");
const latinMajorFont = themeXml.match(/<a:majorFont>[\s\S]*?<a:latin\s+typeface="([^"]+)"/);
const latinMinorFont = themeXml.match(/<a:minorFont>[\s\S]*?<a:latin\s+typeface="([^"]+)"/);
console.log("Major Font (Headings):", latinMajorFont ? latinMajorFont[1] : "N/A");
console.log("Minor Font (Body):", latinMinorFont ? latinMinorFont[1] : "N/A");

console.log("\n=== DOCUMENT DEFAULTS IN styles.xml ===");
const docDefaults = stylesXml.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/);
console.log(docDefaults ? docDefaults[0] : "N/A");

console.log("\n=== STYLES DEFINED IN styles.xml ===");
const styleNames = [...stylesXml.matchAll(/<w:style[^>]*w:styleId="([^"]+)"[^>]*>/g)].map((m) => m[1]);
console.log("Style IDs:", styleNames);

console.log("\n=== DOCUMENT LINE PITCH & GRID (<w:docGrid>) ===");
const docGrid = docXml.match(/<w:docGrid[^>]*\/>/);
console.log(docGrid ? docGrid[0] : "N/A");

console.log("\n=== TABLE CELL MARGINS & DEFAULTS ===");
const tblCellMar = [...docXml.matchAll(/<w:tblCellMar[\s\S]*?<\/w:tblCellMar>/g)].map((m) => m[0]);
console.log("Cell Margins in docXml:", tblCellMar);

console.log("\n=== RFONTS USAGE IN document.xml ===");
const rFontsTags = [...docXml.matchAll(/<w:rFonts[^>]*\/>/g)].map((m) => m[0]);
const uniqueRFonts = Array.from(new Set(rFontsTags));
console.log("Unique w:rFonts tags in document.xml:");
uniqueRFonts.forEach((f) => console.log(" ", f));
