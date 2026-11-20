import dotenv from "dotenv";
dotenv.config({ path: "./server/.env" });
import dns from "dns";
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder("ipv4first");
import mongoose from "mongoose";

async function auditPlan() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const distinctFreq = await db.collection("services").distinct("frequency");
  console.log("Distinct raw frequency values:", distinctFreq);

  let totalOneTime = 0;
  let totalRecurring = 0;

  for (const f of distinctFreq) {
    const count = await db.collection("services").countDocuments({ frequency: f });
    const isOneTime = String(f).trim().toLowerCase() === "one-time";
    if (isOneTime) {
      totalOneTime += count;
    } else {
      totalRecurring += count;
    }
    console.log(`  - '${f}': ${count} documents (${isOneTime ? "DELETE: ONE-TIME" : "PRESERVE: RECURRING"})`);
  }

  // Check any services with null/undefined frequency
  const nullFreqCount = await db.collection("services").countDocuments({ frequency: { $in: [null, ""] } });
  console.log(`  - [Null or empty frequency]: ${nullFreqCount}`);

  console.log(`\nServices Summary:`);
  console.log(`  Total One-Time to delete: ${totalOneTime}`);
  console.log(`  Total Recurring to preserve: ${totalRecurring}`);
  console.log(`  Sum: ${totalOneTime + totalRecurring + nullFreqCount} (Total services: ${await db.collection("services").countDocuments()})`);

  // Document sequences currently in 2026
  console.log("\nCurrent 2026 DocumentSequence records:");
  const seqs2026 = await db.collection("documentsequences").find({ year: 2026 }).toArray();
  for (const s of seqs2026) {
    console.log(`  - ${s.documentType}: seq = ${s.seq}`);
  }

  await mongoose.disconnect();
}

auditPlan().catch((e) => {
  console.error("Audit error:", e);
  process.exit(1);
});
