import path from "path";
import XLSX from "xlsx";

const filePath = "C:\\Users\\Aditya\\Downloads\\CRM Documents\\AMC- PC.xlsx";
const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets["AMC - PC"];
const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

console.log("Sheet [AMC - PC] Total Rows:", rawRows.length);
console.log("Row 1 (Header):", JSON.stringify(rawRows[0]));
console.log("Row 2:", JSON.stringify(rawRows[1]));
console.log("Row 3:", JSON.stringify(rawRows[2]));
console.log("Row 4:", JSON.stringify(rawRows[3]));
console.log("Row 5:", JSON.stringify(rawRows[4]));
console.log("Row 6:", JSON.stringify(rawRows[5]));

// Inspect sample rows with data
for (let i = 1; i < Math.min(30, rawRows.length); i++) {
  const row = rawRows[i];
  if (row && row.some((c) => c !== null && c !== "")) {
    console.log(`Row ${i + 1}:`, JSON.stringify(row));
  }
}
