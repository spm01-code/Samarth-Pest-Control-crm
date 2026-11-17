import mongoose from "mongoose";

/**
 * Executes a safe, idempotent database index migration.
 * - Migrates Service indexes: drops legacy global unique index on jobNo_1.
 * - Independently enforces uniqueness on Service.documentNumber (unique, sparse).
 * - Creates a partial unique index on Service.jobNo for one-time jobs using supported operators.
 * - Creates a standard non-unique index on Service.jobNo for recurring AMC contracts.
 * - Ensures JobNumber unique indexes.
 */
export async function migrateDatabaseIndexes(dbInstance) {
  const db = dbInstance || mongoose.connection.db;
  if (!db) {
    throw new Error("No database connection available for index migration.");
  }

  const results = {
    serviceIndexesDropped: [],
    serviceIndexesCreated: [],
    jobNumberIndexesCreated: [],
  };

  try {
    let serviceIndexes = [];
    try {
      serviceIndexes = await db.collection("services").indexes();
    } catch (nsErr) {
      if (nsErr.code === 26 || nsErr.codeName === "NamespaceNotFound") {
        await db.createCollection("services");
        serviceIndexes = await db.collection("services").indexes();
      } else {
        throw nsErr;
      }
    }

    // 1. Check if legacy global unique jobNo_1 exists
    const legacyJobNoIdx = serviceIndexes.find(
      (idx) => idx.name === "jobNo_1" && idx.unique === true && !idx.partialFilterExpression
    );

    if (legacyJobNoIdx) {
      console.log("Dropping legacy global unique index on services.jobNo_1...");
      await db.collection("services").dropIndex("jobNo_1");
      results.serviceIndexesDropped.push("jobNo_1 (legacy unique)");
    }

    // 2. Check documentNumber index: ensure it is unique and sparse
    const docNumIdx = serviceIndexes.find((idx) => idx.name === "documentNumber_1");
    if (docNumIdx && !docNumIdx.unique) {
      console.log("Dropping non-unique documentNumber_1 to upgrade to unique...");
      await db.collection("services").dropIndex("documentNumber_1");
      results.serviceIndexesDropped.push("documentNumber_1 (non-unique)");
    }

    try {
      await db.collection("services").createIndex(
        { documentNumber: 1 },
        { name: "documentNumber_1", unique: true, sparse: true, background: true }
      );
      results.serviceIndexesCreated.push("documentNumber_1 (unique, sparse)");
    } catch (e) {
      if (!e.message.includes("already exists")) {
        console.warn("Notice on documentNumber_1 index creation:", e.message);
      }
    }

    // 3. Partial unique index on jobNo for one-time jobs using supported MongoDB partial operators
    try {
      await db.collection("services").createIndex(
        { jobNo: 1 },
        {
          name: "jobNo_one_time_partial_unique",
          unique: true,
          partialFilterExpression: {
            frequency: "one-time",
            jobNo: { $gt: "" },
          },
          background: true,
        }
      );
      results.serviceIndexesCreated.push("jobNo_one_time_partial_unique");
    } catch (e) {
      if (!e.message.includes("already exists")) {
        console.warn("Notice on jobNo_one_time_partial_unique index creation:", e.message);
      }
    }

    // 4. General non-unique index on jobNo
    try {
      await db.collection("services").createIndex(
        { jobNo: 1 },
        { name: "jobNo_1", background: true }
      );
      results.serviceIndexesCreated.push("jobNo_1 (non-unique)");
    } catch (e) {
      if (!e.message.includes("already exists")) {
        console.warn("Notice on services jobNo_1 index creation:", e.message);
      }
    }

    // 5. JobNumber collection indexes
    try {
      await db.collection("jobnumbers").createIndex(
        { jobNo: 1 },
        { unique: true, background: true }
      );
      await db.collection("jobnumbers").createIndex(
        { prefix: 1, status: 1, isLegacy: 1, sequence: 1 },
        { background: true }
      );
      results.jobNumberIndexesCreated.push("jobNo_1 (unique)", "prefix_status_seq");
    } catch (e) {
      if (!e.message.includes("already exists")) {
        console.warn("Notice on jobnumbers index creation:", e.message);
      }
    }

    console.log("Database index migration completed safely:", results);
    return results;
  } catch (error) {
    console.error("Index migration error:", error);
    throw error;
  }
}
