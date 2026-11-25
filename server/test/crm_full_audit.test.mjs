import dotenv from "dotenv";
dotenv.config({ path: "./server/.env" });
dotenv.config();

import dns from "dns";
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

import mongoose from "mongoose";
import express from "express";
import cookieParser from "cookie-parser";
import http from "http";

import Admin from "../model/adminModel.js";
import Customer from "../model/customerModel.js";
import Employee from "../model/employeeModel.js";
import Service from "../model/serviceModel.js";
import Invoice from "../model/invoiceModel.js";
import Quotation from "../model/quotationModel.js";
import Renewal from "../model/renewalModel.js";
import Attendance from "../model/attendanceModel.js";
import JobNumber from "../model/jobNumberModel.js";

import customerRoutes from "../routes/customerRoute.js";
import employeeRoutes from "../routes/employeeRoute.js";
import serviceRoutes from "../routes/serviceRoute.js";
import invoiceRoutes from "../routes/invoiceRoute.js";
import quotationRoutes from "../routes/quotationRoute.js";
import attendanceRoutes from "../routes/attendanceRoute.js";
import renewalRoutes from "../routes/renewalRoute.js";
import authMiddleware from "../middleware/authMiddleware.js";

import { generateAccessToken } from "../utils/generateTokens.js";
import { migrateDatabaseIndexes } from "../utils/dbIndexMigration.js";
import { syncJobNumberSequences, releaseJobNo } from "../utils/jobNumberService.js";
import { syncExistingDocumentSequences } from "../utils/documentNumberService.js";
import { generateQuotationDocx, generateAttQuotationDocx, generateOneTimeJobDocx } from "../utils/docGenerator.js";
import { generatePdfFromPdfTemplate } from "../utils/pdfTemplateGenerator.js";

const AUDIT_TS = Date.now();
const AUDIT_TAG = `CRM_AUDIT_TEST_${AUDIT_TS}`;
const TEST_DB_URI = process.env.MONGO_URI.replace("/crm_samarth?", "/crm_samarth_test?");

console.log("================================================================================");
console.log("     CRM COMPREHENSIVE FUNCTIONAL AUDIT & COMPLETE CRUD VERIFICATION SUITE      ");
console.log("================================================================================\n");

let passedCount = 0;
let failedCount = 0;
const resultsLog = [];

function assert(condition, testName, details = "") {
  if (condition) {
    passedCount++;
    console.log(`  ✅ PASS: ${testName}`);
    resultsLog.push({ testName, status: "PASS", details });
  } else {
    failedCount++;
    console.error(`  ❌ FAIL: ${testName} - ${details}`);
    resultsLog.push({ testName, status: "FAIL", details });
    throw new Error(`Assertion failed: ${testName} (${details})`);
  }
}

