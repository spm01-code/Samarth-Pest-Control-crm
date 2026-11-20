import dotenv from "dotenv";
dotenv.config({ path: "./server/.env" });
import dns from "dns";
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder("ipv4first");
import mongoose from "mongoose";

async function testConn() {
  const testUri = process.env.MONGO_URI.replace("/crm_samarth?", "/crm_samarth_test?");
  console.log("Attempting connection to test database...");
  try {
    await mongoose.connect(testUri, { serverSelectionTimeoutMS: 5000 });
    console.log("Connected successfully to DB:", mongoose.connection.name);
    await mongoose.disconnect();
    return true;
  } catch (err) {
    console.error("Connection failed:", err.message);
    return false;
  }
}

testConn();
