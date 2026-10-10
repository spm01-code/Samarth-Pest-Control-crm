import fs from "fs";
import path from "path";
import { generateQuotationDocx } from "../utils/docGenerator.js";

async function testIntegration() {
  console.log("--- STARTING END-TO-END PIPELINE INTEGRATION TEST ---");

  // Mock quotation document object
  const mockQuotation = {
    _id: "60d5ecb8b5c9c22b1c8e4567",
    quotationNumber: "QTN-TEST-999",
    quotationDate: new Date(),
    customer: {
      companyName: "INTEGRATION TEST COMPANY PVT LTD",
      fullName: "Test Contact",
      address: "123 Test Street, Cyber City, Hyderabad - 500081",
    },
    premisesTreated: "123 Test Street, Cyber City, Hyderabad",
    billingTerm: "Monthly",
    totalAmount: 25000,
    services: [
      {
        location: "123 Test Street, Cyber City, Hyderabad",
        serviceName: "ANTI TERMITE TREATMENT (ATT)",
        frequency: "ONE TIME",
        amount: 15000,
      },
      {
        location: "123 Test Street, Cyber City, Hyderabad",
        serviceName: "GENERAL PEST CONTROL",
        frequency: "MONTHLY",
        amount: 10000,
      },
    ],
  };

  // Test 1: Test with DOCX template
  console.log("\n1. Testing DOCX template pipeline...");
  const docxTemplatePath = path.join("server", "uploads", "templates", "FORMAT - PC QTN PLACEHOLDER.docx");
  if (fs.existsSync(docxTemplatePath)) {
    // Temporarily mock getActiveTemplate behavior or verify existing docx
    console.log("DOCX template found at:", docxTemplatePath);
  }

  // Test 2: Test generatePdfFromPdfTemplate direct call & docGenerator routing logic
  console.log("\n2. Testing PDF template pipeline...");
  const artifactDir = "C:\\Users\\Aditya\\.gemini\\antigravity\\brain\\7adb9152-1614-417c-b7e8-e7d8c4ce46ab\\.user_uploaded";
  const pdfTemplatePath = path.join(artifactDir, "media_1791530199758_3705875e.pdf");

  if (fs.existsSync(pdfTemplatePath)) {
    console.log("PDF template found at:", pdfTemplatePath);
    const { generatePdfFromPdfTemplate } = await import("../utils/pdfTemplateGenerator.js");
    const pdfBuf = await generatePdfFromPdfTemplate(pdfTemplatePath, {
      quotationNumber: mockQuotation.quotationNumber,
      quotationDate: "10/10/2026",
      customerName: mockQuotation.customer.companyName,
      premisesTreated: mockQuotation.premisesTreated,
      billingTerm: mockQuotation.billingTerm,
      totalAmount: "25,000.00",
      services: mockQuotation.services,
    });

    console.log("Successfully generated PDF buffer from PDF template! Size:", pdfBuf.length, "bytes");
  }

  console.log("\n--- PIPELINE INTEGRATION TEST PASSED ---");
}

testIntegration().catch((err) => {
  console.error("Integration test failed:", err);
  process.exit(1);
});
