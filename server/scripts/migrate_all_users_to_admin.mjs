import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

async function runMigration() {
  console.log("==================================================");
  console.log("   SAMARTH CRM: USER RBAC MIGRATION SCRIPT        ");
  console.log("==================================================");

  if (!process.env.MONGO_URI) {
    console.error("ERROR: MONGO_URI is missing from server/.env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  console.log("Connected to MongoDB database successfully.");

  const db = mongoose.connection.db;
  const adminCollection = db.collection("admins");

  // Step 1: Query all existing users
  const existingUsers = await adminCollection.find({}).toArray();
  console.log(`Found ${existingUsers.length} existing registered user(s).`);

  if (existingUsers.length === 0) {
    console.log("No users found to migrate.");
    await mongoose.disconnect();
    return;
  }

  // Step 2: Backup all existing user records before modification
  const backupDir = path.join(__dirname, "../backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFilePath = path.join(backupDir, `users_backup_pre_migration_${timestamp}.json`);
  fs.writeFileSync(backupFilePath, JSON.stringify(existingUsers, null, 2), "utf8");
  console.log(`\n[BACKUP CREATED] ${backupFilePath}`);
  console.log(`Saved ${existingUsers.length} raw user records safely.`);

  // Step 3: Idempotent Migration
  // Migrate every registered user to role: "admin", ensure isActive: true
  let migratedCount = 0;
  let alreadyAdminCount = 0;

  for (const user of existingUsers) {
    const isAlreadyAdmin = user.role === "admin";
    const needsUpdate = !isAlreadyAdmin || user.isActive === undefined;

    if (needsUpdate) {
      await adminCollection.updateOne(
        { _id: user._id },
        {
          $set: {
            role: "admin",
            isActive: user.isActive !== undefined ? user.isActive : true,
            tokenVersion: user.tokenVersion !== undefined ? user.tokenVersion : 0,
          },
        }
      );
      migratedCount++;
      console.log(`[UPDATED] User ${user.email} -> role: "admin"`);
    } else {
      alreadyAdminCount++;
      console.log(`[ALREADY ADMIN] User ${user.email} -> role: "admin" (preserved)`);
    }
  }

  console.log("\n==================================================");
  console.log("Migration Summary:");
  console.log(`- Total users inspected: ${existingUsers.length}`);
  console.log(`- Users updated to admin: ${migratedCount}`);
  console.log(`- Users already admin: ${alreadyAdminCount}`);
  console.log("==================================================");

  // Verification step: Read back all users
  const verifiedUsers = await adminCollection.find({}, { projection: { password: 0, otp: 0, resetPasswordOtp: 0 } }).toArray();
  console.log("\nVerified Users in Database:");
  console.table(
    verifiedUsers.map((u) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      isVerified: u.isVerified,
    }))
  );

  await mongoose.disconnect();
  console.log("\nMongoDB disconnected. Migration complete.");
}

runMigration().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
