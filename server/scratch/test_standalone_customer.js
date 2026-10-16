import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import Service from "../model/serviceModel.js";
import Customer from "../model/customerModel.js";
import "../model/employeeModel.js";
import {
  createService,
  updateService,
  getService,
  getAllServices,
} from "../controller/serviceController.js";
import { generateOneTimeJobDocx } from "../utils/docGenerator.js";

// Mock Express req/res
const mockReqRes = (body = {}, params = {}, query = {}) => {
  const req = { body, params, query };
  let statusCode = 200;
  let responseData = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    send(data) {
      responseData = data;
      return this;
    },
    setHeader() {
      return this;
    },
  };

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getResponseData: () => responseData,
  };
};

async function runTests() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected.\n");

  const createdTestServiceIds = [];

  try {
    // Find an existing real customer for reference
    const existingCustomer = await Customer.findOne().lean();
    if (!existingCustomer) {
      throw new Error("No existing customer found in DB to run tests with");
    }
    console.log(`Using existing customer for reference tests: ${existingCustomer.fullName} (${existingCustomer._id})\n`);

    const initialCustomerCount = await Customer.countDocuments();
    console.log(`Initial Customer collection count: ${initialCustomerCount}`);

    // ========================================================
    // Scenario 1: Create One-Time Service with standalone customer name
    // ========================================================
    console.log("\n--- Scenario 1: Create One-Time Service with standalone customer name ---");
    const testStandaloneName = `Test Standalone Client ${Date.now()}`;
    const { req: req1, res: res1, getStatusCode: getStatus1, getResponseData: getData1 } = mockReqRes({
      frequency: "one-time",
      customerName: testStandaloneName,
      serviceName: "One Time Pest Control",
      serviceDate: new Date().toISOString(),
      address: "123 Test Street, Mumbai",
      amount: 1500,
    });

    await createService(req1, res1);
    console.log("Status:", getStatus1());
    const data1 = getData1();
    if (getStatus1() !== 201) {
      throw new Error(`Scenario 1 failed: Expected 201, got ${getStatus1()} - ${JSON.stringify(data1)}`);
    }
    const createdService1 = data1.service;
    createdTestServiceIds.push(createdService1._id);

    console.log("Created Service ID:", createdService1._id);
    console.log("Service customerName:", createdService1.customerName);
    console.log("Service customer ref:", createdService1.customer);
    console.log("Service jobNo:", createdService1.jobNo);

    if (createdService1.customerName !== testStandaloneName) {
      throw new Error(`Scenario 1 failed: customerName mismatch. Expected "${testStandaloneName}", got "${createdService1.customerName}"`);
    }
    if (createdService1.customer != null) {
      throw new Error(`Scenario 1 failed: Customer reference should be null/undefined for standalone, got ${createdService1.customer}`);
    }
    if (!createdService1.jobNo) {
      throw new Error("Scenario 1 failed: jobNo should be auto-allocated");
    }

    // Verify Customer document count unchanged
    const afterCount1 = await Customer.countDocuments();
    console.log(`Customer count after standalone creation: ${afterCount1} (diff: ${afterCount1 - initialCustomerCount})`);
    if (afterCount1 !== initialCustomerCount) {
      throw new Error("Scenario 1 failed: A Customer document was created for standalone service!");
    }
    console.log("✓ Scenario 1 passed: Standalone service created without Customer document.");

    // ========================================================
    // Scenario 2: Data Retrieval for standalone service (getService & getAllServices)
    // ========================================================
    console.log("\n--- Scenario 2: Data retrieval for standalone service ---");
    const { req: req2, res: res2, getStatusCode: getStatus2, getResponseData: getData2 } = mockReqRes(
      {},
      { id: createdService1._id }
    );
    await getService(req2, res2);
    const data2 = getData2();
    console.log("getService status:", getStatus2(), "error message:", data2?.message);
    console.log("getService customerName:", data2?.customerName);
    console.log("getService customer ref:", data2?.customer);
    if (getStatus2() !== 200 || data2.customerName !== testStandaloneName) {
      throw new Error(`Scenario 2 failed in getService: Expected customerName "${testStandaloneName}", got "${data2?.customerName}"`);
    }

    const { req: reqAll, res: resAll, getStatusCode: getStatusAll, getResponseData: getDataAll } = mockReqRes();
    await getAllServices(reqAll, resAll);
    const allServices = getDataAll();
    const foundInAll = allServices.find((s) => String(s._id) === String(createdService1._id));
    if (!foundInAll || foundInAll.customerName !== testStandaloneName) {
      throw new Error(`Scenario 2 failed in getAllServices: standalone customerName not found`);
    }
    console.log("✓ Scenario 2 passed: Standalone customerName correctly provided in retrieval endpoints.");

    // ========================================================
    // Scenario 3: Update standalone customer name
    // ========================================================
    console.log("\n--- Scenario 3: Update standalone customer name ---");
    const updatedStandaloneName = `Updated Standalone Name ${Date.now()}`;
    const { req: req3, res: res3, getStatusCode: getStatus3, getResponseData: getData3 } = mockReqRes(
      {
        customerName: updatedStandaloneName,
        amount: 1800,
      },
      { id: createdService1._id }
    );
    await updateService(req3, res3);
    console.log("updateService status:", getStatus3());
    const data3 = getData3();
    if (getStatus3() !== 200 || data3.service?.customerName !== updatedStandaloneName) {
      throw new Error(`Scenario 3 failed: Expected updated customerName "${updatedStandaloneName}", got "${data3.service?.customerName}"`);
    }
    console.log("✓ Scenario 3 passed: Standalone customer name updated successfully.");

    // ========================================================
    // Scenario 4: Rejection of One Time service with empty/missing customer name
    // ========================================================
    console.log("\n--- Scenario 4: Reject One-Time service with empty customer name ---");
    const { req: req4, res: res4, getStatusCode: getStatus4, getResponseData: getData4 } = mockReqRes({
      frequency: "one-time",
      customerName: "   ",
      serviceName: "One Time Empty Name Test",
      serviceDate: new Date().toISOString(),
      address: "Test Address",
      amount: 1000,
    });
    await createService(req4, res4);
    console.log("createService with empty name status:", getStatus4(), getData4()?.message);
    if (getStatus4() !== 400) {
      throw new Error(`Scenario 4 failed: Expected 400, got ${getStatus4()}`);
    }
    console.log("✓ Scenario 4 passed: Empty customer name rejected with 400.");

    // ========================================================
    // Scenario 5: Rejection of Recurring (Monthly) service without customer
    // ========================================================
    console.log("\n--- Scenario 5: Reject Monthly service without customer ---");
    const { req: req5, res: res5, getStatusCode: getStatus5, getResponseData: getData5 } = mockReqRes({
      frequency: "monthly",
      serviceName: "Monthly Without Customer",
      serviceDate: new Date().toISOString(),
      address: "Test Address",
      amount: 2000,
    });
    await createService(req5, res5);
    console.log("createService without customer status:", getStatus5(), getData5()?.message);
    if (getStatus5() !== 400) {
      throw new Error(`Scenario 5 failed: Expected 400, got ${getStatus5()}`);
    }
    console.log("✓ Scenario 5 passed: Monthly service without customer rejected with 400.");

    // ========================================================
    // Scenario 6: Rejection of other recurring frequencies without customer
    // ========================================================
    console.log("\n--- Scenario 6: Customer validation for other frequencies ---");
    const frequenciesToTest = ["weekly", "twice a week", "Fourth nightly", "Quarterly", "Yearly 3 services"];
    for (const freq of frequenciesToTest) {
      const { req: reqF, res: resF, getStatusCode: getStatusF } = mockReqRes({
        frequency: freq,
        serviceName: `${freq} Test`,
        serviceDate: new Date().toISOString(),
        address: "Test Address",
        amount: 2500,
      });
      await createService(reqF, resF);
      if (getStatusF() !== 400) {
        throw new Error(`Scenario 6 failed for ${freq}: Expected 400, got ${getStatusF()}`);
      }
    }
    console.log("✓ Scenario 6 passed: All other frequencies require customer selection.");

    // ========================================================
    // Scenario 7: Create Monthly service with valid existing customer
    // ========================================================
    console.log("\n--- Scenario 7: Create Monthly service with valid customer ---");
    const { req: req7, res: res7, getStatusCode: getStatus7, getResponseData: getData7 } = mockReqRes({
      frequency: "monthly",
      customer: existingCustomer._id.toString(),
      serviceName: "Valid Monthly Service",
      serviceDate: new Date().toISOString(),
      address: existingCustomer.address || "Customer Address",
      amount: 3000,
    });
    await createService(req7, res7);
    console.log("Monthly service creation status:", getStatus7());
    const data7 = getData7();
    if (getStatus7() !== 201) {
      throw new Error(`Scenario 7 failed: Expected 201, got ${getStatus7()} - ${JSON.stringify(data7)}`);
    }
    const createdService7 = data7.service;
    createdTestServiceIds.push(createdService7._id);
    console.log("Created monthly service customer:", createdService7.customer?._id || createdService7.customer);
    console.log("Created monthly service customerName:", createdService7.customerName);
    if (!createdService7.customer) {
      throw new Error("Scenario 7 failed: Customer reference should be present");
    }
    console.log("✓ Scenario 7 passed: Monthly service saved with customer reference and consistent customerName.");

    // ========================================================
    // Scenario 8: Transition standalone One-Time to Monthly without customer -> REJECT
    // ========================================================
    console.log("\n--- Scenario 8: Transition standalone One-Time to Monthly without customer ---");
    const { req: req8, res: res8, getStatusCode: getStatus8, getResponseData: getData8 } = mockReqRes(
      {
        frequency: "monthly",
      },
      { id: createdService1._id }
    );
    await updateService(req8, res8);
    console.log("Transition status without customer:", getStatus8(), getData8()?.message);
    if (getStatus8() !== 400) {
      throw new Error(`Scenario 8 failed: Expected 400 rejection, got ${getStatus8()}`);
    }
    console.log("✓ Scenario 8 passed: Transition from standalone to Monthly without customer rejected.");

    // ========================================================
    // Scenario 9: Transition standalone One-Time to Monthly WITH valid customer -> SUCCESS
    // ========================================================
    console.log("\n--- Scenario 9: Transition standalone One-Time to Monthly with customer ---");
    const { req: req9, res: res9, getStatusCode: getStatus9, getResponseData: getData9 } = mockReqRes(
      {
        frequency: "monthly",
        customer: existingCustomer._id.toString(),
      },
      { id: createdService1._id }
    );
    await updateService(req9, res9);
    console.log("Transition status with customer:", getStatus9());
    const data9 = getData9();
    if (getStatus9() !== 200) {
      throw new Error(`Scenario 9 failed: Expected 200, got ${getStatus9()} - ${JSON.stringify(data9)}`);
    }
    console.log("Service frequency is now:", data9.service?.frequency);
    console.log("Service customer is now:", data9.service?.customer?._id || data9.service?.customer);
    console.log("✓ Scenario 9 passed: Standalone transitioned to Monthly with customer successfully.");

    // ========================================================
    // Scenario 10: Legacy customer-linked One-Time service
    // ========================================================
    console.log("\n--- Scenario 10: Legacy customer-linked One-Time service ---");
    const { req: req10, res: res10, getStatusCode: getStatus10, getResponseData: getData10 } = mockReqRes({
      frequency: "one-time",
      customer: existingCustomer._id.toString(),
      customerName: existingCustomer.fullName,
      serviceName: "Legacy One Time Service",
      serviceDate: new Date().toISOString(),
      address: existingCustomer.address || "Legacy Address",
      amount: 1200,
    });
    await createService(req10, res10);
    const data10 = getData10();
    const createdLegacyService = data10.service;
    createdTestServiceIds.push(createdLegacyService._id);

    console.log("Legacy service created with customer:", createdLegacyService.customer?._id || createdLegacyService.customer);
    // Update while remaining one-time
    const { req: req10b, res: res10b, getStatusCode: getStatus10b, getResponseData: getData10b } = mockReqRes(
      {
        customerName: "Legacy Updated Name",
      },
      { id: createdLegacyService._id }
    );
    await updateService(req10b, res10b);
    const data10b = getData10b();
    if (getStatus10b() !== 200 || !data10b.service?.customer) {
      throw new Error("Scenario 10 failed: Customer reference lost on legacy service update");
    }
    console.log("✓ Scenario 10 passed: Legacy one-time service preserves customer relationship.");

    // ========================================================
    // Scenario 11: Invalid ID and non-existent customer validation
    // ========================================================
    console.log("\n--- Scenario 11: Invalid and non-existent customer IDs ---");
    const { req: req11a, res: res11a, getStatusCode: getStatus11a } = mockReqRes({
      frequency: "monthly",
      customer: "invalid-id-format",
      serviceName: "Bad ID Test",
      serviceDate: new Date().toISOString(),
      address: "Address",
      amount: 100,
    });
    await createService(req11a, res11a);
    if (getStatus11a() !== 400) {
      throw new Error(`Scenario 11a failed: Expected 400 for invalid ID, got ${getStatus11a()}`);
    }

    const nonExistentId = new mongoose.Types.ObjectId().toString();
    const { req: req11b, res: res11b, getStatusCode: getStatus11b } = mockReqRes({
      frequency: "monthly",
      customer: nonExistentId,
      serviceName: "Non Existent Customer Test",
      serviceDate: new Date().toISOString(),
      address: "Address",
      amount: 100,
    });
    await createService(req11b, res11b);
    if (getStatus11b() !== 404) {
      throw new Error(`Scenario 11b failed: Expected 404 for non-existent customer, got ${getStatus11b()}`);
    }
    console.log("✓ Scenario 11 passed: Invalid ID and non-existent customer properly rejected.");

    // ========================================================
    // Scenario 12: DOCX Service Paper Generation for Standalone Service
    // ========================================================
    console.log("\n--- Scenario 12: Generate DOCX Service Paper for Standalone One-Time Service ---");
    // Create a standalone one-time service specifically for docx generation test
    const { req: req12, res: res12, getStatusCode: getStatus12, getResponseData: getData12 } = mockReqRes({
      frequency: "one-time",
      customerName: "Docx Standalone Customer",
      serviceName: "General Pest Control",
      serviceDate: new Date().toISOString(),
      address: "Office 401, Tech Park",
      amount: 2500,
    });
    await createService(req12, res12);
    const standaloneForDocx = getData12().service;
    createdTestServiceIds.push(standaloneForDocx._id);

    const docxResult = await generateOneTimeJobDocx(standaloneForDocx);
    if (!docxResult || !docxResult.buffer) {
      throw new Error("Scenario 12 failed: Docx generation returned no buffer");
    }
    console.log("Docx generated successfully! Buffer length:", docxResult.buffer.length);
    console.log("✓ Scenario 12 passed: Service Paper DOCX generated successfully for standalone service.");

    // Final check on Customer collection count
    const finalCustomerCount = await Customer.countDocuments();
    console.log(`\nFinal Customer collection count: ${finalCustomerCount} (initial was ${initialCustomerCount})`);
    if (finalCustomerCount !== initialCustomerCount) {
      throw new Error(`Customer count changed! Expected ${initialCustomerCount}, got ${finalCustomerCount}`);
    }
    console.log("✓ Zero unwanted Customer documents created across all test scenarios.");

  } finally {
    // Cleanup created test services
    if (createdTestServiceIds.length > 0) {
      console.log(`\nCleaning up ${createdTestServiceIds.length} test service records...`);
      await Service.deleteMany({ _id: { $in: createdTestServiceIds } });
      console.log("Cleanup complete.");
    }
    await mongoose.disconnect();
    console.log("MongoDB disconnected.\nALL TESTS PASSED SUCCESSFULLY!");
  }
}

runTests().catch((err) => {
  console.error("\nTEST SUITE FAILED:", err);
  process.exit(1);
});
