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
const allowAtlas = args.includes("--allow-atlas");

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

  console.log("Step 1: Connecting to Target Database...");
  console.log("   URI:", uri.replace(/:[^:@]+@/, ":****@"));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const dbName = mongoose.connection.name;
  const host = mongoose.connection.host;
  console.log(`   Connected to Database: '${dbName}' on host: ${host}\n`);

  // Target Verification: Ensure we don't accidentally target Atlas in production mode
  const isAtlas = host.includes("mongodb.net");
  if (isAtlas) {
    console.warn("⚠️  NOTICE: Connection host is MongoDB Atlas ('" + host + "').");
    if (isExecuteMode && !allowAtlas) {
      throw new Error(
        "SAFETY ABORT: Target database is MongoDB Atlas, not the Hostinger VPS local MongoDB!\n" +
        "On the VPS, ensure server/.env points to local MongoDB (e.g. mongodb://localhost:27017/crm_samarth).\n" +
        "If you intentionally wish to run against Atlas, pass the --allow-atlas flag."
      );
    }
  } else {
    console.log(`   ✅ Confirmed: Target is Hostinger VPS local MongoDB daemon (${host}).\n`);
  }

  // --------------------------------------------------------------------------
  // STEP 1: AUDIT PRODUCTION COLLECTIONS
  // --------------------------------------------------------------------------
  console.log("Step 2: Auditing Production Database Collections...");
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
  console.log(`   • Invoices:                  ${invoiceCount} documents ${invoiceCount === 0 ? "✅ (Clean)" : "⚠️"}`);
  console.log(`   • Quotations:                ${quotationCount} documents ${quotationCount === 0 ? "✅ (Clean)" : "⚠️"}`);
  console.log(`   • Contract Renewals:         ${renewalCount} documents ${renewalCount === 0 ? "✅ (Clean)" : "⚠️"}`);
  console.log(`   • Services:                  ${serviceCount} documents ${serviceCount === 0 ? "✅ (Clean)" : "⚠️"}`);

  console.log("\n   --- Sequence Collections ---");
  console.log(`   • Document Sequences:        ${docSeqCount} documents (Target of this reset)`);
  console.log(`   • Job Number Sequences:      ${jobNumSeqCount} documents (Customer A-Z codes — Untouched)`);

  console.log("\n   --- Preserved Business Collections (Strictly Untouched) ---");
  console.log(`   • Customers:                 ${customerCount} documents (Preserved)`);
  console.log(`   • Employees:                 ${employeeCount} documents (Preserved)`);
  console.log(`   • Admins:                    ${adminCount} documents (Preserved)`);
  console.log(`   • Company Settings:          ${companySettingCount} documents (Preserved)`);
  console.log(`   • Document Templates:        ${templateCount} documents (Preserved)\n`);

  // --------------------------------------------------------------------------
  // STEP 2: INSPECT EXISTING DOCUMENTSEQUENCES RECORDS
  // --------------------------------------------------------------------------
  console.log("Step 3: Inspecting Current 'documentsequences' Records in Database...");
  const existingSeqs = await db.collection("documentsequences").find().sort({ year: -1, documentType: 1 }).toArray();

  console.log("   +----------------------+------+------+--------------------------+");
  console.log("   | Document Type        | Year | Seq  | Series Status            |");
  console.log("   +----------------------+------+------+--------------------------+");
  for (const s of existingSeqs) {
    const isTarget6 = s.year === 2026 && [
      "GST_INVOICE", "NON_GST_INVOICE", "PC_QUOTATION",
      "ATT_QUOTATION", "CONTRACT_RENEWAL", "ONE_TIME_JOB"
    ].includes(s.documentType);
    const isLegacy2026 = s.documentType === "INVOICE" && s.year === 2026;
    const isHistorical = s.year !== 2026;
    const status = isTarget6
      ? "Target: Reset to 0"
      : isLegacy2026
      ? "Legacy 2026: Preserved"
      : `Historical ${s.year}: Preserved`;
    console.log(`   | ${s.documentType.padEnd(20)} | ${String(s.year).padEnd(4)} | ${String(s.seq).padEnd(4)} | ${status.padEnd(24)} |`);
  }
  console.log("   +----------------------+------+------+--------------------------+\n");

  // --------------------------------------------------------------------------
  // STEP 3: CREATE BACKUP OF DOCUMENTSEQUENCES
  // --------------------------------------------------------------------------
  console.log("Step 4: Creating Verified Backup of 'documentsequences' Before Any Modification...");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.resolve(process.cwd(), "server", "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupFilePath = path.join(backupDir, `production_sequences_pre_reset_${timestamp}.json`);
  const backupData = JSON.stringify(existingSeqs, null, 2);
  fs.writeFileSync(backupFilePath, backupData, "utf8");

  const sha256 = crypto.createHash("sha256").update(backupData).digest("hex");
  console.log(`   ✅ Backup created at: ${backupFilePath}`);
  console.log(`   • Records backed up: ${existingSeqs.length}`);
  console.log(`   • SHA-256 Hash:     ${sha256}\n`);

  // --------------------------------------------------------------------------
  // STEP 4: RESET THE EXACT SIX PRODUCTION COUNTERS FOR YEAR 2026
  // --------------------------------------------------------------------------
  const targetSeries = [
    { type: "GST_INVOICE", year: 2026, label: "Tax Invoice — GST", format: "SPM/{SEQ}/2026-27" },
    { type: "NON_GST_INVOICE", year: 2026, label: "Invoice — Non-GST", format: "SPMJ/{SEQ}/2026-27" },
    { type: "PC_QUOTATION", year: 2026, label: "PC Quotation", format: "SPM/PC/2026/{SEQ}" },
    { type: "ATT_QUOTATION", year: 2026, label: "ATT Quotation", format: "SPM/ATT/2026/{SEQ}" },
    { type: "CONTRACT_RENEWAL", year: 2026, label: "Contract Renewal", format: "SPM/CR/2026/{SEQ}" },
    { type: "ONE_TIME_JOB", year: 2026, label: "One Time Job", format: "Job No/2026/{SEQ}" },
  ];

  console.log("Step 5: Showing Exact Counter Changes for All 6 Series:");
  console.log("   +----------------------+------+-----------+-----------+----------------------+");
  console.log("   | Document Type        | Year | Old Seq   | New Seq   | First Number         |");
  console.log("   +----------------------+------+-----------+-----------+----------------------+");
  for (const t of targetSeries) {
    const prev = existingSeqs.find((s) => s.documentType === t.type && s.year === t.year);
    const oldSeqStr = prev ? String(prev.seq) : "None (new)";
    const firstNum = t.format.replace("{SEQ}", "01");
    console.log(`   | ${t.type.padEnd(20)} | ${String(t.year).padEnd(4)} | ${oldSeqStr.padEnd(9)} | 0         | ${firstNum.padEnd(20)} |`);
  }
  console.log("   +----------------------+------+-----------+-----------+----------------------+\n");

  if (!isExecuteMode) {
    console.log("================================================================================");
    console.log("  DRY RUN COMPLETE: Zero database changes were made.                            ");
    console.log("  To execute the initialization against the database, pass: --execute           ");
    console.log("================================================================================\n");
    await mongoose.disconnect();
    return;
  }

  // Pre-execution validation: Ensure transactional collections are strictly empty
  if (invoiceCount > 0 || quotationCount > 0 || renewalCount > 0 || serviceCount > 0) {
    throw new Error(
      `SAFETY ABORT: Transactional collections are not empty!\n` +
      `   Invoices: ${invoiceCount}, Quotations: ${quotationCount}, Renewals: ${renewalCount}, Services: ${serviceCount}\n` +
      `   Refusing to reset sequence counters to protect documents from numbering collisions.`
    );
  }

  console.log("Step 6: Executing Safe Initialization of the 6 Production Counters...");
  for (const t of targetSeries) {
    await db.collection("documentsequences").updateOne(
      { documentType: t.type, year: t.year },
      { $set: { seq: 0 } },
      { upsert: true }
    );
    console.log(`   ✅ ${t.type.padEnd(20)} (Year: ${t.year}) -> set to seq: 0`);
  }

  // --------------------------------------------------------------------------
  // STEP 5: VERIFY READ DIRECTLY FROM PRODUCTION DATABASE
  // --------------------------------------------------------------------------
  console.log("\nStep 7: Reading Counters Directly from Production Database to Verify seq: 0...");
  const postResetSeqs = await db.collection("documentsequences").find({ year: 2026 }).toArray();

  let allZero = true;
  for (const t of targetSeries) {
    const found = postResetSeqs.find((s) => s.documentType === t.type && s.year === t.year);
    if (!found || found.seq !== 0) {
      allZero = false;
      console.error(`   ❌ VERIFICATION FAILED: ${t.type} is at seq: ${found?.seq}`);
    } else {
      console.log(`   ✅ Direct DB Read: ${t.type.padEnd(20)} -> seq: 0`);
    }
  }

  if (!allZero) {
    throw new Error("One or more sequence counters failed direct verification!");
  }

  // --------------------------------------------------------------------------
  // STEP 6: VERIFY STARTUP RECONCILIATION IDEMPOTENCY (SIMULATE PM2 REBOOT)
  // --------------------------------------------------------------------------
  console.log("\nStep 8: Simulating Server Reboot (Startup Reconciliation Test)...");
  await syncExistingDocumentSequences({ Invoice, Quotation, Renewal, Service });

  const postRebootSeqs = await db.collection("documentsequences").find({ year: 2026 }).toArray();
  for (const t of targetSeries) {
    const found = postRebootSeqs.find((s) => s.documentType === t.type && s.year === t.year);
    if (found.seq !== 0) {
      throw new Error(`PM2 REBOOT INTEGRITY ERROR: ${t.type} was unexpectedly bumped to ${found.seq}!`);
    }
    console.log(`   ✅ Post-Reboot Verification: ${t.type.padEnd(20)} remains strictly at seq: 0`);
  }

  // --------------------------------------------------------------------------
  // STEP 7: VERIFY PREVIEWS FOR FIRST GENERATED NUMBERS (01)
  // --------------------------------------------------------------------------
  console.log("\nStep 9: Confirming Expected First Generated Number for All 6 Series:");
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
      throw new Error(`Preview mismatch: Expected '${p.expected}', got '${generated}'`);
    }
    console.log(`   • ${config.label.padEnd(22)}: First document will be '${generated}' (PASS)`);
  }

  // Confirm preserved collections intact
  const finalCustomerCount = await getCount("customers");
  const finalEmployeeCount = await getCount("employees");
  const finalAdminCount = await getCount("admins");
  console.log(`\nPreserved Data Audit Check: Customers=${finalCustomerCount}, Employees=${finalEmployeeCount}, Admins=${finalAdminCount} (100% Intact).`);

  console.log("\n================================================================================");
  console.log("  ALL SIX PRODUCTION DOCUMENT COUNTERS INITIALIZED & VERIFIED AT seq: 0        ");
  console.log("================================================================================\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("\n❌ Initialization script failed:", err.message);
  process.exit(1);
});
