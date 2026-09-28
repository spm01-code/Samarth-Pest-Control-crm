import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
import Customer from "../model/customerModel.js";

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  const sample = await Customer.find().limit(10).lean();
  console.log("Sample Customers with JOB NO:");
  sample.forEach((c) => {
    console.log(`- ${c.fullName}: Job No = ${c.jobNo} | Phone = ${c.phone || "N/A"}`);
  });
  const countWithJobNo = await Customer.countDocuments({ jobNo: { $exists: true, $ne: "" } });
  const total = await Customer.countDocuments();
  console.log(`\nCoverage: ${countWithJobNo} / ${total} customers have JOB NO.`);
  await mongoose.disconnect();
}
check().catch(console.error);
