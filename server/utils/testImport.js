import fs from "fs";
import path from "path";
import xlsx from "xlsx";
import { classifyWorksheet } from "./importClassifier.js";

// Configure directory containing CRM Excel workbooks
const CRM_DOCS_DIR = process.env.CRM_DOCS_DIR || "C:\\Users\\Aditya\\Downloads\\CRM Documents";
const REPORT_PATH = "C:\\Users\\Aditya\\.gemini\\antigravity\\brain\\4e1abdda-60de-481d-9ae7-89fbce4bbcf2\\scratch\\classification_report.md";

const TARGET_FILES = [
  "ONE TIME JOB.xlsx",
  "ATT QTN LIST.xlsx",
  "INVOICE PC.xlsx",
  "AMC- PC.xlsx",
  "PERFORMA BILL.xlsx",
  "GST -  ALL INVOICE.xlsx",
  "QTN - PC.xlsx",
  "ALL  - SALARY.xlsx"
];

const HEADER_KEYWORDS = [
  "no", "date", "name", "address", "phone", "mobile", "mob", "person", "contact",
  "service", "frequency", "charges", "charge", "rate", "amount", "total", "operator", "oper",
  "reference", "remark", "mode", "credit", "balance", "email", "start", "end", "invoice", "qtn",
  "quotation", "billing", "basic", "salary", "advance", "sgst", "cgst", "igst", "tds", "hsn", "sac",
  "emp", "staff", "pf", "esic", "pt", "net"
];

/**
 * Deterministic Header Row Detector
 * Score-based approach looking for key indicators in the first 10 rows
 */
function detectHeaderRow(rows) {
  if (!rows || rows.length === 0) {
    return { rowIndex: 1, headers: [] };
  }

  let bestRowIndex = 0; // 0-indexed default
  let bestScore = -1;
  let bestHeaders = [];

  const maxInspectRows = Math.min(rows.length, 10);
  for (let r = 0; r < maxInspectRows; r++) {
    const row = rows[r];
    if (!row || !Array.isArray(row)) continue;

    // Clean strings and filter out non-string/empty entries
    const cleanedCells = row.map(cell => 
      (cell !== undefined && cell !== null) ? String(cell).trim().toLowerCase() : ""
    );
    const nonEmptyCount = cleanedCells.filter(c => c !== "").length;

    if (nonEmptyCount < 2) continue; // Needs at least 2 headers to be a valid row header table

    let keywordMatchCount = 0;
    cleanedCells.forEach(cell => {
      if (cell === "") return;
      const isMatch = HEADER_KEYWORDS.some(kw => cell.includes(kw) || kw.includes(cell));
      if (isMatch) keywordMatchCount++;
    });

    // Score is heavily weighted on keyword matches and then non-empty count
    const score = (keywordMatchCount * 5) + nonEmptyCount;
    if (score > bestScore) {
      bestScore = score;
      bestRowIndex = r;
      bestHeaders = row.map(cell => (cell !== undefined && cell !== null) ? String(cell).trim() : "");
    }
  }

  // Trim trailing empty cells to avoid large prints of empty columns
  while (bestHeaders.length > 0 && bestHeaders[bestHeaders.length - 1] === "") {
    bestHeaders.pop();
  }

  return {
    rowIndex: bestRowIndex + 1, // Convert to 1-indexed for user/UI representation
    headers: bestHeaders
  };
}

function runAnalysis() {
  console.log("================================================================================");
  console.log("DEVELOPMENT VERIFICATION SCRIPT: WORKSHEET ENTITY CLASSIFIER (PHASE 2)");
  console.log("================================================================================");
  console.log(`Scanning Directory: ${CRM_DOCS_DIR}\n`);

  if (!fs.existsSync(CRM_DOCS_DIR)) {
    console.error(`ERROR: Configured directory does not exist: "${CRM_DOCS_DIR}"`);
    process.exit(1);
  }

  const dirFiles = fs.readdirSync(CRM_DOCS_DIR);
  const reports = [];

  for (const targetName of TARGET_FILES) {
    const normalizedTargetName = targetName.toLowerCase().replace(/\s+/g, " ");
    const matchedFileName = dirFiles.find(df => {
      const normalizedDf = df.toLowerCase().replace(/\s+/g, " ");
      return normalizedDf === normalizedTargetName;
    });

    if (!matchedFileName) {
      console.log(`[ ] Target file not found: "${targetName}"`);
      continue;
    }

    const filePath = path.join(CRM_DOCS_DIR, matchedFileName);
    console.log(`Analyzing file: "${matchedFileName}"`);

    try {
      const workbook = xlsx.readFile(filePath, { cellDates: true, raw: true });

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        
        // Detect header
        const { rowIndex, headers } = detectHeaderRow(rawRows);
        
        // Run classification
        const result = classifyWorksheet(matchedFileName, sheetName, rawRows, rowIndex, headers);
        reports.push(result);
        
        console.log(`  - Sheet: "${sheetName.padEnd(20)}" | Likely: ${result.likelyEntity.padEnd(10)} | Confidence: ${result.confidence.toFixed(2)} | Status: ${result.classificationStatus}`);
      }
    } catch (err) {
      console.error(`  [!] Error parsing workbook: ${err.message}`);
    }
  }

  // Generate Markdown Report
  let md = "# Excel Import Classification Report (Phase 2)\n\n";
  md += `* **Generated At**: ${new Date().toISOString()}\n`;
  md += `* **Source Directory**: \`${CRM_DOCS_DIR}\`\n\n`;
  
  md += "## Classification Summary Table\n\n";
  md += "| Workbook | Worksheet | Row Count | Header Row | Likely Entity | Confidence | Status | Matched Signals | Potential Issues / Reason |\n";
  md += "|---|---|---|---|---|---|---|---|---|\n";

  reports.forEach(r => {
    const matchedStr = r.matchedSignals.join(", ") || "None";
    const issuesStr = r.uncertainSignals.concat([r.reason]).filter(Boolean).join("; ");
    md += `| ${r.workbookName} | ${r.sheetName} | ${r.rowCount} | ${r.headerRow} | **${r.likelyEntity}** | ${r.confidence} | \`${r.classificationStatus}\` | ${matchedStr} | ${issuesStr} |\n`;
  });

  md += "\n\n## Summary Statistics\n\n";
  const entityCounts = {};
  const statusCounts = {};

  reports.forEach(r => {
    entityCounts[r.likelyEntity] = (entityCounts[r.likelyEntity] || 0) + 1;
    statusCounts[r.classificationStatus] = (statusCounts[r.classificationStatus] || 0) + 1;
  });

  md += "### Entity Classifications:\n";
  Object.keys(entityCounts).forEach(k => {
    md += `* **${k}**: ${entityCounts[k]} sheets\n`;
  });

  md += "\n### Classification Statuses:\n";
  Object.keys(statusCounts).forEach(k => {
    md += `* **${k}**: ${statusCounts[k]} sheets\n`;
  });

  try {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, md, "utf-8");
    console.log(`\n[✓] Detailed report written to: ${REPORT_PATH}`);
  } catch (err) {
    console.error(`[!] Failed to write markdown report: ${err.message}`);
  }
}

runAnalysis();
