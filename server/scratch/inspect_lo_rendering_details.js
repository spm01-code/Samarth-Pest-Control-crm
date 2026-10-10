import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import PizZip from "pizzip";

async function inspectDocxDetails() {
  const scratchDir = path.resolve("./scratch");
  const docxPath = path.join(scratchDir, "populated_local.docx");
  if (!fsSync.existsSync(docxPath)) {
    console.log("populated_local.docx not found");
    return;
  }

  const content = await fs.readFile(docxPath);
  const zip = new PizZip(content);

  const docXml = zip.files["word/document.xml"].asText();

  // Find all theme font references
  const asciiThemeMatches = [...docXml.matchAll(/w:asciiTheme="([^"]+)"/g)].map((m) => m[1]);
  console.log("asciiTheme references in populated DOCX:", Array.from(new Set(asciiThemeMatches)));

  // Find all explicit font references
  const fontMatches = [...docXml.matchAll(/w:ascii="([^"]+)"/g)].map((m) => m[1]);
  console.log("Explicit w:ascii fonts in populated DOCX:", Array.from(new Set(fontMatches)));

  // Inspect paragraph spacing tags
  const spacingTags = [...docXml.matchAll(/<w:spacing[^>]*\/>/g)].map((m) => m[0]);
  console.log("\nTotal <w:spacing> tags:", spacingTags.length);
  const uniqueSpacing = Array.from(new Set(spacingTags));
  console.log("Unique <w:spacing> tags:", uniqueSpacing);

  // Inspect linePitch
  const linePitchMatch = docXml.match(/<w:docGrid[^>]*\/>/);
  console.log("\nDocGrid linePitch tag:", linePitchMatch ? linePitchMatch[0] : "None");
}

inspectDocxDetails().catch(console.error);