async function runAudit() {
  console.log(`Connecting to isolated test database: ${TEST_DB_URI.replace(/:[^:]*@/, ":<hidden>@")}`);
  await mongoose.connect(TEST_DB_URI, { serverSelectionTimeoutMS: 10000 });

  // STRICT REQUIREMENT 2: Validate database name before any operations
  const currentDbName = mongoose.connection.name;
  console.log(`Active Database Name: "${currentDbName}"`);
  if (currentDbName !== "crm_samarth_test") {
    throw new Error(`CRITICAL SAFETY ABORT: Connected to "${currentDbName}", expected "crm_samarth_test". Aborting.`);
  }
  assert(currentDbName === "crm_samarth_test", "Safety Gate: Connected exclusively to crm_samarth_test");

  // Apply migrations and sequence syncs
  await migrateDatabaseIndexes(mongoose.connection.db);
  await syncJobNumberSequences();
  await syncExistingDocumentSequences({ Invoice, Quotation, Renewal, Service });

  // Create or retrieve audit test Admin for API authentication
  let testAdmin = await Admin.findOne({ email: "audit_tester@example.com" });
  if (!testAdmin) {
    testAdmin = await Admin.create({
      name: "Audit Test Admin",
      email: "audit_tester@example.com",
      phone: "9999999999",
      password: "HashedPassword123",
      isVerified: true,
    });
  }
  const authToken = generateAccessToken(testAdmin._id);

  // Spin up an Express test server with actual backend middleware and routes
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(cookieParser());
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.use("/api/customers", authMiddleware, customerRoutes);
  app.use("/api/employees", authMiddleware, employeeRoutes);
  app.use("/api/services", authMiddleware, serviceRoutes);
  app.use("/api/invoices", authMiddleware, invoiceRoutes);
  app.use("/api/quotations", authMiddleware, quotationRoutes);
  app.use("/api/attendance", authMiddleware, attendanceRoutes);
  app.use("/api/renewals", authMiddleware, renewalRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const testPort = server.address().port;
  const baseUrl = `http://127.0.0.1:${testPort}/api`;
  console.log(`Test API Server running on ${baseUrl}\n`);

  const apiHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
  };

  async function api(path, options = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        ...apiHeaders,
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, ok: res.ok, data };
  }

  const createdIds = {
    customers: [],
    employees: [],
    services: [],
    quotations: [],
    invoices: [],
    renewals: [],
    attendance: [],
  };

  try {
    // ========================================================================
    // PRIORITY 1: ONE-TIME JOB UPDATE FAILURE INVESTIGATION & VERIFICATION
    // ========================================================================
    console.log("============================================================");
    console.log("PRIORITY 1: ONE-TIME JOB UPDATE WORKFLOW VERIFICATION");
    console.log("============================================================\n");

    const initialCustomerCount = await Customer.countDocuments();
    const initialEmployeeCount = await Employee.countDocuments();

    // 1A. Create a One-Time Job with manual customer and manual operator
    console.log("--- 1A. Create One-Time Job (Manual Customer + Manual Operator) ---");
    const createOtjRes = await api("/services/create", {
      method: "POST",
      body: JSON.stringify({
        customerName: `${AUDIT_TAG}_ManualCustomer`,
        operatorName: "ManualOperatorAudit",
        serviceName: "Bed Bug One-Time Treatment",
        frequency: "one-time",
        serviceDate: "2026-11-20",
        address: "701 Audit Tower, Bandra West, Mumbai",
        amount: 4500,
        contactPerson: "Audit Contact",
        contactNumber: "9876500001",
      }),
    });
    assert(createOtjRes.status === 201, "API: One-Time Job created successfully with status 201");
    const createdOtj = createOtjRes.data.service;
    createdIds.services.push(createdOtj._id);
    assert(Boolean(createdOtj.jobNo), "One-Time Job auto-allocated jobNo", createdOtj.jobNo);
    assert(createdOtj.customerName === `${AUDIT_TAG}_ManualCustomer`, "One-Time Job has manual customerName");
    assert(createdOtj.customer === null || createdOtj.customer === undefined, "One-Time Job has no customer reference (manual)");

    // 1B. Emulate exact frontend EditServiceModal submission with synthetic temporary "occ-1" ID
    console.log("\n--- 1B. Emulate Frontend EditServiceModal Update with synthetic 'occ-1' ID ---");
    const otjUpdatePayload = {
      customer: "",
      customerName: `${AUDIT_TAG}_ManualCustomer_Renamed`,
      employee: "",
      operatorName: "ManualOperatorAudit_Updated",
      jobNo: createdOtj.jobNo,
      serviceName: "Bed Bug One-Time Treatment - Thorough",
      frequency: "one-time",
      serviceDate: "2026-11-22",
      amount: 5000,
      totalAmount: 5000,
      paidAmount: 1500,
      balanceAmount: 3500,
      paymentStatus: "Partially Paid",
      address: "701 Audit Tower, Bandra West, Mumbai - Apt 7B",
      contactPerson: "Audit Contact Person 2",
      contactNumber: "9876500002",
      serviceOccurrences: [
        {
          _id: "occ-1", // EXACT CAUSE OF SCREENSHOT ERROR
          serviceNo: "1st Service / One Time",
          occurrenceType: "1st-service",
          serviceDate: "2026-11-22",
          serviceTime: "10:30 AM",
          operatorName: "ManualOperatorAudit_Updated",
          employee: "",
          amount: 5000,
          paymentStatus: "Partially Paid",
          remark: "Updated initial visit",
        },
      ],
    };

    const updateOtjRes = await api(`/services/${createdOtj._id}`, {
      method: "PUT",
      body: JSON.stringify(otjUpdatePayload),
    });
    assert(updateOtjRes.status === 200, "API: One-Time Job update SUCCEEDED with status 200 (Bug Resolved!)");
    assert(updateOtjRes.data.message === "Service Updated", "API returned 'Service Updated'");

    // 1C. Verify database persistence and ObjectId integrity
    console.log("\n--- 1C. Verify Database Persistence of Updated OTJ ---");
    const persistedOtj = await Service.findById(createdOtj._id).lean();
    assert(persistedOtj.serviceName === "Bed Bug One-Time Treatment - Thorough", "ServiceName successfully updated in DB");
    assert(persistedOtj.customerName === `${AUDIT_TAG}_ManualCustomer_Renamed`, "CustomerName successfully updated in DB");
    assert(persistedOtj.operatorName === "ManualOperatorAudit_Updated", "OperatorName successfully updated in DB");
    assert(persistedOtj.paidAmount === 1500, "paidAmount correctly set to 1500");
    assert(persistedOtj.balanceAmount === 3500, "balanceAmount correctly calculated as 3500");
    assert(persistedOtj.paymentStatus === "Partially Paid", "paymentStatus correctly set to Partially Paid");
    assert(persistedOtj.serviceOccurrences.length === 1, "serviceOccurrences has 1 entry");
    assert(mongoose.Types.ObjectId.isValid(persistedOtj.serviceOccurrences[0]._id), "Subdocument _id was assigned valid ObjectId by Mongoose (No CastError)");

    // 1D. Add a 2nd subsequent service (complaint) with synthetic "occ-2" ID
    console.log("\n--- 1D. Add Subsequent Service Occurrence via Update ---");
    const existingOccId = persistedOtj.serviceOccurrences[0]._id.toString();
    const addSecondOccPayload = {
      ...otjUpdatePayload,
      serviceOccurrences: [
        {
          _id: existingOccId, // Existing valid ObjectId
          serviceNo: "1st Service / One Time",
          occurrenceType: "1st-service",
          serviceDate: "2026-11-22",
          serviceTime: "10:30 AM",
          operatorName: "ManualOperatorAudit_Updated",
          employee: null,
          amount: 5000,
          paymentStatus: "Partially Paid",
        },
        {
          _id: `occ-${Date.now()}`, // Newly added occurrence key from handleAddServiceOccurrence
          serviceNo: "2nd Service / Complaint",
          occurrenceType: "complaint",
          serviceDate: "2026-11-28",
          serviceTime: "02:00 PM",
          operatorName: "ManualOperatorAudit_Updated",
          employee: null,
          amount: 0,
          paymentStatus: "Unpaid",
          remark: "Follow-up complaint service",
        },
      ],
    };
    const updateWith2ndOccRes = await api(`/services/${createdOtj._id}`, {
      method: "PUT",
      body: JSON.stringify(addSecondOccPayload),
    });
    assert(updateWith2ndOccRes.status === 200, "API: OTJ updated with 2nd occurrence successfully (status 200)");
    const otjWith2 = await Service.findById(createdOtj._id).lean();
    assert(otjWith2.serviceOccurrences.length === 2, "DB: OTJ now has 2 occurrences persisted");
    assert(otjWith2.serviceOccurrences[0]._id.toString() === existingOccId, "1st occurrence retained its original ObjectId");
    assert(mongoose.Types.ObjectId.isValid(otjWith2.serviceOccurrences[1]._id), "2nd occurrence received a valid ObjectId");

    // 1E. Verify that editing OTJ did NOT create any Customer or Employee documents
    console.log("\n--- 1E. Verify Zero Accidental Document Side-Effects ---");
    const finalCustomerCount = await Customer.countDocuments();
    const finalEmployeeCount = await Employee.countDocuments();
    assert(finalCustomerCount === initialCustomerCount, "Zero Customer documents created during OTJ lifecycle", `Count: ${finalCustomerCount}`);
    assert(finalEmployeeCount === initialEmployeeCount, "Zero Employee documents created during OTJ lifecycle", `Count: ${finalEmployeeCount}`);


    // ========================================================================
    // MODULE A: CUSTOMER MANAGEMENT CRUD
    // ========================================================================
    console.log("\n============================================================");
    console.log("MODULE A: CUSTOMER MANAGEMENT CRUD VERIFICATION");
    console.log("============================================================\n");

    const custPhone = `98${String(AUDIT_TS).slice(-8)}`;
    const custAltPhone = `97${String(AUDIT_TS).slice(-8)}`;

    // Create Customer
    const createCustRes = await api("/customers/create", {
      method: "POST",
      body: JSON.stringify({
        fullName: `${AUDIT_TAG}_Customer`,
        customerType: "commercial",
        companyName: "Audit Enterprise LLP",
        phone: custPhone,
        alternatePhone: custAltPhone,
        email: `customer_${AUDIT_TS}@example.com`,
        address: "Flat 101, Audit Heights, Andheri East, Mumbai",
        contactPerson: "Rohan Audit",
        gstNumber: "27AAAAA0000A1Z5",
        status: "active",
      }),
    });
    assert(createCustRes.status === 201, "Customer created with status 201", JSON.stringify(createCustRes.data));
    const testCustomer = createCustRes.data.customer;
    createdIds.customers.push(testCustomer._id);
    assert(Boolean(testCustomer.jobNo), "Customer allocated Job Number", testCustomer.jobNo);

    // Read Customer Details
    const getCustRes = await api(`/customers/${testCustomer._id}`);
    assert(getCustRes.status === 200, "Customer retrieved successfully by ID");
    assert(getCustRes.data.fullName === `${AUDIT_TAG}_Customer`, "Retrieved customer name matches");

    // Edit Customer
    const updateCustRes = await api(`/customers/${testCustomer._id}`, {
      method: "PUT",
      body: JSON.stringify({
        fullName: `${AUDIT_TAG}_Customer_Edited`,
        contactPerson: "Rohan Audit Senior",
        address: "Flat 101, Audit Heights, Edited Road, Mumbai",
      }),
    });
    assert(updateCustRes.status === 200, "Customer updated successfully with status 200");
    const updatedCustInDb = await Customer.findById(testCustomer._id);
    assert(updatedCustInDb.fullName === `${AUDIT_TAG}_Customer_Edited`, "Edited name persisted in database");
    assert(updatedCustInDb.contactPerson === "Rohan Audit Senior", "Edited contactPerson persisted in database");

    // Search by Name
    const searchNameRes = await api(`/customers?search=${encodeURIComponent(AUDIT_TAG)}`);
    assert(searchNameRes.status === 200, "Customer search by name responded status 200");
    const foundByName = searchNameRes.data.some((c) => c._id === testCustomer._id);
    assert(foundByName, "Customer successfully located via name search");

    // Search by Primary Phone
    const searchPhoneRes = await api(`/customers?search=${custPhone}`);
    assert(searchPhoneRes.status === 200, "Customer search by primary phone responded status 200");
    const foundByPhone = searchPhoneRes.data.some((c) => c._id === testCustomer._id);
    assert(foundByPhone, "Customer successfully located via primary phone search");

    // Search by Alternate Phone
    const searchAltPhoneRes = await api(`/customers?search=${custAltPhone}`);
    assert(searchAltPhoneRes.status === 200, "Customer search by alternate phone responded status 200");
    const foundByAltPhone = searchAltPhoneRes.data.some((c) => c._id === testCustomer._id);
    assert(foundByAltPhone, "Customer successfully located via alternate phone search");


    // ========================================================================
    // MODULE B: EMPLOYEE MANAGEMENT CRUD
    // ========================================================================
    console.log("\n============================================================");
    console.log("MODULE B: EMPLOYEE MANAGEMENT CRUD VERIFICATION");
    console.log("============================================================\n");

    const empPhone = `96${String(AUDIT_TS).slice(-8)}`;

    // Create Employee
    const createEmpRes = await api("/employees/create", {
      method: "POST",
      body: JSON.stringify({
        fullName: `${AUDIT_TAG}_Employee`,
        phone: empPhone,
        email: `emp_${AUDIT_TS}@example.com`,
        role: "worker",
        joiningDate: "2026-01-15",
        address: "Thane West, Maharashtra",
        salary: 22000,
        status: "active",
      }),
    });
    assert(createEmpRes.status === 201, "Employee created with status 201", JSON.stringify(createEmpRes.data));
    const testEmployee = createEmpRes.data.employee;
    createdIds.employees.push(testEmployee._id);

    // Read Employee Details
    const getEmpRes = await api(`/employees/${testEmployee._id}`);
    assert(getEmpRes.status === 200, "Employee retrieved successfully by ID");
    assert(getEmpRes.data.fullName === `${AUDIT_TAG}_Employee`, "Retrieved employee fullName matches");

    // Edit Employee
    const updateEmpRes = await api(`/employees/${testEmployee._id}`, {
      method: "PUT",
      body: JSON.stringify({
        fullName: `${AUDIT_TAG}_Employee_Senior`,
        role: "office-staff",
        salary: 26000,
      }),
    });
    assert(updateEmpRes.status === 200, "Employee updated successfully with status 200", JSON.stringify(updateEmpRes.data));
    const updatedEmpInDb = await Employee.findById(testEmployee._id);
    assert(updatedEmpInDb.role === "office-staff", "Employee updated role persisted in database");
    assert(updatedEmpInDb.salary === 26000, "Employee updated salary persisted in database");

    // List and Filter Employees
    const listEmpRes = await api("/employees");
    assert(listEmpRes.status === 200, "Employee listing retrieved successfully");
    const foundInEmpList = listEmpRes.data.some((e) => e._id === testEmployee._id);
    assert(foundInEmpList, "Created employee present in employee list");


    // ========================================================================
    // MODULE C: SERVICE MANAGEMENT (ALL 5 FREQUENCIES)
    // ========================================================================
    console.log("\n============================================================");
    console.log("MODULE C: SERVICE MANAGEMENT (ALL 5 FREQUENCIES)");
    console.log("============================================================\n");

    const frequenciesToTest = [
      { freq: "monthly", label: "Monthly" },
      { freq: "quarterly", label: "Quarterly" },
      { freq: "half-yearly", label: "Half-Yearly" },
      { freq: "yearly", label: "Yearly" },
    ];

    for (const item of frequenciesToTest) {
      console.log(`--- Testing Recurring Frequency: ${item.label} ---`);
      const createRecSrvRes = await api("/services/create", {
        method: "POST",
        body: JSON.stringify({
          customer: testCustomer._id,
          employee: testEmployee._id,
          serviceName: `AMC Pest Control - ${item.label}`,
          frequency: item.freq,
          serviceDate: "2026-11-20",
          address: "Flat 101, Audit Heights, Andheri East, Mumbai",
          amount: 12000,
        }),
      });
      assert(createRecSrvRes.status === 201, `Recurring service (${item.label}) created successfully`);
      const recService = createRecSrvRes.data.service;
      createdIds.services.push(recService._id);

      if (item.freq === "yearly") {
        assert(recService.nextServiceDate === null || recService.nextServiceDate === undefined, `${item.label} has no extra nextServiceDate in same 12-month cycle`);
        assert(Array.isArray(recService.upcomingServiceDates) && recService.upcomingServiceDates.length === 0, `${item.label} has 0 extra upcomingServiceDates in same cycle`);
      } else {
        assert(Boolean(recService.nextServiceDate), `${item.label} calculated nextServiceDate`);
        assert(Array.isArray(recService.upcomingServiceDates) && recService.upcomingServiceDates.length > 0, `${item.label} populated upcomingServiceDates`);
      }
      assert(String(recService.customer?._id || recService.customer) === String(testCustomer._id), `${item.label} associated with CRM customer`);
      assert(String(recService.employee?._id || recService.employee) === String(testEmployee._id), `${item.label} associated with CRM employee`);

      // Edit recurring service
      const editRecRes = await api(`/services/${recService._id}`, {
        method: "PUT",
        body: JSON.stringify({
          customer: testCustomer._id,
          employee: testEmployee._id,
          serviceName: `AMC Pest Control - ${item.label} (Updated)`,
          frequency: item.freq,
          amount: 14000,
        }),
      });
      assert(editRecRes.status === 200, `Recurring service (${item.label}) updated successfully`);
      const updatedRecInDb = await Service.findById(recService._id);
      assert(updatedRecInDb.amount === 14000, `Recurring service (${item.label}) amount persisted as 14000`);
    }

    // Test combinations on One-Time Jobs:
    // Combo 1: Registered Customer + Manual Operator
    console.log("\n--- Testing OTJ: Registered Customer + Manual Operator ---");
    const otjCombo1Res = await api("/services/create", {
      method: "POST",
      body: JSON.stringify({
        customer: testCustomer._id,
        operatorName: "Independent Contractor Sam",
        serviceName: "One-Time General Spray",
        frequency: "one-time",
        serviceDate: "2026-11-25",
        address: "Sample Address",
        amount: 2500,
      }),
    });
    assert(otjCombo1Res.status === 201, "OTJ (Registered Customer + Manual Operator) created successfully");
    createdIds.services.push(otjCombo1Res.data.service._id);
    assert(otjCombo1Res.data.service.operatorName === "Independent Contractor Sam", "Manual operator name correctly assigned");

    // Combo 2: Manual Customer + Registered Employee
    console.log("--- Testing OTJ: Manual Customer + Registered Employee ---");
    const otjCombo2Res = await api("/services/create", {
      method: "POST",
      body: JSON.stringify({
        customerName: "Walk-in Customer Mr. Verma",
        employee: testEmployee._id,
        serviceName: "One-Time Fogging",
        frequency: "one-time",
        serviceDate: "2026-11-26",
        address: "Chembur Naka",
        amount: 3000,
      }),
    });
    assert(otjCombo2Res.status === 201, "OTJ (Manual Customer + Registered Employee) created successfully");
    createdIds.services.push(otjCombo2Res.data.service._id);
    assert(otjCombo2Res.data.service.customerName === "Walk-in Customer Mr. Verma", "Manual customer name recorded");


    // ========================================================================
    // MODULE D: PC AND ATT QUOTATIONS
    // ========================================================================
    console.log("\n============================================================");
    console.log("MODULE D: PC AND ATT QUOTATIONS");
    console.log("============================================================\n");

    // PC Quotation with CRM Customer
    console.log("--- PC Quotation with CRM Customer ---");
    const pcCustRes = await api("/quotations/create", {
      method: "POST",
      body: JSON.stringify({
        quotationType: "PC",
        customer: testCustomer._id,
        premises: "Commercial Kitchen, Lower Parel",
        services: [
          { serviceName: "General Pest Control", frequency: "Monthly", cost: 6000, location: "Kitchen" },
        ],
        subtotal: 6000,
        totalTax: 1080,
        totalAmount: 7080,
        paymentTerm: "Within 15 days",
        status: "Draft",
      }),
    });
    assert(pcCustRes.status === 201, "PC Quotation (CRM Customer) created successfully");
    const pcQuotation = pcCustRes.data.quotation;
    createdIds.quotations.push(pcQuotation._id);
    assert(pcQuotation.quotationNumber?.startsWith("SPM/PC/"), "PC Quotation has SPM/PC/ prefix", pcQuotation.quotationNumber);

    // PC Quotation with Manual Customer
    console.log("--- PC Quotation with Manual Customer ---");
    const custCountBeforeManualQtn = await Customer.countDocuments();
    const pcManualRes = await api("/quotations/create", {
      method: "POST",
      body: JSON.stringify({
        quotationType: "PC",
        customer: null,
        customerName: `${AUDIT_TAG}_ManualQtnClient`,
        customerPhone: "9820011223",
        customerAddress: "Dadar West, Mumbai",
        premises: "Office Premises",
        services: [
          { serviceName: "Cockroach Gel Treatment", frequency: "Single", cost: 3500 },
        ],
        subtotal: 3500,
        totalAmount: 3500,
        status: "Draft",
      }),
    });
    assert(pcManualRes.status === 201, "PC Quotation (Manual Customer) created successfully");
    const pcManualQtn = pcManualRes.data.quotation;
    createdIds.quotations.push(pcManualQtn._id);
    const custCountAfterManualQtn = await Customer.countDocuments();
    assert(custCountBeforeManualQtn === custCountAfterManualQtn, "Zero Customer documents created for manual quotation customer");
    assert(pcManualQtn.customerSnapshot?.customerName === `${AUDIT_TAG}_ManualQtnClient`, "Manual customer data stored in snapshot");

    // ATT Quotation with CRM Customer
    console.log("--- ATT Quotation with CRM Customer ---");
    const attCustRes = await api("/quotations/create", {
      method: "POST",
      body: JSON.stringify({
        quotationType: "ATT",
        customer: testCustomer._id,
        premises: "Construction Site, Navi Mumbai",
        treatmentType: "Anti-Termite Pre-Construction Treatment",
        plinthArea: "5000 sq ft",
        ratePerSqFt: 15,
        subtotal: 75000,
        totalAmount: 75000,
        status: "Draft",
      }),
    });
    assert(attCustRes.status === 201, "ATT Quotation (CRM Customer) created successfully");
    const attQuotation = attCustRes.data.quotation;
    createdIds.quotations.push(attQuotation._id);
    assert(attQuotation.quotationNumber?.startsWith("SPM/ATT/"), "ATT Quotation has SPM/ATT/ prefix", attQuotation.quotationNumber);

    // Edit Quotation
    const editQtnRes = await api(`/quotations/${pcQuotation._id}`, {
      method: "PUT",
      body: JSON.stringify({
        premises: "Commercial Kitchen, Lower Parel - Expanded Area",
        status: "Sent",
      }),
    });
    assert(editQtnRes.status === 200, "Quotation updated successfully");
    const updatedQtnInDb = await Quotation.findById(pcQuotation._id);
    assert(updatedQtnInDb.status === "Sent", "Quotation status updated to Sent in database");

    // Generate Quotation Documents
    const qtnDocx = await generateQuotationDocx(pcQuotation);
    assert(Boolean(qtnDocx?.buffer), "Quotation DOCX generated successfully");
    const attDocx = await generateQuotationDocx(attQuotation);
    assert(Boolean(attDocx?.buffer), "ATT Quotation DOCX generated successfully");


    // ========================================================================
    // MODULE E: INVOICE MANAGEMENT (GST & NON-GST)
    // ========================================================================
    console.log("\n============================================================");
    console.log("MODULE E: INVOICE MANAGEMENT (GST & NON-GST)");
    console.log("============================================================\n");

    // GST Invoice Creation
    console.log("--- GST Invoice Creation ---");
    const gstInvRes = await api("/invoices/create", {
      method: "POST",
      body: JSON.stringify({
        invoiceType: "GST",
        customerId: testCustomer._id,
        customerName: testCustomer.fullName,
        services: [createdIds.services[1]], // one of our AMC services
        invoiceDate: "2026-11-20",
        billingPeriod: "26 AUG 2026 to 25 SEPT 2026",
        subtotal: 10000,
        cgstPercentage: 9,
        sgstPercentage: 9,
        igstPercentage: 0,
        totalAmount: 11800,
        paymentStatus: "Pending",
      }),
    });
    assert(gstInvRes.status === 201, "GST Invoice created successfully with status 201", JSON.stringify(gstInvRes.data));
    const gstInvoice = gstInvRes.data.invoice;
    createdIds.invoices.push(gstInvoice._id);
    assert(gstInvoice.invoiceNumber?.startsWith("SPM/"), "GST Invoice has SPM/ prefix", gstInvoice.invoiceNumber);

    // Non-GST Invoice Creation
    console.log("--- Non-GST Invoice Creation ---");
    const nonGstInvRes = await api("/invoices/create", {
      method: "POST",
      body: JSON.stringify({
        invoiceType: "NON_GST",
        customerId: testCustomer._id,
        customerName: testCustomer.fullName,
        services: [createdIds.services[2]],
        invoiceDate: "2026-11-20",
        billingPeriod: "26 AUG 2026 to 25 SEPT 2026",
        subtotal: 8000,
        totalAmount: 8000,
        paymentStatus: "Pending",
      }),
    });
    assert(nonGstInvRes.status === 201, "Non-GST Invoice created successfully with status 201", JSON.stringify(nonGstInvRes.data));
    const nonGstInvoice = nonGstInvRes.data.invoice;
    createdIds.invoices.push(nonGstInvoice._id);
    assert(nonGstInvoice.invoiceNumber?.startsWith("SPMJ/"), "Non-GST Invoice has SPMJ/ prefix", nonGstInvoice.invoiceNumber);

    // Edit Invoice
    const editInvRes = await api(`/invoices/${gstInvoice._id}`, {
      method: "PUT",
      body: JSON.stringify({
        customer: testCustomer._id,
        paymentStatus: "Partially Paid",
        paymentMethod: "Bank Transfer",
        amountPaid: 5000,
      }),
    });
    assert(editInvRes.status === 200, "Invoice updated successfully with status 200");
    const updatedInvInDb = await Invoice.findById(gstInvoice._id);
    assert(updatedInvInDb.paymentStatus === "Partially Paid", "Invoice paymentStatus updated to Partially Paid");
    assert(updatedInvInDb.paymentMethod === "Bank Transfer", "Invoice paymentMethod persisted");


    // ========================================================================
    // MODULE F: CONTRACT RENEWALS
    // ========================================================================
    console.log("\n============================================================");
    console.log("MODULE F: CONTRACT RENEWALS");
    console.log("============================================================\n");

    const createRenRes = await api("/renewals/create", {
      method: "POST",
      body: JSON.stringify({
        customer: testCustomer._id,
        services: [
          {
            serviceName: "AMC Pest Control Annual Renewal",
            frequency: "Monthly",
            amount: 15000,
          },
        ],
        contractEndDate: "2027-11-19",
        paymentTerm: "Quarterly Advance",
        subtotal: 15000,
        totalAmount: 15000,
        status: "Draft",
      }),
    });
    assert(createRenRes.status === 201, "Contract Renewal created with status 201");
    const testRenewal = createRenRes.data.renewal;
    createdIds.renewals.push(testRenewal._id);
    assert(Boolean(testRenewal.renewalNumber), "Renewal allocated renewalNumber", testRenewal.renewalNumber);

    // Edit Renewal
    const editRenRes = await api(`/renewals/${testRenewal._id}`, {
      method: "PUT",
      body: JSON.stringify({
        customer: testCustomer._id,
        status: "Sent",
        paymentTerm: "Bi-Monthly Advance",
      }),
    });
    assert(editRenRes.status === 200, "Renewal updated successfully", JSON.stringify(editRenRes.data));
    const updatedRenInDb = await Renewal.findById(testRenewal._id);
    assert(updatedRenInDb.status === "Sent", "Renewal status persisted as Sent");


    // ========================================================================
    // MODULE G: EMPLOYEE ATTENDANCE / HR
    // ========================================================================
    console.log("\n============================================================");
    console.log("MODULE G: EMPLOYEE ATTENDANCE / HR");
    console.log("============================================================\n");

    const now = new Date();
    const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // Query active employees as done in frontend Attendance.jsx
    const activeEmployees = await Employee.find({ status: "active" });

    // Mark Attendance (present)
    const initialAttendanceList = activeEmployees.map((emp) => ({
      employee: emp._id.toString(),
      status: "present",
      remarks: "On time for audit shift",
    }));

    const markAttRes1 = await api("/attendance/mark", {
      method: "POST",
      body: JSON.stringify({
        date: todayDateStr,
        attendance: initialAttendanceList,
      }),
    });
    assert(markAttRes1.status === 200, "Attendance marked successfully with status 200", JSON.stringify(markAttRes1.data));
    const savedRecord = markAttRes1.data.attendance?.find(a => String(a.employee?._id || a.employee) === String(testEmployee._id));
    assert(Boolean(savedRecord), "Attendance record saved and returned in response");
    assert(savedRecord.status === "present", "Attendance status is present");
    if (savedRecord?._id) createdIds.attendance.push(savedRecord._id);

    // Test Duplicate Employee in Same Request Rejection
    console.log("--- Duplicate Employee in Same Request Rejection ---");
    const dupRes = await api("/attendance/mark", {
      method: "POST",
      body: JSON.stringify({
        date: todayDateStr,
        attendance: [
          { employee: testEmployee._id.toString(), status: "present" },
          { employee: testEmployee._id.toString(), status: "absent" },
        ],
      }),
    });
    assert(dupRes.status === 400, "Duplicate employee submission rejected with status 400");
    assert(dupRes.data.message === "Duplicate employee attendance is not allowed", "API returned duplicate employee error");

    // Test Same-Day Upsert Update
    console.log("--- Update Existing Attendance Record on Same Date ---");
    const updatedAttendanceList = activeEmployees.map((emp) => ({
      employee: emp._id.toString(),
      status: emp._id.toString() === testEmployee._id.toString() ? "half-day" : "present",
      remarks: emp._id.toString() === testEmployee._id.toString() ? "Updated to half-day" : "Present",
    }));

    const updateAttRes = await api("/attendance/mark", {
      method: "POST",
      body: JSON.stringify({
        date: todayDateStr,
        attendance: updatedAttendanceList,
      }),
    });
    assert(updateAttRes.status === 200, "Attendance record updated successfully with status 200");
    const updatedAttInDb = await Attendance.find({ employee: testEmployee._id });
    assert(updatedAttInDb.length === 1, "Exactly 1 attendance record exists in DB (upserted without duplicate)");
    assert(updatedAttInDb[0].status === "half-day", "Attendance status updated to half-day in database");

    // Filter Attendance by Employee
    const filterEmpAttRes = await api(`/attendance/employee/${testEmployee._id}`);
    assert(filterEmpAttRes.status === 200, "Employee attendance query responded status 200");
    assert(Array.isArray(filterEmpAttRes.data.attendance || filterEmpAttRes.data) && (filterEmpAttRes.data.attendance || filterEmpAttRes.data).length > 0, "Employee attendance records retrieved");


    // ========================================================================
    // MODULE H: PAYMENT MANAGEMENT
    // ========================================================================
    console.log("\n============================================================");
    console.log("MODULE H: PAYMENT MANAGEMENT");
    console.log("============================================================\n");

    // Record Payment on Service
    console.log("--- Record Payment on Service ---");
    const srvPaymentRes = await api(`/services/${createdOtj._id}/payment`, {
      method: "POST",
      body: JSON.stringify({
        amount: 1000,
        paymentDate: "2026-11-23",
        paymentMode: "UPI / GPay",
        note: "Partial settlement via UPI",
      }),
    });
    assert(srvPaymentRes.status === 200, "Service payment recorded successfully with status 200");
    const srvAfterPay = await Service.findById(createdOtj._id).lean();
    assert(srvAfterPay.paidAmount === 2500, "Service paidAmount increased by 1000 to 2500", `Got: ${srvAfterPay.paidAmount}`);
    assert(srvAfterPay.balanceAmount === 2500, "Service balanceAmount reduced to 2500", `Got: ${srvAfterPay.balanceAmount}`);
    assert(srvAfterPay.paymentHistory.length >= 1, "Service paymentHistory entry recorded");
    const lastPayEntry = srvAfterPay.paymentHistory[srvAfterPay.paymentHistory.length - 1];
    assert(lastPayEntry.amount === 1000, "Payment history entry amount matches 1000");
    assert(lastPayEntry.mode === "UPI / GPay", "Payment mode matches UPI / GPay");


    // ========================================================================
    // CROSS-MODULE DEPENDENCIES & DATA INTEGRITY
    // ========================================================================
    console.log("\n============================================================");
    console.log("CROSS-MODULE DEPENDENCIES & DATA INTEGRITY VERIFICATION");
    console.log("============================================================\n");

    // 1. Verify Customer Availability in Service, Invoice, and Quotation
    const linkedService = await Service.findOne({ customer: testCustomer._id });
    const linkedInvoice = await Invoice.findOne({ customer: testCustomer._id });
    const linkedQuotation = await Quotation.findOne({ customer: testCustomer._id });
    assert(Boolean(linkedService), "Customer successfully linked and queryable across Services");
    assert(Boolean(linkedInvoice), "Customer successfully linked and queryable across Invoices");
    assert(Boolean(linkedQuotation), "Customer successfully linked and queryable across Quotations");

    // 2. Soft-Delete Customer and verify dependent documents are NOT corrupted
    console.log("--- Customer Soft Deletion / Archiving & Reference Preservation ---");
    const delCustRes = await api(`/customers/${testCustomer._id}`, { method: "DELETE" });
    assert(delCustRes.status === 200, "Customer soft-deleted / archived successfully");

    const archivedCustomer = await Customer.findById(testCustomer._id);
    assert(archivedCustomer.isArchived === true, "Customer isArchived flag set to true");
    assert(archivedCustomer.jobNo === undefined || archivedCustomer.jobNo === null, "Active jobNo released for reuse");

    // Check that related documents still retain their customer snapshot intact
    const serviceAfterCustArchive = await Service.findById(linkedService._id);
    assert(Boolean(serviceAfterCustArchive.customerSnapshot?.fullName), "Service customerSnapshot preserved after customer archive");
    const invoiceAfterCustArchive = await Invoice.findById(linkedInvoice._id);
    assert(Boolean(invoiceAfterCustArchive.customerSnapshot?.fullName || invoiceAfterCustArchive.customerName), "Invoice customerSnapshot preserved after customer archive");


    // ========================================================================
    // CLEANUP TEMPORARY AUDIT TEST RECORDS ONLY
    // ========================================================================
    console.log("\n============================================================");
    console.log("SAFE AUDIT CLEANUP: PURGING ONLY TEMPORARY TEST RECORDS");
    console.log("============================================================\n");

    const cleanedCounts = {
      services: (await Service.deleteMany({ _id: { $in: createdIds.services } })).deletedCount,
      invoices: (await Invoice.deleteMany({ _id: { $in: createdIds.invoices } })).deletedCount,
      quotations: (await Quotation.deleteMany({ _id: { $in: createdIds.quotations } })).deletedCount,
      renewals: (await Renewal.deleteMany({ _id: { $in: createdIds.renewals } })).deletedCount,
      attendance: (await Attendance.deleteMany({ _id: { $in: createdIds.attendance } })).deletedCount,
      employees: (await Employee.deleteMany({ _id: { $in: createdIds.employees } })).deletedCount,
      customers: (await Customer.deleteMany({ _id: { $in: createdIds.customers } })).deletedCount,
    };

    // Clean up audit test admin and any audit job numbers
    await Admin.deleteMany({ email: "audit_tester@example.com" });
    if (testCustomer && testCustomer.jobNo) {
      await JobNumber.deleteMany({ jobNo: testCustomer.jobNo });
    }

    console.log("Audit records cleaned up safely:", cleanedCounts);
    assert(cleanedCounts.services === createdIds.services.length, "All temporary audit services deleted");
    assert(cleanedCounts.invoices === createdIds.invoices.length, "All temporary audit invoices deleted");
    assert(cleanedCounts.quotations === createdIds.quotations.length, "All temporary audit quotations deleted");
    assert(cleanedCounts.renewals === createdIds.renewals.length, "All temporary audit renewals deleted");
    assert(cleanedCounts.attendance === createdIds.attendance.length, "All temporary audit attendance records deleted");
    assert(cleanedCounts.employees === createdIds.employees.length, "All temporary audit employees deleted");
    assert(cleanedCounts.customers === createdIds.customers.length, "All temporary audit customers deleted");

    console.log("\n============================================================");
    console.log(`AUDIT COMPLETE: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log("============================================================\n");

  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

runAudit()
  .then(() => {
    console.log("Audit test suite finished execution.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("FATAL AUDIT ERROR:", err);
    process.exit(1);
  });
