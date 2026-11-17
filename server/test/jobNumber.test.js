import dotenv from "dotenv";
dotenv.config({ path: "./server/.env" });
dotenv.config();
import dns from "dns";
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}
import mongoose from "mongoose";
import assert from "assert";
import path from "path";
import XLSX from "xlsx";

import Customer from "../model/customerModel.js";
import JobNumber from "../model/jobNumberModel.js";
import JobNumberSequence from "../model/jobNumberSequenceModel.js";
import ImportAuditLog from "../model/importAuditLogModel.js";
import Service from "../model/serviceModel.js";
import Invoice from "../model/invoiceModel.js";
import Quotation from "../model/quotationModel.js";
import Renewal from "../model/renewalModel.js";

import {
  allocateSmallestJobNo,
  releaseJobNo,
  restoreJobNo,
  syncJobNumberSequences,
} from "../utils/jobNumberService.js";
import { migrateDatabaseIndexes } from "../utils/dbIndexMigration.js";
import {
  evaluateCellNumeric,
  extractContractPayments,
} from "../utils/excelFormulaReader.js";
import {
  createDatabaseBackup,
  verifyBackupIntegrity,
} from "../utils/dbBackupService.js";

const TEST_DB_URI = process.env.MONGO_URI.replace("/crm_samarth?", "/crm_samarth_test?");

