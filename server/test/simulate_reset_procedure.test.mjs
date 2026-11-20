import dotenv from "dotenv";
dotenv.config({ path: "./server/.env" });
import dns from "dns";
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder("ipv4first");
import mongoose from "mongoose";

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

async function runSimulation() {
  console.log("================================================================================");
  console.log("  SIMULATION OF NUMBERING RESET PROCEDURE (crm_samarth_test ONLY)               ");
  console.log("================================================================================\n");

  const testUri = process.env.MONGO_URI.replace("/crm_samarth?", "/crm_samarth_test?");
  if (!testUri.includes("/crm_samarth_test")) {
    throw new Error("FATAL: Target database is NOT crm_samarth_test!");
  }

  await mongoose.connect(testUri);
  if (mongoose.connection.name !== "crm_samarth_test") {
    throw new Error(`FATAL: Connected database is ${mongoose.connection.name}, not crm_samarth_test!`);
  }
  console.log("Connected safely to isolated test DB:", mongoose.connection.name);

  const testYear = 2026;

  try {
    // 1. Seed historical documents
    console.log("1. Seeding test documents...");
    await Invoice.deleteMany({});
    await Quotation.deleteMany({});
    await Renewal.deleteMany({});
    await Service.deleteMany({});
    await DocumentSequence.deleteMany({ year: testYear });

    const dummyCustomerId = new mongoose.Types.ObjectId();

    await Invoice.insertMany([
      { invoiceNumber: "SPMJ/25/2026-27", invoiceType: "NON_GST", customer: dummyCustomerId, subtotal: 1000, totalAmount: 1000 },
      { invoiceNumber: "SPM/14/2026-27", invoiceType: "GST", customer: dummyCustomerId, subtotal: 2000, totalAmount: 2360 },
    ]);

    await Quotation.insertMany([
      { quotationNumber: "SPM/PC/2026/08", quotationType: "PC", premises: "Pune" },
      { quotationNumber: "SPM/ATT/2026/05", quotationType: "ATT", premises: "Mumbai" },
    ]);

    await Renewal.insertMany([
      { renewalNumber: "SPM/CR/2026/12", customer: dummyCustomerId, subtotal: 5000, totalAmount: 5000 },
    ]);

    await Service.insertMany([
      {
        jobNo: "Job No/2026/15",
        documentNumber: "Job No/2026/15",
        frequency: "one-time",
        customerName: "Test 1",
        serviceName: "Pest Control",
        address: "Pune",
        amount: 1000,
        serviceDate: new Date(),
      },
      {
        jobNo: "Job No/2026/16",
        documentNumber: "Job No/2026/16",
        frequency: "one-time",
        customerName: "Test 2",
        serviceName: "Termite",
        address: "Pune",
        amount: 1500,
        serviceDate: new Date(),
      },
      // Recurring services that must be preserved:
      {
        customer: dummyCustomerId,
        jobNo: "A/01",
        frequency: "monthly",
        customerName: "Preserved Recurring Customer 1",
        serviceName: "Cockroach Control",
        address: "Mumbai",
        amount: 3000,
        serviceDate: new Date(),
      },
      {
        customer: dummyCustomerId,
        jobNo: "B/02",
        frequency: "3 services yearly",
        customerName: "Preserved Recurring Customer 2",
        serviceName: "Bed Bug",
        address: "Mumbai",
        amount: 4000,
        serviceDate: new Date(),
      },
      {
        customer: dummyCustomerId,
        jobNo: "C/03",
        frequency: "quarterly",
        customerName: "Preserved Recurring Customer 3",
        serviceName: "General Disinfestation",
        address: "Mumbai",
        amount: 5000,
        serviceDate: new Date(),
      },
    ]);

    // 2. Run initial sync to simulate pre-reset state
    await syncExistingDocumentSequences({ Invoice, Quotation, Renewal, Service });
    const preSeqs = await DocumentSequence.find({ year: testYear });
    console.log("Pre-reset counters after sync:");
    for (const s of preSeqs) {
      console.log(`  - ${s.documentType}: ${s.seq}`);
    }

    // 3. Execute the exact proposed Reset Procedure
    console.log("\n2. Executing exact deletion and counter reset procedure...");
    const invDel = await Invoice.deleteMany({});
    const qtnDel = await Quotation.deleteMany({});
    const renDel = await Renewal.deleteMany({});
    const otjDel = await Service.deleteMany({ frequency: { $regex: /^one-time$/i } });

    console.log(`  - Deleted Invoices: ${invDel.deletedCount}`);
    console.log(`  - Deleted Quotations: ${qtnDel.deletedCount}`);
    console.log(`  - Deleted Renewals: ${renDel.deletedCount}`);
    console.log(`  - Deleted One-Time Services: ${otjDel.deletedCount}`);

    // Reset sequence counters to 0
    const seqTypes = [
      "NON_GST_INVOICE",
      "GST_INVOICE",
      "PC_QUOTATION",
      "ATT_QUOTATION",
      "CONTRACT_RENEWAL",
      "ONE_TIME_JOB",
      "INVOICE",
    ];
    for (const type of seqTypes) {
      await DocumentSequence.findOneAndUpdate(
        { documentType: type, year: testYear },
        { $set: { seq: 0 } },
        { upsert: true, new: true }
      );
    }
    console.log("  - Reset all 2026 DocumentSequence counters to seq = 0.");

    // 4. Verify preserved recurring services
    const remainingServices = await Service.find({});
    console.log(`\n3. Verifying preserved data: ${remainingServices.length} recurring services remain.`);
    if (remainingServices.length !== 3) {
      throw new Error(`Expected 3 recurring services preserved, found ${remainingServices.length}`);
    }

    // 5. Simulate Server Restart / Startup Reconciliation
    console.log("\n4. Simulating server restart and startup reconciliation...");
    await syncExistingDocumentSequences({ Invoice, Quotation, Renewal, Service });

    const postSyncSeqs = await DocumentSequence.find({ year: testYear });
    console.log("Post-restart counters after sync:");
    for (const s of postSyncSeqs) {
      console.log(`  - ${s.documentType}: ${s.seq}`);
      if (s.seq !== 0) {
        throw new Error(`CRITICAL: Counter for ${s.documentType} was restored to ${s.seq}! Expected 0.`);
      }
    }
    console.log("  ✅ SUCCESS: Startup reconciliation DID NOT restore old counters!");

    // 6. Test Document Generation for All 6 Series
    console.log("\n5. Testing new document generation for all 6 series...");
    const expected01 = {
      NON_GST_INVOICE: "SPMJ/01/2026-27",
      GST_INVOICE: "SPM/01/2026-27",
      PC_QUOTATION: "SPM/PC/2026/01",
      ATT_QUOTATION: "SPM/ATT/2026/01",
      CONTRACT_RENEWAL: "SPM/CR/2026/01",
      ONE_TIME_JOB: "Job No/2026/01",
    };

    const expected02 = {
      NON_GST_INVOICE: "SPMJ/02/2026-27",
      GST_INVOICE: "SPM/02/2026-27",
      PC_QUOTATION: "SPM/PC/2026/02",
      ATT_QUOTATION: "SPM/ATT/2026/02",
      CONTRACT_RENEWAL: "SPM/CR/2026/02",
      ONE_TIME_JOB: "Job No/2026/02",
    };

    for (const [docType, expNumber] of Object.entries(expected01)) {
      const res1 = await generateDocumentNumber(docType, { year: testYear });
      if (res1.documentNumber !== expNumber) {
        throw new Error(`Expected ${expNumber}, got ${res1.documentNumber}`);
      }
      console.log(`  ✅ PASS: ${docType} #1 generated: ${res1.documentNumber}`);

      const res2 = await generateDocumentNumber(docType, { year: testYear });
      if (res2.documentNumber !== expected02[docType]) {
        throw new Error(`Expected ${expected02[docType]}, got ${res2.documentNumber}`);
      }
      console.log(`  ✅ PASS: ${docType} #2 generated: ${res2.documentNumber}`);
    }

    // 7. Cleanup test DB
    await Invoice.deleteMany({});
    await Quotation.deleteMany({});
    await Renewal.deleteMany({});
    await Service.deleteMany({});
    await DocumentSequence.deleteMany({ year: testYear });
    console.log("\nSimulation test completed cleanly. All assertions verified.");
  } finally {
    await mongoose.disconnect();
  }
}

runSimulation().catch((err) => {
  console.error("Simulation failed:", err);
  process.exit(1);
});
