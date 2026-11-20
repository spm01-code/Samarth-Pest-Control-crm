import dotenv from "dotenv";
dotenv.config({ path: "./server/.env" });
import dns from "dns";
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder("ipv4first");
import mongoose from "mongoose";

async function inspectDb() {
  const uri = process.env.MONGO_URI;
  console.log("Connecting to:", uri.replace(/:[^:@]+@/, ":****@"));
  
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;
  console.log(`Connected to Database: '${mongoose.connection.name}' on host: ${mongoose.connection.host}\n`);

  const collections = await db.listCollections().toArray();
  console.log("Collections present in database:");
  for (const c of collections) {
    const count = await db.collection(c.name).countDocuments();
    console.log(`  - ${c.name.padEnd(25)}: ${count} documents`);
  }

  console.log("\n--- Breakdown of Records to Delete vs Preserve ---");

  // Invoices
  const totalInvoices = await db.collection("invoices").countDocuments();
  const gstInvoices = await db.collection("invoices").countDocuments({ invoiceType: "GST" });
  const nonGstInvoices = await db.collection("invoices").countDocuments({ invoiceType: "NON_GST" });
  console.log(`Invoices Total: ${totalInvoices} (GST: ${gstInvoices}, Non-GST: ${nonGstInvoices})`);

  // Quotations
  const totalQuotations = await db.collection("quotations").countDocuments();
  const pcQuotations = await db.collection("quotations").countDocuments({ quotationType: "PC" });
  const attQuotations = await db.collection("quotations").countDocuments({ quotationType: "ATT" });
  console.log(`Quotations Total: ${totalQuotations} (PC: ${pcQuotations}, ATT: ${attQuotations})`);

  // Renewals
  const totalRenewals = await db.collection("renewals").countDocuments();
  console.log(`Renewals Total: ${totalRenewals}`);

  // Services
  const totalServices = await db.collection("services").countDocuments();
  const frequencyAgg = await db.collection("services").aggregate([
    { $group: { _id: { $toLower: { $trim: { input: "$frequency" } } }, count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  console.log(`Services Total: ${totalServices}`);
  console.log("Services breakdown by frequency:");
  for (const f of frequencyAgg) {
    console.log(`  - frequency '${f._id}': ${f.count} records`);
  }

  // DocumentSequence
  const sequences = await db.collection("documentsequences").find().toArray();
  console.log("\nCurrent DocumentSequence records:");
  for (const s of sequences) {
    console.log(`  - documentType: '${s.documentType}', year: ${s.year}, seq: ${s.seq}`);
  }

  // Preserved Data Check
  const customersCount = await db.collection("customers").countDocuments();
  const employeesCount = await db.collection("employees").countDocuments();
  const jobNumbersCount = await db.collection("jobnumbers").countDocuments();
  const jobNumberSequencesCount = await db.collection("jobnumbersequences").countDocuments();
  const companySettingsCount = await db.collection("companysettings").countDocuments();
  console.log(`\nPreserved Collections Counts:`);
  console.log(`  - customers: ${customersCount}`);
  console.log(`  - employees: ${employeesCount}`);
  console.log(`  - jobnumbers: ${jobNumbersCount}`);
  console.log(`  - jobnumbersequences: ${jobNumberSequencesCount}`);
  console.log(`  - companysettings: ${companySettingsCount}`);

  await mongoose.disconnect();
}

inspectDb().catch((err) => {
  console.error("Inspection error:", err);
  process.exit(1);
});