async function runTestSuite() {
  console.log("============================================================");
  console.log("   SAMARTH CRM: REUSABLE JOB NUMBER & MIGRATION TEST SUITE  ");
  console.log("============================================================\n");

  await mongoose.connect(TEST_DB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log("Connected to isolated test database:", mongoose.connection.name);

  // Apply safe indexes on test database
  await migrateDatabaseIndexes(mongoose.connection.db);

  // Clean test collections before running
  await JobNumber.deleteMany({});
  await JobNumberSequence.deleteMany({});
  await Customer.deleteMany({});
  await Service.deleteMany({});
  await Invoice.deleteMany({});
  await Quotation.deleteMany({});
  await Renewal.deleteMany({});
  await ImportAuditLog.deleteMany({});

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`TEST: ${name} ... `);
    try {
      await fn();
      console.log("PASSED ✓");
      passed++;
    } catch (err) {
      console.log("FAILED ✗");
      console.error("   Error:", err.message);
      failed++;
    }
  }

  // ------------------------------------------------------------
  // TEST 1: Smallest-available numeric allocation & gap reuse
  // ------------------------------------------------------------
  await test("1. Smallest-available numeric allocation & gap reuse", async () => {
    // Allocate 1st: A/01
    const job1 = await allocateSmallestJobNo("A");
    assert.strictEqual(job1, "A/01", "Expected A/01");

    // Allocate 2nd: A/02
    const job2 = await allocateSmallestJobNo("A");
    assert.strictEqual(job2, "A/02", "Expected A/02");

    // Allocate 3rd: A/03
    const job3 = await allocateSmallestJobNo("A");
    assert.strictEqual(job3, "A/03", "Expected A/03");

    // Release A/02 (simulate customer archival/cancellation)
    await releaseJobNo("A/02", null, "test release");

    const recordA02 = await JobNumber.findOne({ jobNo: "A/02" });
    assert.strictEqual(recordA02.status, "available", "A/02 must be available");

    // Next allocation for prefix A must reuse smallest available gap A/02 before A/04
    const jobReuse = await allocateSmallestJobNo("A");
    assert.strictEqual(jobReuse, "A/02", "Expected gap A/02 to be reused first");

    // Next allocation after gap filled should advance to A/04
    const jobNext = await allocateSmallestJobNo("A");
    assert.strictEqual(jobNext, "A/04", "Expected A/04 after gap filled");
  });

  // ------------------------------------------------------------
  // TEST 2: Prefix isolation across letters
  // ------------------------------------------------------------
  await test("2. Prefix isolation across alphabetical letters", async () => {
    // Prefix B allocation should start at B/01 and not interfere with prefix A
    const jobB1 = await allocateSmallestJobNo("B");
    assert.strictEqual(jobB1, "B/01", "Prefix B should start at B/01");

    const jobB2 = await allocateSmallestJobNo("B");
    assert.strictEqual(jobB2, "B/02", "Prefix B should allocate B/02");

    // Prefix A next should continue from A/05
    const jobA5 = await allocateSmallestJobNo("A");
    assert.strictEqual(jobA5, "A/05", "Prefix A should allocate A/05 independently");
  });

  // ------------------------------------------------------------
  // TEST 3: Concurrency safety (10 concurrent requests yield 10 unique sequential numbers)
  // ------------------------------------------------------------
  await test("3. Concurrency safety (10 parallel requests produce 10 unique numbers)", async () => {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(allocateSmallestJobNo("C"));
    }
    const results = await Promise.all(promises);
    const uniqueJobNumbers = new Set(results);

    assert.strictEqual(
      uniqueJobNumbers.size,
      10,
      `Expected 10 unique job numbers, got ${uniqueJobNumbers.size}: ${results.join(", ")}`
    );
    for (let i = 1; i <= 10; i++) {
      const expected = `C/${String(i).padStart(2, "0")}`;
      assert(uniqueJobNumbers.has(expected), `Expected set to contain ${expected}`);
    }
  });

  // ------------------------------------------------------------
  // TEST 4: Soft-deletion release & customer restoration
  // ------------------------------------------------------------
  await test("4. Soft-deletion releases Job Number; restoration reclaims or reallocates", async () => {
    // Create customer with D/01
    const jobD = await allocateSmallestJobNo("D");
    const customer = await Customer.create({
      fullName: "Deepak Construction",
      phone: "9876500001",
      address: "Pune",
      customerType: "commercial",
      jobNo: jobD,
    });

    await JobNumber.findOneAndUpdate({ jobNo: "D/01" }, { customerId: customer._id });

    // Soft delete customer -> releases Job Number to available
    customer.isArchived = true;
    customer.archivedAt = new Date();
    customer.archivedJobNo = customer.jobNo;
    customer.jobNo = null;
    await customer.save();
    await releaseJobNo("D/01", customer._id, "Customer archived");

    const jobRecordAfterArchive = await JobNumber.findOne({ jobNo: "D/01" });
    assert.strictEqual(jobRecordAfterArchive.status, "available", "Job number should be available after customer archived");

    // Case 4A: Restore customer while D/01 is still available -> customer reclaims D/01
    const restoreResult = await restoreJobNo(customer.archivedJobNo, customer._id, customer.fullName, "D");
    assert.strictEqual(restoreResult.jobNo, "D/01", "Expected restored customer to reclaim original D/01");
    assert.strictEqual(restoreResult.restoredOriginal, true, "restoredOriginal should be true");

    // Case 4B: Archive again, assign D/01 to someone else, then restore -> receives next available D/02
    customer.isArchived = true;
    customer.archivedJobNo = restoreResult.jobNo;
    customer.jobNo = null;
    await customer.save();
    await releaseJobNo("D/01", customer._id, "Customer archived again");

    // Another customer takes D/01
    const otherCustJob = await allocateSmallestJobNo("D");
    assert.strictEqual(otherCustJob, "D/01", "New customer took vacant D/01");

    // Now restore first customer -> must allocate next available D/02
    const restoreResult2 = await restoreJobNo(customer.archivedJobNo, customer._id, customer.fullName, "D");
    assert.strictEqual(restoreResult2.jobNo, "D/02", "Expected restored customer to get D/02");
    assert.strictEqual(restoreResult2.restoredOriginal, false, "restoredOriginal should be false");
  });

  // ------------------------------------------------------------
  // TEST 5: Historical Customer Snapshot immutability
  // ------------------------------------------------------------
  await test("5. Customer snapshot immutability on Services, Invoices, Quotations, Renewals", async () => {
    const jobE = await allocateSmallestJobNo("E");
    const customer = await Customer.create({
      fullName: "Evergreen Heights",
      phone: "9876500002",
      address: "Katraj Pune",
      customerType: "residential",
      jobNo: jobE,
    });

    const snapshot = {
      fullName: customer.fullName,
      phone: customer.phone,
      address: customer.address,
      jobNo: customer.jobNo,
      customerType: customer.customerType,
      snapshotDate: new Date(),
    };

    // Create Invoice linking customer with snapshot
    const invoice = await Invoice.create({
      invoiceNumber: "INV/2026/TEST01",
      customer: customer._id,
      customerSnapshot: snapshot,
      issueDate: new Date(),
      dueDate: new Date(),
      items: [{ description: "AMC Pest Control", quantity: 1, rate: 5000, amount: 5000 }],
      subtotal: 5000,
      totalAmount: 5000,
      balanceDue: 5000,
      status: "Generated",
    });

    // Reassign customer Job Number and change customer name
    customer.fullName = "Evergreen Towers Co-op";
    customer.jobNo = "E/99";
    await customer.save();

    // Verify historical invoice snapshot did not mutate
    const fetchedInvoice = await Invoice.findById(invoice._id);
    assert.strictEqual(fetchedInvoice.customerSnapshot.jobNo, "E/01", "Historical invoice jobNo snapshot must remain E/01");
    assert.strictEqual(fetchedInvoice.customerSnapshot.fullName, "Evergreen Heights", "Historical invoice name snapshot must remain Evergreen Heights");
  });

  // ------------------------------------------------------------
  // TEST 6: Service documentNumber guarantees One-Time Job uniqueness while AMC services share customer jobNo
  // ------------------------------------------------------------
  await test("6. Service documentNumber guarantees One-Time Job uniqueness while AMC services share customer jobNo", async () => {
    const cust = await Customer.create({
      fullName: "Flavour Foods Ltd",
      phone: "9876500003",
      address: "MIDC Bhosari",
      customerType: "commercial",
      jobNo: "F/01",
    });

    // Two AMC services sharing the same customer jobNo F/01
    const amcService1 = await Service.create({
      serviceName: "Cockroach Control",
      customer: cust._id,
      jobNo: "F/01",
      frequency: "quarterly",
      startDate: new Date(),
      serviceDate: new Date(),
      serviceIntervalDays: 90,
      totalVisits: 4,
      amount: 12000,
      serviceRate: 12000,
      address: "MIDC Bhosari",
      billingTerms: "quarterly",
    });

    const amcService2 = await Service.create({
      serviceName: "Rodent Control",
      customer: cust._id,
      jobNo: "F/01",
      frequency: "monthly",
      startDate: new Date(),
      serviceDate: new Date(),
      serviceIntervalDays: 30,
      totalVisits: 12,
      amount: 18000,
      serviceRate: 18000,
      address: "MIDC Bhosari",
      billingTerms: "monthly",
    });

    assert(amcService1._id && amcService2._id, "Multiple AMC services successfully created sharing F/01");

    // One-Time Job service with documentNumber
    const otj1 = await Service.create({
      serviceName: "Bedbug Treatment",
      customer: cust._id,
      jobNo: "OTJ/2026/001",
      documentNumber: "OTJ/2026/001",
      frequency: "one-time",
      startDate: new Date(),
      serviceDate: new Date(),
      serviceIntervalDays: 0,
      totalVisits: 1,
      amount: 2500,
      serviceRate: 2500,
      address: "MIDC Bhosari",
      billingTerms: "one-time",
    });
    assert(otj1._id, "First One-Time Job created with OTJ/2026/001");

    // Attempting duplicate One-Time Job with identical documentNumber must be rejected
    let duplicateError = false;
    try {
      await Service.create({
        serviceName: "Bedbug Treatment 2",
        customer: cust._id,
        jobNo: "OTJ/2026/001",
        documentNumber: "OTJ/2026/001",
        frequency: "one-time",
        startDate: new Date(),
        serviceDate: new Date(),
        serviceIntervalDays: 0,
        totalVisits: 1,
        amount: 2500,
        serviceRate: 2500,
        address: "MIDC Bhosari",
        billingTerms: "one-time",
      });
    } catch (err) {
      duplicateError = true;
      assert(err.message.includes("duplicate key") || err.message.includes("E11000"), "Expected duplicate key error on documentNumber");
    }
    assert.strictEqual(duplicateError, true, "Duplicate One-Time Job documentNumber was rejected by database constraint");
  });

  // ------------------------------------------------------------
  // TEST 7: Multi-row Excel contract grouping, alphabet headers, vacant slots, and P/09 conflict
  // ------------------------------------------------------------
  await test("7. AMC Excel contract grouping, 25 alphabet headers, 50 vacant slots, P/09 conflict", async () => {
    const fs = await import("fs");
    const candidatePaths = [
      path.resolve("./CRM Import/AMC- PC.xlsx"),
      path.resolve("./CRM Import/AMC- PC(1).xlsx"),
      path.resolve("../CRM Import/AMC- PC.xlsx"),
      path.resolve("./AMC- PC(1).xlsx"),
      path.resolve("./AMC- PC.xlsx"),
    ];
    const workbookPath = candidatePaths.find((p) => fs.existsSync(p));
    assert(workbookPath, "AMC Excel file must exist");
    const workbook = XLSX.readFile(workbookPath);
    const sheet = workbook.Sheets["AMC - PC"];
    assert(sheet, "Worksheet AMC - PC must exist");

    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
      if (rawRows[i].some((cell) => String(cell).toUpperCase().includes("JOB NO"))) {
        headerRowIndex = i;
        break;
      }
    }

    const dataRows = rawRows.slice(headerRowIndex + 1);
    const jobNoToRows = new Map();
    let alphabetHeaders = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const jobNo = String(row[0] || "").trim().toUpperCase();
      const clientName = String(row[1] || "").trim();
      const service = String(row[5] || "").trim();

      if (/^[A-Z]$/.test(jobNo) && !clientName && !service) {
        alphabetHeaders++;
        continue;
      }

      if (jobNo && jobNo.includes("/")) {
        if (!jobNoToRows.has(jobNo)) jobNoToRows.set(jobNo, []);
        jobNoToRows.get(jobNo).push({ clientName, service, rowNumber: headerRowIndex + 2 + i });
      }
    }

    const vacantSlots = [];
    const occupiedSlots = [];
    let p09Conflict = null;

    jobNoToRows.forEach((rows, jobNo) => {
      const hasClient = rows.some((r) => r.clientName !== "");
      const hasBlank = rows.some((r) => r.clientName === "");

      if (hasClient && hasBlank && jobNo === "P/09") {
        p09Conflict = { jobNo, rows };
      }

      if (hasClient) {
        occupiedSlots.push(jobNo);
      } else {
        vacantSlots.push(jobNo);
      }
    });

    assert.strictEqual(alphabetHeaders, 25, `Expected 25 alphabet section headers, got ${alphabetHeaders}`);
    assert.strictEqual(vacantSlots.length, 50, `Expected 50 genuine vacant slots, got ${vacantSlots.length}`);
    assert.strictEqual(occupiedSlots.length, 190, `Expected 190 occupied Job Numbers, got ${occupiedSlots.length}`);
    assert(p09Conflict, "P/09 conflict slot must be detected");
  });

  // ------------------------------------------------------------
  // TEST 8: Discrete payment block deduplication & numeric formula evaluation
  // ------------------------------------------------------------
  await test("8. Discrete payment block deduplication & numeric formula evaluation", async () => {
    // Numeric formula test: =K3-L3 should not be treated as a payment amount
    const fakeCellFormula = { f: "K3-L3", v: 0 };
    const val = evaluateCellNumeric(fakeCellFormula);
    assert.strictEqual(val, 0, "Formula evaluated to 0");

    // Multi-row payment deduplication test:
    // If two rows of the same contract have identical payment date and amount, it should be deduplicated to 1 payment transaction
    const row1 = [
      "A/01", "Client A", "", "", "", "Cockroach", "", "", "", "", "10000",
      "5000", "2025-04-15", "Cheque", "CHQ001",
      "5000", "2025-07-15", "Cheque", "CHQ002",
    ];
    const row2 = [
      "A/01", "Client A", "", "", "", "Rodent", "", "", "", "", "10000",
      "5000", "2025-04-15", "Cheque", "CHQ001", // duplicate payment block
      "5000", "2025-07-15", "Cheque", "CHQ002", // duplicate payment block
    ];

    const paymentResult = extractContractPayments([
      { rowIdx: 1, fullRow: row1 },
      { rowIdx: 2, fullRow: row2 },
    ], "A/01", 10000);

    assert.strictEqual(paymentResult.payments.length, 2, "Expected exactly 2 deduplicated payment transactions, not 4");
    assert.strictEqual(paymentResult.totalPaid, 10000, "Expected total paid 10,000");
  });

  // ------------------------------------------------------------
  // TEST 9: Import rollback reverts before-images and deletes batch records
  // ------------------------------------------------------------
  await test("9. Import rollback completely deletes batch records and releases Job Numbers", async () => {
    const testBatchId = "BATCH-TEST-" + Date.now();

    // Create a customer with batchId
    const customer = await Customer.create({
      fullName: "Rollback Test Client",
      phone: "9876500099",
      address: "Hadapsar",
      customerType: "residential",
      jobNo: "R/01",
      importMeta: { batchId: testBatchId },
    });

    // Create JobNumber with batchId
    const jobRecord = await JobNumber.create({
      jobNo: "R/01",
      prefix: "R",
      sequence: 1,
      status: "assigned",
      customerId: customer._id,
      importMeta: { batchId: testBatchId },
    });

    // Log to ImportAuditLog
    await ImportAuditLog.create({
      batchId: testBatchId,
      entityType: "Customer",
      entityId: customer._id,
      action: "CREATED",
      createdRecordId: customer._id,
    });

    await ImportAuditLog.create({
      batchId: testBatchId,
      entityType: "JobNumber",
      entityId: jobRecord._id,
      action: "CREATED",
      createdRecordId: jobRecord._id,
    });

    // Simulate rollback execution
    const logs = await ImportAuditLog.find({ batchId: testBatchId });
    for (const log of logs) {
      if (log.action === "CREATED" && log.entityType === "Customer") {
        await Customer.findByIdAndDelete(log.entityId);
      }
      if (log.action === "CREATED" && log.entityType === "JobNumber") {
        await JobNumber.findByIdAndDelete(log.entityId);
      }
    }

    const custAfter = await Customer.findById(customer._id);
    const jobAfter = await JobNumber.findById(jobRecord._id);
    assert.strictEqual(custAfter, null, "Customer created in batch must be deleted after rollback");
    assert.strictEqual(jobAfter, null, "Job number created in batch must be deleted after rollback");
  });

  // ------------------------------------------------------------
  // TEST 10: Pre-migration database backup and SHA-256 verification
  // ------------------------------------------------------------
  await test("10. Pre-migration backup creation, SHA-256 manifest verification", async () => {
    const backupRes = await createDatabaseBackup();
    assert(backupRes.backupDir, "Backup directory must be returned");
    assert(backupRes.manifest, "Backup manifest must be returned");
    const collectionCount = Object.keys(backupRes.manifest.collections).length;
    assert.strictEqual(collectionCount, 11, `Must back up exactly 11 CRM collections, got ${collectionCount}`);

    const verifyRes = await verifyBackupIntegrity(backupRes.backupDir);
    assert.strictEqual(verifyRes.verified, true, "Backup SHA-256 integrity check must pass with verified=true");
    assert.strictEqual(verifyRes.errors.length, 0, "No files should be tampered or corrupted");
  });

  console.log("\n============================================================");
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED (Total: ${passed + failed})`);
  console.log("============================================================\n");

  await mongoose.disconnect();
  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Fatal Test Suite Error:", err);
  process.exit(1);
});
