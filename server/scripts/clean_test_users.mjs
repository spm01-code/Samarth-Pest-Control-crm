import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

async function clean() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;

    // Delete any test users matching test emails or test phones
    const deleteUsersResult = await db.collection("admins").deleteMany({
      $or: [
        { email: { $regex: /test_/i } },
        { email: { $regex: /@spm\.local$/i } },
        { email: "hacker@evil.com" }
      ]
    });
    console.log(`Deleted ${deleteUsersResult.deletedCount} test user records from 'admins'.`);

    // Delete any test customers
    const deleteCustResult = await db.collection("customers").deleteMany({
      $or: [
        { fullName: { $regex: /Test Customer/i } },
        { phone: { $regex: /^91000/ } }
      ]
    });
    console.log(`Deleted ${deleteCustResult.deletedCount} test customer records.`);

    // Display remaining baseline users
    const remainingUsers = await db.collection("admins").find({}, { projection: { email: 1, role: 1, name: 1, isActive: 1 } }).toArray();
    console.log(`\nRemaining baseline users (${remainingUsers.length}):`);
    console.table(remainingUsers);

    await mongoose.disconnect();
    console.log("Cleanup complete.");
  } catch (err) {
    console.error("Cleanup error:", err);
    process.exit(1);
  }
}

clean();
