import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import Customer from "./model/customerModel.js";
import Renewal from "./model/renewalModel.js";
import Service from "./model/serviceModel.js";

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  const custCount = await Customer.countDocuments();
  const renCount = await Renewal.countDocuments();
  const srvCount = await Service.countDocuments();

  console.log(`MongoDB Current Counts:`);
  console.log(`- Customers: ${custCount}`);
  console.log(`- Renewals: ${renCount}`);
  console.log(`- Services: ${srvCount}`);

  if (srvCount > 0) {
    const sampleServices = await Service.find().limit(5).lean();
    console.log("\nSample Service documents:", JSON.stringify(sampleServices, null, 2));
  }

  if (renCount > 0) {
    const sampleRenewals = await Renewal.find().limit(5).lean();
    console.log("\nSample Renewal documents:", JSON.stringify(sampleRenewals, null, 2));
  }

  await mongoose.disconnect();
}

check().catch(console.error);
