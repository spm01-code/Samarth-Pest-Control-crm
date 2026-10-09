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

const docXml = zip.files["word/document.xml"] ? zip.files["word/document.xml"].asText() : "";
const stylesXml = zip.files["word/styles.xml"] ? zip.files["word/styles.xml"].asText() : "";

console.log("=== DOCUMENT XML LENGTH ===", docXml.length);

// Check sections <w:sectPr>
const sectPrMatches = docXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g) || [];
console.log("\n=== SECTION PROPERTIES (<w:sectPr>) ===");
sectPrMatches.forEach((s, idx) => console.log(`Section ${idx + 1}:`, s));

// Check tables <w:tblPr>
const tblPrMatches = docXml.match(/<w:tblPr[\s\S]*?<\/w:tblPr>/g) || [];
console.log("\n=== TABLE PROPERTIES (<w:tblPr>) ===");
tblPrMatches.forEach((t, idx) => console.log(`Table ${idx + 1}:`, t));

// Check table cell margins <w:tblCellMar>
const tblCellMarMatches = docXml.match(/<w:tblCellMar[\s\S]*?<\/w:tblCellMar>/g) || [];
console.log("\n=== TABLE CELL MARGINS (<w:tblCellMar>) ===");
tblCellMarMatches.forEach((m, idx) => console.log(`CellMar ${idx + 1}:`, m));

// Check spacing tags in document XML
const spacingMatches = docXml.match(/<w:spacing[^>]*\/>/g) || [];
console.log(`\n=== SPACING TAGS COUNT === ${spacingMatches.length}`);
console.log("Sample spacing tags:", spacingMatches.slice(0, 15));

// Check styles default spacing
const styleDefaults = stylesXml.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/);
console.log("\n=== DOCUMENT DEFAULTS IN STYLES.XML ===");
console.log(styleDefaults ? styleDefaults[0] : "None");
