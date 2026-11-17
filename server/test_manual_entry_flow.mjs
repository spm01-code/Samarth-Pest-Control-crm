import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  generateQuotationDocx,
  generateAttQuotationDocx,
  generateOneTimeJobDocx,
  buildCustomerData,
} from "./utils/docGenerator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scratchDir = path.resolve(__dirname, "../scratch");
if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

async function runManualEntryTests() {
  console.log("==================================================================");
  console.log("STARTING TEST SUITE: MANUAL CUSTOMER & OPERATOR ENTRY ENHANCEMENT");
  console.log("==================================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      throw new Error(`Test assertion failed: ${message}`);
    }
    passedTests++;
    console.log(`✅ PASS: ${message}`);
  }

  // TEST 1: buildCustomerData resolution
  console.log("--- TEST 1: buildCustomerData Snapshot Fallbacks ---");
  const crmCustomer = {
    _id: "661234567890123456789012",
    fullName: "Registered CRM Customer Ltd",
    contactPerson: "John Doe",
    address: "123 Business Park, Mumbai",
    phone: "9876543210",
    email: "john@crmcustomer.com",
    gstNumber: "27AAAAA0000A1Z5",
  };

  const manualSnapshot = {
    fullName: "Manual Temporary Customer",
    customerName: "Manual Temporary Customer",
    companyName: "Acme Temp Corp",
    contactPerson: "Jane Smith",
    address: "456 Temporary Road, Pune",
    phone: "9123456780",
    email: "jane@tempcorp.com",
    gstNumber: "27BBBBB1111B1Z6",
  };

  // Case 1A: Existing CRM customer
  const custRes1 = buildCustomerData(crmCustomer, null);
  assert(custRes1.customerName === "Registered CRM Customer Ltd", "Existing customer customerName correctly populated");
  assert(custRes1.customerPhone === "9876543210", "Existing customer phone correctly populated");
  assert(custRes1.customerContactPerson === "John Doe", "Existing customer contactPerson correctly populated");

  // Case 1B: Manual customer (no customer object, customerSnapshot provided)
  const custRes2 = buildCustomerData(null, manualSnapshot);
  assert(custRes2.customerName === "Acme Temp Corp", "Manual customer customerName resolved from customerSnapshot");
  assert(custRes2.customerFullName === "Manual Temporary Customer", "Manual customer customerFullName resolved from customerSnapshot");
  assert(custRes2.customerPhone === "9123456780", "Manual customer phone resolved from customerSnapshot");
  assert(custRes2.customerAddress === "456 Temporary Road, Pune", "Manual customer address resolved from customerSnapshot");
  assert(custRes2.customerContactPerson === "Jane Smith", "Manual customer contactPerson resolved from customerSnapshot");

  // Case 1C: Manual customer with customerName instead of fullName
  const custRes3 = buildCustomerData(null, { customerName: "Only CustomerName Field", phone: "9000000000" });
  assert(custRes3.customerName === "Only CustomerName Field", "Manual customer customerName resolved to customerName");

  // TEST 2: PC Quotation with Existing Customer
  console.log("\n--- TEST 2: PC Quotation with CRM Customer ---");
  const pcQuotationExisting = {
    quotationNumber: "QT/PC/2026/001",
    quotationDate: "2026-11-18",
    customer: crmCustomer,
    premises: "123 Business Park, Mumbai",
    services: [
      { serviceName: "General Pest Control", frequency: "Monthly", cost: 5000, location: "Office floor" },
    ],
    paymentTerm: "Within 10 days",
    status: "Sent",
  };
  const pcExistingDocx = await generateQuotationDocx(pcQuotationExisting);
  assert(Boolean(pcExistingDocx?.buffer), "PC Quotation DOCX generated for existing customer");
  assert(pcExistingDocx.data.customerName === "Registered CRM Customer Ltd", "PC Quotation contains existing customer name");

  // TEST 3: PC Quotation with Manual Customer (customer: null)
  console.log("\n--- TEST 3: PC Quotation with Manual Customer ---");
  const pcQuotationManual = {
    quotationNumber: "QT/PC/2026/002",
    quotationDate: "2026-11-18",
    customer: null, // No CRM Customer Document
    customerSnapshot: manualSnapshot,
    premises: "456 Temporary Road, Pune",
    services: [
      { serviceName: "Cockroach Treatment", frequency: "One Time", cost: 3500, location: "Warehouse" },
    ],
    paymentTerm: "Within 10 days",
    status: "Draft",
  };
  const pcManualDocx = await generateQuotationDocx(pcQuotationManual);
  assert(Boolean(pcManualDocx?.buffer), "PC Quotation DOCX generated for manual customer");
  assert(pcManualDocx.data.customerName === "Acme Temp Corp", "PC Quotation correctly displays manual customer company name");
  assert(pcManualDocx.data.customerFullName === "Manual Temporary Customer", "PC Quotation correctly displays manual customer full name");
  assert(pcManualDocx.data.customerPhone === "9123456780", "PC Quotation correctly displays manual customer phone");
  assert(pcManualDocx.data.customerContactPerson === "Jane Smith", "PC Quotation correctly displays manual customer contact person");

  // TEST 4: ATT Quotation with Existing Customer
  console.log("\n--- TEST 4: ATT Quotation with CRM Customer ---");
  const attQuotationExisting = {
    quotationNumber: "QT/ATT/2026/001",
    quotationDate: "2026-11-18",
    customer: crmCustomer,
    premises: "Site Plot 42, Thane",
    subject: "Quotation for Anti-termite treatment with 10 Years Warranty",
    specification: "IS 6313 (Part II)",
    equipment: "Working spray pumps ready",
    treatments: [
      { title: "Stage 1", stage: "Excavation", rate: 12, unit: "sq.ft" },
    ],
    paymentTerm: "Within 10 days",
  };
  const attExistingDocx = await generateAttQuotationDocx(attQuotationExisting);
  assert(Boolean(attExistingDocx?.buffer), "ATT Quotation DOCX generated for existing customer");
  assert(attExistingDocx.data.customerName === "Registered CRM Customer Ltd", "ATT Quotation contains existing customer name");

  // TEST 5: ATT Quotation with Manual Customer (customer: null)
  console.log("\n--- TEST 5: ATT Quotation with Manual Customer ---");
  const attQuotationManual = {
    quotationNumber: "QT/ATT/2026/002",
    quotationDate: "2026-11-18",
    customer: null, // No CRM Customer Document
    customerSnapshot: manualSnapshot,
    premises: "Proposed Site, Navi Mumbai",
    subject: "Quotation for Anti-termite treatment with 10 Years Warranty",
    specification: "IS 6313 (Part II)",
    equipment: "Working spray pumps ready",
    treatments: [
      { title: "Stage 1", stage: "Excavation", rate: 15, unit: "sq.ft" },
    ],
    paymentTerm: "Within 10 days",
  };
  const attManualDocx = await generateAttQuotationDocx(attQuotationManual);
  assert(Boolean(attManualDocx?.buffer), "ATT Quotation DOCX generated for manual customer");
  assert(attManualDocx.data.customerName === "Acme Temp Corp", "ATT Quotation correctly displays manual customer company name");
  assert(attManualDocx.data.customerFullName === "Manual Temporary Customer", "ATT Quotation correctly displays manual customer full name");
  assert(attManualDocx.data.customerPhone === "9123456780", "ATT Quotation correctly displays manual customer phone");

  // TEST 6: One-Time Job (Existing Customer + Existing Employee)
  console.log("\n--- TEST 6: One-Time Job (Existing Customer + Existing Employee) ---");
  const existingEmployee = {
    _id: "662222222222222222222222",
    fullName: "Ramesh Pawar",
    role: "Senior Technician",
    phone: "9811122233",
  };
  const otjCase1 = {
    jobNo: "OTJ/2026/101",
    serviceDate: "2026-11-18",
    serviceTime: "10:00 AM",
    serviceName: "Bed Bug Eradication",
    customer: crmCustomer,
    employee: existingEmployee,
    address: "123 Business Park, Mumbai",
    contactNumber: "9876543210",
    servicePaperDetails: {
      typeOfPest: "Bedbugs",
      chemicalUsed: "Deltamethrin",
      areaCovered: "500 sqft",
      customerFeedback: "Satisfied",
    },
    amount: 2500,
  };
  const otjDocx1 = await generateOneTimeJobDocx(otjCase1);
  assert(Boolean(otjDocx1?.buffer), "OTJ DOCX generated (Existing Cust + Existing Emp)");
  assert(otjDocx1.data.customerName === "Registered CRM Customer Ltd", "OTJ correctly resolves existing customer name");
  assert(otjDocx1.data.operatorName === "Ramesh Pawar", "OTJ correctly resolves existing employee name");

  // TEST 7: One-Time Job (Existing Customer + Manual Operator)
  console.log("\n--- TEST 7: One-Time Job (Existing Customer + Manual Operator) ---");
  const otjCase2 = {
    ...otjCase1,
    employee: null, // No CRM Employee Document
    operatorName: "Sushant Kadam", // Manual operator name
  };
  const otjDocx2 = await generateOneTimeJobDocx(otjCase2);
  assert(Boolean(otjDocx2?.buffer), "OTJ DOCX generated (Existing Cust + Manual Operator)");
  assert(otjDocx2.data.customerName === "Registered CRM Customer Ltd", "OTJ correctly resolves existing customer name");
  assert(otjDocx2.data.operatorName === "Sushant Kadam", "OTJ correctly resolves manual operator name");

  // TEST 8: One-Time Job (Manual Customer + Existing Employee)
  console.log("\n--- TEST 8: One-Time Job (Manual Customer + Existing Employee) ---");
  const otjCase3 = {
    ...otjCase1,
    customer: null, // No CRM Customer Document
    customerSnapshot: manualSnapshot,
    customerName: "Manual Temporary Customer",
    employee: existingEmployee,
  };
  const otjDocx3 = await generateOneTimeJobDocx(otjCase3);
  assert(Boolean(otjDocx3?.buffer), "OTJ DOCX generated (Manual Cust + Existing Employee)");
  assert(otjDocx3.data.customerName === "Manual Temporary Customer", "OTJ correctly resolves manual customer name");
  assert(otjDocx3.data.operatorName === "Ramesh Pawar", "OTJ correctly resolves existing employee name");

  // TEST 9: One-Time Job (Manual Customer + Manual Operator)
  console.log("\n--- TEST 9: One-Time Job (Manual Customer + Manual Operator) ---");
  const otjCase4 = {
    jobNo: "OTJ/2026/102",
    serviceDate: "2026-11-18",
    serviceTime: "02:00 PM",
    serviceName: "Termite Spot Treatment",
    customer: null, // No CRM Customer Document
    customerSnapshot: {
      fullName: "Aditya Patil",
      customerName: "Aditya Patil",
      phone: "9988776655",
      address: "B-204 Green Heights, Thane",
    },
    customerName: "Aditya Patil",
    employee: null, // No CRM Employee Document
    operatorName: "sushant", // Manual Operator
    address: "B-204 Green Heights, Thane",
    contactNumber: "9988776655",
    servicePaperDetails: {
      typeOfPest: "Termites",
      chemicalUsed: "Chlorpyrifos",
      areaCovered: "2 rooms",
      customerFeedback: "Good",
    },
    amount: 1800,
  };
  const otjDocx4 = await generateOneTimeJobDocx(otjCase4);
  assert(Boolean(otjDocx4?.buffer), "OTJ DOCX generated (Manual Cust + Manual Operator)");
  assert(otjDocx4.data.customerName === "Aditya Patil", "OTJ correctly displays manual customer name 'Aditya Patil'");
  assert(otjDocx4.data.operatorName === "sushant", "OTJ correctly displays manual operator name 'sushant'");

  // Write sample outputs to scratch
  fs.writeFileSync(path.join(scratchDir, "verified_pc_manual.docx"), pcManualDocx.buffer);
  fs.writeFileSync(path.join(scratchDir, "verified_att_manual.docx"), attManualDocx.buffer);
  fs.writeFileSync(path.join(scratchDir, "verified_otj_manual_both.docx"), otjDocx4.buffer);

  console.log("\n==================================================================");
  console.log(`ALL ${passedTests} / ${totalTests} TESTS PASSED SUCCESSFULLY (100%)!`);
  console.log("==================================================================");
}

runManualEntryTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
