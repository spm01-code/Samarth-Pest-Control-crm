import path from "path";
import XLSX from "xlsx";

const docsDir = "C:\\Users\\Aditya\\Downloads\\CRM Documents";
const fileName = "AMC- PC.xlsx";
const filePath = path.join(docsDir, fileName);

const workbook = XLSX.readFile(filePath);
console.log("Sheet names in AMC- PC.xlsx:", workbook.SheetNames);

workbook.SheetNames.forEach((sheetName) => {
  console.log(`\n========================================`);
  console.log(`SHEET: [${sheetName}]`);
  console.log(`========================================`);
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`Total raw rows: ${rawRows.length}`);

  // Find first 10 non-empty rows
  let count = 0;
  rawRows.forEach((row, idx) => {
    if (count < 12 && row && row.some((cell) => cell !== null && cell !== "")) {
      console.log(`Row ${idx + 1}:`, JSON.stringify(row));
      count++;
    }
  });
});
