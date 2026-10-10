import fs from "fs";
import path from "path";
import { generatePdfFromPdfTemplate } from "../utils/pdfTemplateGenerator.js";

async function runTest() {
  const artifactDir = "C:\\Users\\Aditya\\.gemini\\antigravity\\brain\\7adb9152-1614-417c-b7e8-e7d8c4ce46ab\\.user_uploaded";
  const templatePath = path.join(artifactDir, "media_1791530199758_3705875e.pdf");

  if (!fs.existsSync(templatePath)) {
    console.error("Template file not found at:", templatePath);
    process.exit(1);
  }

  // Exact reference data from Image 1 / Image 2
  const mockDataRef = {
    quotationNumber: "486",
    quotationDate: "09/02/2026",
    customerName: "AHLUWALIA CONTRACT",
    premisesTreated: "Tata Memorial Hospital, Parel Village. Bhoiwada, Mumbai- 4000012",
    billingTerm: "Monthly",
    totalAmount: "0.00",
    services: [
      {
        location: "Tata Memorial Hospital, Parel Village. Bhoiwada, Mumbai- 4000012",
        serviceName: "1) MOSQUITO FOGGING",
        frequency: "TWICE A WEEKLY",
        amount: "0.00"
      }
    ]
  };

  const bufferRef = await generatePdfFromPdfTemplate(templatePath, mockDataRef);
  const outputPathSingle = path.join("server", "scratch", "test_pdf_template_single.pdf");
  fs.writeFileSync(outputPathSingle, bufferRef);
  console.log("Saved Test PDF (Image 1 Reference Data) to:", outputPathSingle, "(" + bufferRef.length + " bytes)");

  // Test Multiple Services
  const mockDataMultiple = {
    quotationNumber: "487",
    quotationDate: "09/02/2026",
    customerName: "GLOBAL HOSPITAL & RESEARCH CENTER",
    premisesTreated: "Plot 12, Sector 5, Vashi, Navi Mumbai - 400703",
    billingTerm: "Quarterly",
    totalAmount: "48,500.00",
    services: [
      {
        location: "Main Hospital Building, Floors 1 to 5",
        serviceName: "1) COCKROACH & RODENT CONTROL",
        frequency: "FORTNIGHTLY",
        amount: "20,000.00"
      },
      {
        location: "Outpatient Department (OPD) & Pharmacy",
        serviceName: "2) MOSQUITO FOGGING & LARVICIDE",
        frequency: "WEEKLY",
        amount: "18,500.00"
      },
      {
        location: "Cafeteria & Kitchen Premises",
        serviceName: "3) FLY & INSECT CONTROL",
        frequency: "MONTHLY",
        amount: "10,000.00"
      }
    ]
  };

  const bufferMultiple = await generatePdfFromPdfTemplate(templatePath, mockDataMultiple);
  const outputPathMultiple = path.join("server", "scratch", "test_pdf_template_multiple.pdf");
  fs.writeFileSync(outputPathMultiple, bufferMultiple);
  console.log("Saved Test 2 PDF (Multiple Services) to:", outputPathMultiple, "(" + bufferMultiple.length + " bytes)");
}

runTest().catch(console.error);
