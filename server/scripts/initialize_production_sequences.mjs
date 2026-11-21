import dotenv from "dotenv";
dotenv.config({ path: "./server/.env" });
dotenv.config({ path: "./.env" });
dotenv.config();

import dns from "dns";
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder("ipv4first");

import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import crypto from "crypto";

import {
  DOCUMENT_CONFIG,
  formatDocumentNumber,
  syncExistingDocumentSequences,
} from "../utils/documentNumberService.js";

import DocumentSequence from "../model/documentSequenceModel.js";
import Invoice from "../model/invoiceModel.js";
import Quotation from "../model/quotationModel.js";
import Renewal from "../model/renewalModel.js";
import Service from "../model/serviceModel.js";

const args = process.argv.slice(2);
const isExecuteMode = args.includes("--execute");

// Optional custom URI argument (e.g. node script.js --uri mongodb://127.0.0.1:27017/crm_samarth)
const uriArgIndex = args.indexOf("--uri");
const customUri = uriArgIndex !== -1 && args[uriArgIndex + 1] ? args[uriArgIndex + 1] : null;

async function main() {
  console.log("================================================================================");
  console.log("  SAMARTH CRM — LIVE PRODUCTION DOCUMENT NUMBERING INITIALIZATION SCRIPT       ");
  console.log(`  MODE: ${isExecuteMode ? "⚡ LIVE EXECUTION (WRITES ENABLED)" : "🔍 DRY RUN (NO WRITES)"} `);
  console.log("================================================================================\n");

  const uri = customUri || process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI not configured in server/.env or passed via --uri");
  }

  console.log("1. Connecting to Target Database...");
  console.log("   URI:", uri.replace(/:[^:@]+@/, ":****@"));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const dbName = mongoose.connection.name;
  console.log(`   ✅ Connected to Database: '${dbName}' on host: ${mongoose.connection.host}\n`);

  // --------------------------------------------------------------------------
  // STEP 1: AUDIT PRODUCTION COLLECTIONS
  // --------------------------------------------------------------------------
  console.log("2. Auditing Production Database Collections...");
  const collections = await db.listCollections().toArray();
  const collectionNames = collections.map((c) => c.name);

  const getCount = async (name) => {
    if (!collectionNames.includes(name)) return 0;
    return await db.collection(name).countDocuments();
  };

  const invoiceCount = await getCount("invoices");
  const quotationCount = await getCount("quotations");
  const renewalCount = await getCount("renewals");
  const serviceCount = await getCount("services");
  const customerCount = await getCount("customers");
  const employeeCount = await getCount("employees");
  const adminCount = await getCount("admins");
  const companySettingCount = await getCount("companysettings");
  const templateCount = await getCount("documenttemplates");
  const docSeqCount = await getCount("documentsequences");
  const jobNumCount = await getCount("jobnumbers");
  const jobNumSeqCount = await getCount("jobnumbersequences");

  console.log("   --- Transactional Document Collections ---");
  console.log(`   • Invoices:                  ${invoiceCount} documents`);
  console.log(`   • Quotations:                ${quotationCount} documents`);
  console.log(`   • Contract Renewals:         ${renewalCount} documents`);
  console.log(`   • Services:                  ${serviceCount} documents`);

  console.log("\n   --- Sequence & Job Number Collections ---");
  console.log(`   • Document Sequences:        ${docSeqCount} documents`);
  console.log(`   • Job Numbers:               ${jobNumCount} documents`);
  console.log(`   • Job Number Sequences:      ${jobNumSeqCount} documents`);

  console.log("\n   --- Preserved Business Collections (Must Remain Untouched) ---");
  console.log(`   • Customers:                 ${customerCount} documents`);
  console.log(`   • Employees:                 ${employeeCount} documents`);
  console.log(`   • Admins:                    ${adminCount} documents`);
  console.log(`   • Company Settings:          ${companySettingCount} documents`);
  console.log(`   • Document Templates:        ${templateCount} documents\n`);

  // --------------------------------------------------------------------------
  // STEP 2: INSPECT EXISTING DOCUMENTSEQUENCES RECORDS
  // --------------------------------------------------------------------------
  console.log("3. Inspecting Existing 'documentsequences' Records in Database...");
  const existingSeqs = await db.collection("documentsequences").find().sort({ year: -1, documentType: 1 }).toArray();

  if (existingSeqs.length === 0) {
    console.log("   [i] No existing sequence records found in 'documentsequences'.");
  } else {
    console.log("   +----------------------+------+------+--------------------------+");
    console.log("   | Document Type        | Year | Seq  | Status                   |");
    console.log("   +----------------------+------+------+--------------------------+");
    for (const s of existingSeqs) {
      const isCurrentActive = s.year === 2026 && [
        "GST_INVOICE", "NON_GST_INVOICE", "PC_QUOTATION",
        "ATT_QUOTATION", "CONTRACT_RENEWAL", "ONE_TIME_JOB"
      ].includes(s.documentType);
      const isLegacy = s.documentType === "INVOICE";
      const status = isCurrentActive ? "Active 2026 Series" : isLegacy ? "Legacy Alias" : "Historical Record";
      console.log(`   | ${s.documentType.padEnd(20)} | ${String(s.year).padEnd(4)} | ${String(s.seq).padEnd(4)} | ${status.padEnd(24)} |`);
    }
    console.log("   +----------------------+------+------+--------------------------+\n");
  }

  // --------------------------------------------------------------------------
  // STEP 3: TAKE VERIFIED BACKUP OF DOCUMENT SEQUENCES
  // --------------------------------------------------------------------------
  console.log("4. Creating Verified Backup of 'documentsequences' Before Any Mutation...");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.resolve(process.cwd(), "server", "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupFilePath = path.join(backupDir, `production_sequences_pre_reset_${timestamp}.json`);
  const backupData = JSON.stringify(existingSeqs, null, 2);
  fs.writeFileSync(backupFilePath, backupData, "utf8");

  const sha256 = crypto.createHash("sha256").update(backupData).digest("hex");
  console.log(`   ✅ Backup written to: ${backupFilePath}`);
  console.log(`   • Records backed up: ${existingSeqs.length}`);
  console.log(`   • SHA-256 Hash:     ${sha256}\n`);

  // --------------------------------------------------------------------------
  // STEP 4: INITIALIZE ACTIVE 2026 SEQUENCE COUNTERS TO 0
  // --------------------------------------------------------------------------
  const targetSeries = [
    { type: "GST_INVOICE", year: 2026, label: "Tax Invoice — GST", format: "SPM/{SEQ}/2026-27" },
    { type: "NON_GST_INVOICE", year: 2026, label: "Invoice — Non-GST", format: "SPMJ/{SEQ}/2026-27" },
    { type: "PC_QUOTATION", year: 2026, label: "PC Quotation", format: "SPM/PC/2026/{SEQ}" },
    { type: "ATT_QUOTATION", year: 2026, label: "ATT Quotation", format: "SPM/ATT/2026/{SEQ}" },
    { type: "CONTRACT_RENEWAL", year: 2026, label: "Contract Renewal", format: "SPM/CR/2026/{SEQ}" },
    { type: "ONE_TIME_JOB", year: 2026, label: "One Time Job", format: "Job No/2026/{SEQ}" },
    { type: "INVOICE", year: 2026, label: "Invoice Legacy Alias", format: "SPM/{SEQ}/2026-27" },
  ];

  if (!isExecuteMode) {
    console.log("5. Dry Run Mode Active — Proposed Actions:");
    for (const t of targetSeries) {
      console.log(`   [PLAN] Set ${t.type.padEnd(20)} for year ${t.year} to seq: 0 -> Next document: '${t.format.replace("{SEQ}", "01")}'`);
    }
    console.log("\n================================================================================");
    console.log("  DRY RUN COMPLETE: Zero database changes were made.                            ");
    console.log("  To execute the counter initialization, run with: --execute                   ");
    console.log("================================================================================\n");
    await mongoose.disconnect();
    return;
  }

  console.log("5. Initializing Sequence Counters to 0 for Year 2026...");
  for (const t of targetSeries) {
    await db.collection("documentsequences").updateOne(
      { documentType: t.type, year: t.year },
      { $set: { seq: 0 } },
      { upsert: true }
    );
    console.log(`   ✅ Initialized: ${t.type.padEnd(20)} (Year: ${t.year}) -> seq: 0`);
  }

  // --------------------------------------------------------------------------
  // STEP 5: VERIFY INTEGRITY OF PRESERVED DATA
  // --------------------------------------------------------------------------
  console.log("\n6. Verifying Preserved Business Data Integrity...");
  const postCustomerCount = await getCount("customers");
  const postEmployeeCount = await getCount("employees");
  const postAdminCount = await getCount("admins");

  if (postCustomerCount !== customerCount) {
    throw new Error(`CRITICAL ERROR: Customer count changed from ${customerCount} to ${postCustomerCount}!`);
  }
  if (postEmployeeCount !== employeeCount) {
    throw new Error(`CRITICAL ERROR: Employee count changed from ${employeeCount} to ${postEmployeeCount}!`);
  }
  if (postAdminCount !== adminCount) {
    throw new Error(`CRITICAL ERROR: Admin count changed from ${adminCount} to ${postAdminCount}!`);
  }
  console.log(`   ✅ Preserved collections intact (Customers: ${postCustomerCount}, Employees: ${postEmployeeCount}, Admins: ${postAdminCount})`);

  // --------------------------------------------------------------------------
  // STEP 6: TEST STARTUP RECONCILIATION IDEMPOTENCY (SIMULATE PM2 REBOOT)
  // --------------------------------------------------------------------------
  console.log("\n7. Testing Startup Reconciliation Idempotency (Simulating PM2 Restart)...");
  await syncExistingDocumentSequences({ Invoice, Quotation, Renewal, Service });

  const postSyncSeqs = await db.collection("documentsequences").find({ year: 2026 }).toArray();
  for (const s of postSyncSeqs) {
    console.log(`   • ${s.documentType.padEnd(20)}: seq = ${s.seq}`);
    if (s.seq !== 0) {
      throw new Error(`RECONCILIATION INTEGRITY ERROR: ${s.documentType} was unexpectedly bumped to ${s.seq}!`);
    }
  }
  console.log("   ✅ Startup reconciliation verified: All 2026 counters remain strictly at 0.");

  // --------------------------------------------------------------------------
  // STEP 7: VERIFY PREVIEWS ACROSS ALL 6 DOCUMENT SERIES
  // --------------------------------------------------------------------------
  console.log("\n8. Verifying 01 Formatted First Documents Across All 6 Series...");
  const previewSpecs = [
    { type: "NON_GST_INVOICE", yearStr: "2026-27", expected: "SPMJ/01/2026-27" },
    { type: "GST_INVOICE", yearStr: "2026-27", expected: "SPM/01/2026-27" },
    { type: "PC_QUOTATION", yearStr: 2026, expected: "SPM/PC/2026/01" },
    { type: "ATT_QUOTATION", yearStr: 2026, expected: "SPM/ATT/2026/01" },
    { type: "CONTRACT_RENEWAL", yearStr: 2026, expected: "SPM/CR/2026/01" },
    { type: "ONE_TIME_JOB", yearStr: 2026, expected: "Job No/2026/01" },
  ];

  for (const p of previewSpecs) {
    const config = DOCUMENT_CONFIG[p.type];
    const generated = formatDocumentNumber(p.type, p.yearStr, 1, 2);
    if (generated !== p.expected) {
      throw new Error(`Preview mismatch for ${p.type}: Expected '${p.expected}', got '${generated}'`);
    }
    console.log(`   • ${config.label.padEnd(22)}: First document will be '${generated}' (PASS)`);
  }

  console.log("\n================================================================================");
  console.log("  PRODUCTION NUMBERING INITIALIZATION COMPLETED & VERIFIED SUCCESSFULLY!        ");
  console.log("================================================================================\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("\n❌ Initialization script failed:", err.message);
  process.exit(1);
});
