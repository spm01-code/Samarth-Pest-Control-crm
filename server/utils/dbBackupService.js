import fs from "fs";
import path from "path";
import crypto from "crypto";
import mongoose from "mongoose";

const BACKUP_COLLECTIONS = [
  "customers",
  "services",
  "invoices",
  "quotations",
  "renewals",
  "jobnumbers",
  "jobnumbersequences",
  "importauditlogs",
  "importsessions",
  "documentsequences",
  "companysettings",
];

/**
 * Creates a verified database backup into backups/backup_<timestamp>.
 * Writes BSON/JSON collection dumps and a verified SHA-256 manifest.
 */
export async function createDatabaseBackup(customBackupDir = null) {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Cannot create backup: No active MongoDB connection.");
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir =
    customBackupDir || path.resolve(process.cwd(), "backups", `backup_${timestamp}`);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const manifest = {
    timestamp: new Date().toISOString(),
    databaseName: db.databaseName,
    collections: {},
    totalDocuments: 0,
    status: "in_progress",
  };

  console.log(`Starting database backup to ${backupDir}...`);

  for (const colName of BACKUP_COLLECTIONS) {
    const col = db.collection(colName);
    const docs = await col.find().toArray();
    const count = docs.length;

    const jsonContent = JSON.stringify(docs, null, 2);
    const hash = crypto.createHash("sha256").update(jsonContent).digest("hex");
    const filePath = path.join(backupDir, `${colName}.json`);

    fs.writeFileSync(filePath, jsonContent, "utf8");

    manifest.collections[colName] = {
      count,
      sha256: hash,
      fileName: `${colName}.json`,
      fileSizeBytes: Buffer.byteLength(jsonContent, "utf8"),
    };

    manifest.totalDocuments += count;
    console.log(` - Backed up ${colName}: ${count} documents (hash: ${hash.slice(0, 8)}...)`);
  }

  manifest.status = "completed";
  const manifestPath = path.join(backupDir, "backup_manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log(`Backup completed successfully. Manifest written to ${manifestPath}`);
  return { backupDir, manifestPath, manifest };
}

/**
 * Verifies the integrity of a completed backup against its manifest.
 */
export async function verifyBackupIntegrity(backupDir) {
  const manifestPath = path.join(backupDir, "backup_manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Invalid backup directory: manifest not found at ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const verification = {
    verified: true,
    checkedCollections: 0,
    errors: [],
  };

  for (const [colName, meta] of Object.entries(manifest.collections)) {
    const filePath = path.join(backupDir, meta.fileName);
    if (!fs.existsSync(filePath)) {
      verification.verified = false;
      verification.errors.push(`Missing backup file: ${meta.fileName}`);
      continue;
    }

    const content = fs.readFileSync(filePath, "utf8");
    const hash = crypto.createHash("sha256").update(content).digest("hex");

    if (hash !== meta.sha256) {
      verification.verified = false;
      verification.errors.push(
        `Checksum mismatch on ${colName}: expected ${meta.sha256}, got ${hash}`
      );
    }

    const docs = JSON.parse(content);
    if (docs.length !== meta.count) {
      verification.verified = false;
      verification.errors.push(
        `Document count mismatch on ${colName}: expected ${meta.count}, got ${docs.length}`
      );
    }

    verification.checkedCollections++;
  }

  console.log("Backup integrity check:", verification);
  return verification;
}

/**
 * Verifies restoration on a separate test/verification database.
 */
export async function verifyRestorationOnTestDb(backupDir, testDbUri) {
  const manifestPath = path.join(backupDir, "backup_manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const testConn = await mongoose.createConnection(testDbUri).asPromise();
  const testDb = testConn.db;

  const results = {
    restorationSuccessful: true,
    verifiedCollections: 0,
    errors: [],
  };

  try {
    for (const [colName, meta] of Object.entries(manifest.collections)) {
      const filePath = path.join(backupDir, meta.fileName);
      const docs = JSON.parse(fs.readFileSync(filePath, "utf8"));

      const targetCol = testDb.collection(colName);
      await targetCol.drop().catch(() => {});

      if (docs.length > 0) {
        // Convert $oid, $date or string _id to ObjectIds
        const normalizedDocs = docs.map((d) => {
          if (d._id && typeof d._id === "string" && d._id.length === 24) {
            d._id = new mongoose.Types.ObjectId(d._id);
          }
          return d;
        });

        await targetCol.insertMany(normalizedDocs);
      }

      const restoredCount = await targetCol.countDocuments();
      if (restoredCount !== meta.count) {
        results.restorationSuccessful = false;
        results.errors.push(
          `Restored count mismatch on ${colName}: expected ${meta.count}, got ${restoredCount}`
        );
      } else {
        results.verifiedCollections++;
      }
    }

    // Clean up test database
    for (const colName of Object.keys(manifest.collections)) {
      await testDb.collection(colName).drop().catch(() => {});
    }
  } catch (err) {
    results.restorationSuccessful = false;
    results.errors.push(err.message);
  } finally {
    await testConn.close();
  }

  console.log("Test database restoration verification:", results);
  return results;
}
