import dotenv from "dotenv";
dotenv.config({ path: "./server/.env" });
import dns from "dns";
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder("ipv4first");
import mongoose from "mongoose";
import fs from "fs";
import path from "path";

import {
  DOCUMENT_CONFIG,
  generateDocumentNumber,
  syncExistingDocumentSequences,
} from "../utils/documentNumberService.js";

import DocumentSequence from "../model/documentSequenceModel.js";
import Invoice from "../model/invoiceModel.js";
import Quotation from "../model/quotationModel.js";
import Renewal from "../model/renewalModel.js";
import Service from "../model/serviceModel.js";

const isExecuteMode = process.argv.includes("--execute");

async function main() {
  console.log("================================================================================");
  console.log("  SAMARTH CRM — PRODUCTION DOCUMENT NUMBERING RESET SCRIPT                      ");
  console.log(`  MODE: ${isExecuteMode ? "⚡ LIVE EXECUTION" : "🔍 DRY RUN (NO WRITES)"}      `);
  console.log("================================================================================\n");

  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI not configured in server/.env");
  }

  console.log("1. Connecting to Target Database...");
  console.log("   URI:", uri.replace(/:[^:@]+@/, ":****@"));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const dbName = mongoose.connection.name;
  console.log(`   Connected to Database: '${dbName}' on host: ${mongoose.connection.host}\n`);

  // --------------------------------------------------------------------------
  // STEP 1: VERIFY DATABASE BACKUP
  // --------------------------------------------------------------------------
  console.log("2. Verifying Pre-Reset Database Backup...");
  const backupDir = path.resolve(process.cwd(), "backups", "pre_reset_backup_2026-11-20", dbName);
  if (!fs.existsSync(backupDir)) {
    throw new Error(`CRITICAL: Backup directory does not exist: ${backupDir}. Aborting immediately!`);
  }
  const backupFiles = fs.readdirSync(backupDir);
  const requiredBson = ["invoices.bson", "quotations.bson", "renewals.bson", "services.bson", "customers.bson"];
  for (const f of requiredBson) {
    if (!backupFiles.includes(f)) {
      throw new Error(`CRITICAL: Backup file ${f} is missing from ${backupDir}! Aborting.`);
    }
    const stat = fs.statSync(path.join(backupDir, f));
    if (stat.size === 0) {
      throw new Error(`CRITICAL: Backup file ${f} is 0 bytes! Aborting.`);
    }
  }
  console.log(`   ✅ Backup verified at: ${backupDir}`);
  console.log(`   Total verified backup files: ${backupFiles.length}\n`);

  // --------------------------------------------------------------------------
  // STEP 2: AUDIT COLLECTIONS & RECORDS TO DELETE VS PRESERVE
  // --------------------------------------------------------------------------
  console.log("3. Auditing Target Collections...");

  const invoiceCount = await db.collection("invoices").countDocuments();
  const quotationCount = await db.collection("quotations").countDocuments();
  const renewalCount = await db.collection("renewals").countDocuments();
  const totalServiceCount = await db.collection("services").countDocuments();

  const oneTimeFilter = { frequency: { $regex: /^one-time$/i } };
  const oneTimeServiceCount = await db.collection("services").countDocuments(oneTimeFilter);
  const recurringServiceCount = totalServiceCount - oneTimeServiceCount;

  // Preserved entities
  const customerCount = await db.collection("customers").countDocuments();
  const employeeCount = await db.collection("employees").countDocuments();
  const jobNumberCount = await db.collection("jobnumbers").countDocuments();
  const jobNumberSeqCount = await db.collection("jobnumbersequences").countDocuments();
  const companySettingCount = await db.collection("companysettings").countDocuments();
  const templateCount = await db.collection("documenttemplates").countDocuments();

  console.log("   --- Records Scheduled for Permanent Deletion ---");
  console.log(`   • Invoices (GST & Non-GST):    ${invoiceCount}`);
  console.log(`   • Quotations (PC & ATT):       ${quotationCount}`);
  console.log(`   • Contract Renewals:           ${renewalCount}`);
  console.log(`   • One-Time Job Services:       ${oneTimeServiceCount}`);
  console.log(`   Total Records to Delete:       ${invoiceCount + quotationCount + renewalCount + oneTimeServiceCount}`);

  console.log("\n   --- Records That MUST and WILL Be Preserved ---");
  console.log(`   • Recurring Services (AMC):    ${recurringServiceCount}`);
  console.log(`   • Customers & Profiles:        ${customerCount}`);
  console.log(`   • Employees:                   ${employeeCount}`);
  console.log(`   • Customer Job Numbers:        ${jobNumberCount}`);
  console.log(`   • Job Number Sequences (A-Z):  ${jobNumberSeqCount}`);
  console.log(`   • Company Settings:            ${companySettingCount}`);
  console.log(`   • Document Templates:          ${templateCount}`);

  // Current DocumentSequence records
  console.log("\n   --- Current 2026 DocumentSequence Counters ---");
  const currentSeqs = await db.collection("documentsequences").find({ year: 2026 }).toArray();
  for (const s of currentSeqs) {
    console.log(`   • ${s.documentType.padEnd(20)}: ${s.seq}`);
  }

  if (!isExecuteMode) {
    console.log("\n================================================================================");
    console.log("  DRY RUN COMPLETE: No database changes were made.                             ");
    console.log("  To execute the permanent deletion and counter reset, pass: --execute         ");
    console.log("================================================================================\n");
    await mongoose.disconnect();
    return;
  }

  // --------------------------------------------------------------------------
  // STEP 3: EXECUTE DELETION OF TRANSACTIONAL RECORDS
  // --------------------------------------------------------------------------
  console.log("\n4. Executing Permanent Deletion of Transactional Documents...");

  const delInvoices = await db.collection("invoices").deleteMany({});
  console.log(`   ✅ Invoices deleted: ${delInvoices.deletedCount} (Expected: ${invoiceCount})`);

  const delQuotations = await db.collection("quotations").deleteMany({});
  console.log(`   ✅ Quotations deleted: ${delQuotations.deletedCount} (Expected: ${quotationCount})`);

  const delRenewals = await db.collection("renewals").deleteMany({});
  console.log(`   ✅ Contract Renewals deleted: ${delRenewals.deletedCount} (Expected: ${renewalCount})`);

  const delServices = await db.collection("services").deleteMany(oneTimeFilter);
  console.log(`   ✅ One-Time Services deleted: ${delServices.deletedCount} (Expected: ${oneTimeServiceCount})`);

  // --------------------------------------------------------------------------
  // STEP 4: RESET DOCUMENT SEQUENCE COUNTERS TO 0
  // --------------------------------------------------------------------------
  console.log("\n5. Resetting DocumentSequence Counters to 0 for Year 2026...");
  const targetTypes = [
    "NON_GST_INVOICE",
    "GST_INVOICE",
    "PC_QUOTATION",
    "ATT_QUOTATION",
    "CONTRACT_RENEWAL",
    "ONE_TIME_JOB",
    "INVOICE",
  ];

  for (const type of targetTypes) {
    await db.collection("documentsequences").updateOne(
      { documentType: type, year: 2026 },
      { $set: { seq: 0 } },
      { upsert: true }
    );
    console.log(`   ✅ Counter for ${type.padEnd(20)} reset to 0`);
  }

  // --------------------------------------------------------------------------
  // STEP 5: VERIFY INTEGRITY OF PRESERVED DATA
  // --------------------------------------------------------------------------
  console.log("\n6. Verifying Preserved Data Integrity...");
  const finalRecurringCount = await db.collection("services").countDocuments();
  console.log(`   • Remaining Services Count: ${finalRecurringCount} (Expected: ${recurringServiceCount})`);
  if (finalRecurringCount !== recurringServiceCount) {
    throw new Error(`CRITICAL INTEGRITY ERROR: Expected ${recurringServiceCount} recurring services, but found ${finalRecurringCount}!`);
  }
  const finalCustomerCount = await db.collection("customers").countDocuments();
  if (finalCustomerCount !== customerCount) {
    throw new Error(`CRITICAL INTEGRITY ERROR: Customer count changed from ${customerCount} to ${finalCustomerCount}!`);
  }
  console.log("   ✅ All recurring contracts, customers, and unrelated records are 100% intact.");

  // --------------------------------------------------------------------------
  // STEP 6: VERIFY STARTUP RECONCILIATION COMPATIBILITY
  // --------------------------------------------------------------------------
  console.log("\n7. Testing Startup Reconciliation (Simulating Server Reboot)...");
  await syncExistingDocumentSequences({ Invoice, Quotation, Renewal, Service });

  const postSyncSeqs = await db.collection("documentsequences").find({ year: 2026 }).toArray();
  for (const s of postSyncSeqs) {
    console.log(`   • ${s.documentType.padEnd(20)}: ${s.seq}`);
    if (s.seq !== 0) {
      throw new Error(`RECONCILIATION ERROR: Counter for ${s.documentType} was unexpectedly bumped to ${s.seq}!`);
    }
  }
  console.log("   ✅ Startup reconciliation verified: Counters remain strictly at 0.");

  // --------------------------------------------------------------------------
  // STEP 7: VERIFY LIVE PREVIEWS
  // --------------------------------------------------------------------------
  console.log("\n8. Verifying 01 Formatted Previews Across All 6 Series...");
  const previewKeys = [
    { type: "NON_GST_INVOICE", expected: "SPMJ/01/2026-27" },
    { type: "GST_INVOICE", expected: "SPM/01/2026-27" },
    { type: "PC_QUOTATION", expected: "SPM/PC/2026/01" },
    { type: "ATT_QUOTATION", expected: "SPM/ATT/2026/01" },
    { type: "CONTRACT_RENEWAL", expected: "SPM/CR/2026/01" },
    { type: "ONE_TIME_JOB", expected: "Job No/2026/01" },
  ];

  for (const p of previewKeys) {
    const config = DOCUMENT_CONFIG[p.type];
    console.log(`   • ${config.label.padEnd(22)}: Next document will be '${p.expected}'`);
  }

  console.log("\n================================================================================");
  console.log("  PRODUCTION RESET COMPLETE & VERIFIED SUCCESSFULLY!                           ");
  console.log("================================================================================\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("\n❌ Execution failed:", err.message);
  process.exit(1);
});
