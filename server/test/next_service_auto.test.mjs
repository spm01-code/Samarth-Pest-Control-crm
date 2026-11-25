import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import Service from "../model/serviceModel.js";
import Customer from "../model/customerModel.js";
import Employee from "../model/employeeModel.js";
import {
  createService,
  updateService,
  getService,
  getAllServices,
  syncServiceStatuses,
  getIndiaDateBoundaries,
} from "../controller/serviceController.js";
import { runNextServiceBackfill } from "../scripts/backfill_next_service_dates.mjs";
import * as serverCalc from "../utils/serviceDateCalculator.js";
import * as clientCalc from "../../client/src/utils/serviceDateCalculator.js";
import { formatDateOnly } from "../../client/src/utils/dateUtils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serverRoot, "..");
process.chdir(serverRoot);

const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`  ✅ PASS: ${name}`);
}

const makeMockRes = () => ({
  statusCode: 200,
  body: null,
  status(c) {
    this.statusCode = c;
    return this;
  },
  json(d) {
    this.body = d;
    return this;
  },
});

console.log("================================================================================");
console.log("  AUTOMATIC & READ-ONLY NEXT SERVICE DATE VERIFICATION SUITE                    ");
console.log("================================================================================\n");

await test("1. Create service without nextServiceDate -> calculates & returns nearest upcoming date and preserves paymentBasis", async () => {
  const origCustFindById = Customer.findById;
  const origEmpFindById = Employee.findById;
  const origSrvSave = Service.prototype.save;
  const origSrvPopulate = Service.prototype.populate;

  const mockCust = { _id: "65a000000000000000000011", fullName: "Next Svc Client", jobNo: "N/01", address: "Virar", phone: "9999999999" };
  Customer.findById = async () => mockCust;
  Employee.findById = async () => null;
  Service.prototype.save = async function () {
    return this;
  };
  Service.prototype.populate = async function () {
    return this;
  };

  try {
    // 1A: Monthly service starting 2026-11-10 (when today is 2026-11-25) -> nearest upcoming is 2026-12-10
    const res1 = makeMockRes();
    await createService(
      {
        body: {
          customer: mockCust._id,
          serviceName: "Monthly Pest Control",
          frequency: "monthly",
          serviceDate: "2026-11-10",
          address: "Virar",
          amount: 4500,
          paymentBasis: "per-month",
        },
      },
      res1
    );
    assert.equal(res1.statusCode, 201);
    assert.equal(iso(res1.body.service.nextServiceDate), "2026-12-10");
    assert.equal(res1.body.service.upcomingServiceDates.length, 11);
    assert.equal(res1.body.service.paymentBasis, "per-month");
    assert.equal(res1.body.service.amount, 4500);

    // 1B: Manual nextServiceDate in create payload (e.g. 2001-08-25) is strictly ignored
    const res2 = makeMockRes();
    await createService(
      {
        body: {
          customer: mockCust._id,
          serviceName: "Quarterly Pest Control",
          frequency: "Quarterly",
          serviceDate: "2026-09-06",
          nextServiceDate: "2001-08-25",
          address: "Virar",
          amount: 12000,
          paymentBasis: "per-year",
        },
      },
      res2
    );
    assert.equal(res2.statusCode, 201);
    assert.equal(iso(res2.body.service.nextServiceDate), "2026-12-06");
    assert.equal(res2.body.service.upcomingServiceDates.length, 3);
  } finally {
    Customer.findById = origCustFindById;
    Employee.findById = origEmpFindById;
    Service.prototype.save = origSrvSave;
    Service.prototype.populate = origSrvPopulate;
  }
});

await test("2. Edit service ignores manual nextServiceDate, heals corrupted DB value (25/08/2001), and recalculates on frequency change", async () => {
  const origCustFindById = Customer.findById;
  const origSrvFindById = Service.findById;
  const origSrvFindByIdAndUpdate = Service.findByIdAndUpdate;

  const mockCust = { _id: "65a000000000000000000012", fullName: "Edit Client", jobNo: "E/01", address: "Pune", phone: "9888888888" };
  let existingDoc = {
    _id: "65b000000000000000000012",
    customer: mockCust._id,
    serviceName: "Pest Control",
    frequency: "Quarterly",
    serviceDate: new Date("2026-09-06T00:00:00.000Z"),
    nextServiceDate: new Date("2001-08-25T00:00:00.000Z"), // corrupted legacy value like screenshot!
    upcomingServiceDates: [
      new Date("2026-12-06T00:00:00.000Z"),
      new Date("2027-03-06T00:00:00.000Z"),
      new Date("2027-06-06T00:00:00.000Z"),
    ],
    amount: 5000,
    paymentBasis: "per-service",
    status: "active",
  };

  let capturedUpdate = null;
  Customer.findById = async () => mockCust;
  Service.findById = async () => existingDoc;
  Service.findByIdAndUpdate = (_id, updateOp) => {
    capturedUpdate = updateOp;
    existingDoc = { ...existingDoc, ...updateOp };
    const q = { populate: () => q, then: (resolve) => resolve(existingDoc) };
    return q;
  };

  try {
    // 2A: Attempt to manually set nextServiceDate -> ignored & corrupted DB value healed to 2026-12-06
    const resA = makeMockRes();
    await updateService(
      {
        params: { id: existingDoc._id },
        body: {
          customer: mockCust._id,
          frequency: "Quarterly",
          serviceDate: "2026-09-06",
          nextServiceDate: "2001-08-25",
        },
      },
      resA
    );
    assert.equal(resA.statusCode, 200);
    assert.equal(iso(capturedUpdate.nextServiceDate), "2026-12-06", "Corrupted DB nextServiceDate healed to calculated 2026-12-06");
    assert.equal(iso(resA.body.service.nextServiceDate), "2026-12-06");

    // 2B: Change frequency to Half-Yearly -> recalculates schedule (+6m = 2027-03-06)
    const resB = makeMockRes();
    await updateService(
      {
        params: { id: existingDoc._id },
        body: {
          customer: mockCust._id,
          frequency: "Half-Yearly",
          serviceDate: "2026-09-06",
        },
      },
      resB
    );
    assert.equal(resB.statusCode, 200);
    assert.equal(iso(resB.body.service.nextServiceDate), "2027-03-06");
    assert.deepEqual(resB.body.service.upcomingServiceDates.map(iso), ["2027-03-06"]);
  } finally {
    Customer.findById = origCustFindById;
    Service.findById = origSrvFindById;
    Service.findByIdAndUpdate = origSrvFindByIdAndUpdate;
  }
});

await test("3. Legacy / corrupted DB records returned by getService & getAllServices show authoritative calculated Next Service date", async () => {
  const origBulkWrite = Service.bulkWrite;
  const origFindById = Service.findById;
  const origFind = Service.find;

  const corruptedLegacyDoc = {
    _id: "65b000000000000000000099",
    customer: { _id: "65a000000000000000000099", fullName: "Legacy Customer" },
    serviceName: "Legacy Recurring",
    frequency: "Quarterly",
    serviceDate: new Date("2026-09-06T00:00:00.000Z"),
    nextServiceDate: new Date("2001-08-25T00:00:00.000Z"),
    upcomingServiceDates: [],
    amount: 4500,
    status: "active",
  };

  let capturedBulkOps = [];
  Service.bulkWrite = async (ops) => {
    capturedBulkOps = ops;
    return { modifiedCount: ops.length };
  };
  Service.findById = () => {
    const q = { populate: () => q, then: (resolve) => resolve(corruptedLegacyDoc) };
    return q;
  };
  Service.find = () => {
    const q = {
      select: () => q,
      populate: () => q,
      then: (resolve) => resolve([corruptedLegacyDoc]),
    };
    return q;
  };

  try {
    const singleRes = makeMockRes();
    await getService({ params: { id: corruptedLegacyDoc._id } }, singleRes);
    assert.equal(singleRes.statusCode, 200);
    assert.equal(iso(singleRes.body.nextServiceDate), "2026-12-06");
    assert.equal(singleRes.body.upcomingServiceDates.length, 3);
    assert.equal(capturedBulkOps.length, 1);
    assert.equal(
      iso(capturedBulkOps[0].updateOne.update.$set.nextServiceDate),
      "2026-12-06",
    );

    const listRes = makeMockRes();
    await getAllServices({}, listRes);
    assert.equal(listRes.statusCode, 200);
    assert.equal(iso(listRes.body[0].nextServiceDate), "2026-12-06");
  } finally {
    Service.bulkWrite = origBulkWrite;
    Service.findById = origFindById;
    Service.find = origFind;
  }
});

await test("4. Schedule progression: 10 Dec 2026 -> after completion/passing becomes 10 Jan 2027 (month & year boundary)", async () => {
  const scheduleStart = "2026-11-10";
  // Before 10 Dec 2026 (reference = 2026-11-25)
  const before = serverCalc.calculateServiceDates(scheduleStart, "monthly", "2026-11-25");
  assert.equal(iso(before.nextServiceDate), "2026-12-10");
  assert.deepEqual(before.upcomingServiceDates.slice(0, 4).map(iso), [
    "2026-12-10",
    "2027-01-10",
    "2027-02-10",
    "2027-03-10",
  ]);

  // After 10 Dec 2026 passes (reference = 2026-12-11) -> advances across year boundary to 10 Jan 2027
  const after = serverCalc.calculateServiceDates(scheduleStart, "monthly", "2026-12-11");
  assert.equal(iso(after.nextServiceDate), "2027-01-10");
  // Complete schedule remains unchanged
  assert.deepEqual(after.upcomingServiceDates.slice(0, 4).map(iso), [
    "2026-12-10",
    "2027-01-10",
    "2027-02-10",
    "2027-03-10",
  ]);

  // Client calculator produces identical progression & DD/MM/YYYY formatting without timezone shift
  const clientAfter = clientCalc.calculateServiceDates(scheduleStart, "monthly", "2026-12-11");
  assert.equal(formatDateOnly(clientAfter.nextServiceDate, "No Upcoming Service"), "10/01/2027");
});

await test("5. One-Time and Yearly services return null nextServiceDate and format as 'No Upcoming Service'", async () => {
  const otj = serverCalc.calculateServiceDates("2026-11-25", "one-time", "2026-11-25");
  assert.equal(otj.nextServiceDate, null);
  assert.deepEqual(otj.upcomingServiceDates, []);
  assert.equal(formatDateOnly(otj.nextServiceDate, "No Upcoming Service"), "No Upcoming Service");

  const yearly = serverCalc.calculateServiceDates("2026-11-25", "Yearly", "2026-11-25");
  assert.equal(yearly.nextServiceDate, null);
  assert.deepEqual(yearly.upcomingServiceDates, []);
  assert.equal(formatDateOnly(yearly.nextServiceDate, "No Upcoming Service"), "No Upcoming Service");
});

await test("6. UI verification: CreateServiceModel & EditServiceModel have NO nextServiceDate input; ServiceDetails is read-only", async () => {
  const createSrc = fs.readFileSync(path.join(repoRoot, "client/src/Components/CreateServiceModel.jsx"), "utf8");
  const editSrc = fs.readFileSync(path.join(repoRoot, "client/src/Components/EditServiceModel.jsx"), "utf8");
  const detailsSrc = fs.readFileSync(path.join(repoRoot, "client/src/Pages/ServiceDetails.jsx"), "utf8");

  assert.equal(createSrc.includes('name="nextServiceDate"'), false, "CreateServiceModal has no nextServiceDate input");
  assert.equal(createSrc.includes("Next Service Date"), false, "CreateServiceModal has no Next Service Date label");
  assert.equal(editSrc.includes('name="nextServiceDate"'), false, "EditServiceModal has no nextServiceDate input");
  assert.equal(editSrc.includes("Next Service Date"), false, "EditServiceModal has no Next Service Date label");

  assert.ok(detailsSrc.includes("No Upcoming Service"), "ServiceDetails shows 'No Upcoming Service' fallback");
  assert.ok(detailsSrc.includes("Auto-calculated from schedule"), "ServiceDetails clarifies Next Service is auto-calculated");
  assert.ok(detailsSrc.includes("Upcoming Service Dates"), "ServiceDetails preserves Upcoming Service Dates section");
});

await test("7. syncServiceStatuses recalculates dates via calculateServiceDates and fixes wrongly expired/due records", async () => {
  const origFind = Service.find;
  const origBulkWrite = Service.bulkWrite;

  const { today } = getIndiaDateBoundaries();
  const addMonths = (base, m) => {
    const d = new Date(base);
    d.setUTCMonth(d.getUTCMonth() + m);
    return d;
  };
  const minusDays = (base, days) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - days);
    return d;
  };

  // Service A: Quarterly started 1 month ago, next visit in 2 months, but wrongly has 2001-08-25 & status='expired'
  const wronglyExpired = {
    _id: "srv-a",
    serviceName: "Quarterly Active Falsely Expired",
    frequency: "Quarterly",
    serviceDate: addMonths(today, -1),
    nextServiceDate: new Date("2001-08-25T00:00:00.000Z"),
    upcomingServiceDates: [],
    status: "expired",
  };

  // Service B: Monthly started 1 month ago -> calculated next visit is exactly today -> must become 'due'
  const dueTodayStart = addMonths(today, -1);
  const dueToday = {
    _id: "srv-b",
    serviceName: "Monthly Due Today",
    frequency: "monthly",
    serviceDate: dueTodayStart,
    nextServiceDate: dueTodayStart, // stale initial date
    upcomingServiceDates: [],
    status: "active",
  };

  // Service C: Future One-Time job corrupted with 2001-08-25 & 'expired' -> nextServiceDate=null, status='active'
  const futureOneTimeStart = minusDays(today, -10);
  const futureOneTime = {
    _id: "srv-c",
    serviceName: "Future One Time",
    frequency: "One-Time",
    serviceType: "One Time Job",
    serviceDate: futureOneTimeStart,
    nextServiceDate: new Date("2001-08-25T00:00:00.000Z"),
    upcomingServiceDates: [futureOneTimeStart],
    status: "expired",
  };

  // Service D: Already consistent service -> zero updates queued
  const expectedD = serverCalc.calculateServiceDates(addMonths(today, -1), "Quarterly", today);
  const consistentSrv = {
    _id: "srv-d",
    serviceName: "Consistent Quarterly",
    frequency: "Quarterly",
    serviceDate: addMonths(today, -1),
    nextServiceDate: expectedD.nextServiceDate,
    upcomingServiceDates: expectedD.upcomingServiceDates,
    status: "active",
  };

  const docs = [wronglyExpired, dueToday, futureOneTime, consistentSrv];
  let writtenOps = [];

  Service.find = () => {
    const q = { select: () => q, then: (resolve) => resolve(docs) };
    return q;
  };
  Service.bulkWrite = async (ops) => {
    writtenOps = ops;
    return { modifiedCount: ops.length };
  };

  try {
    const res = await syncServiceStatuses();
    assert.equal(res.inspected, 4);
    assert.equal(res.modified, 3);
    assert.equal(writtenOps.length, 3);

    const opA = writtenOps.find((o) => o.updateOne.filter._id === "srv-a").updateOne.update.$set;
    assert.equal(opA.status, "active", "Falsely expired quarterly service restored to active");
    const expectedA = serverCalc.calculateServiceDates(wronglyExpired.serviceDate, "Quarterly", today);
    assert.equal(iso(opA.nextServiceDate), iso(expectedA.nextServiceDate));

    const opB = writtenOps.find((o) => o.updateOne.filter._id === "srv-b").updateOne.update.$set;
    assert.equal(opB.status, "due", "Service due today marked due");
    assert.equal(iso(opB.nextServiceDate), iso(today));

    const opC = writtenOps.find((o) => o.updateOne.filter._id === "srv-c").updateOne.update.$set;
    assert.equal(opC.nextServiceDate, null, "One-Time job clears corrupted nextServiceDate");
    assert.deepEqual(opC.upcomingServiceDates, [], "One-Time job clears stale upcomingServiceDates");
    assert.equal(opC.status, "active", "Future One-Time job restored to active");
  } finally {
    Service.find = origFind;
    Service.bulkWrite = origBulkWrite;
  }
});

await test("8. backfill script supports dry-run (0 writes), execute mode, preserves legacy schedules, and is idempotent", async () => {
  const refToday = new Date("2026-11-25T00:00:00.000Z");
  const refTomorrow = new Date("2026-11-26T00:00:00.000Z");

  const customSchedule = [
    new Date("2026-12-06T00:00:00.000Z"),
    new Date("2027-03-06T00:00:00.000Z"),
  ];

  const dbStore = [
    {
      _id: "bf-1",
      serviceName: "Corrupted Next Date Quarterly",
      frequency: "Quarterly",
      serviceDate: new Date("2026-09-06T00:00:00.000Z"),
      nextServiceDate: new Date("2001-08-25T00:00:00.000Z"),
      upcomingServiceDates: [...customSchedule], // custom non-empty schedule must be preserved
      status: "expired",
    },
    {
      _id: "bf-2",
      serviceName: "Already Consistent Monthly",
      frequency: "monthly",
      serviceDate: new Date("2026-11-10T00:00:00.000Z"),
      nextServiceDate: new Date("2026-12-10T00:00:00.000Z"),
      upcomingServiceDates: [new Date("2026-12-10T00:00:00.000Z")],
      status: "active",
    },
    {
      _id: "bf-3",
      serviceName: "Completed Historical One-Time",
      frequency: "One-Time",
      serviceDate: new Date("2025-05-01T00:00:00.000Z"),
      nextServiceDate: null,
      upcomingServiceDates: [],
      status: "completed",
    },
  ];

  let bulkWriteCalls = 0;
  const mockServiceModel = {
    find: () => {
      const q = { select: () => q, then: (resolve) => resolve(dbStore) };
      return q;
    },
    bulkWrite: async (ops) => {
      bulkWriteCalls += 1;
      for (const op of ops) {
        const target = dbStore.find((d) => d._id === op.updateOne.filter._id);
        if (target) {
          Object.assign(target, op.updateOne.update.$set);
        }
      }
      return { modifiedCount: ops.length };
    },
  };

  // Dry-run: must make 0 writes
  const dryReport = await runNextServiceBackfill({
    ServiceModel: mockServiceModel,
    execute: false,
    today: refToday,
    tomorrow: refTomorrow,
  });
  assert.equal(dryReport.totalInspected, 3);
  assert.equal(dryReport.requiringCorrection, 1);
  assert.equal(dryReport.unchanged, 2);
  assert.equal(dryReport.modified, 0);
  assert.equal(bulkWriteCalls, 0);
  assert.equal(dryReport.changes[0].oldNextServiceDate, "2001-08-25");
  assert.equal(dryReport.changes[0].proposedNextServiceDate, "2026-12-06");
  assert.equal(dryReport.changes[0].oldStatus, "expired");
  assert.equal(dryReport.changes[0].proposedStatus, "active");

  // Execute mode: persists fix & preserves custom non-empty schedule
  const execReport = await runNextServiceBackfill({
    ServiceModel: mockServiceModel,
    execute: true,
    today: refToday,
    tomorrow: refTomorrow,
  });
  assert.equal(execReport.modified, 1);
  assert.equal(bulkWriteCalls, 1);
  assert.equal(iso(dbStore[0].nextServiceDate), "2026-12-06");
  assert.equal(dbStore[0].status, "active");
  assert.equal(dbStore[0].upcomingServiceDates.length, 2, "Preserved existing custom schedule");
  assert.equal(dbStore[2].status, "completed", "Historical completed record untouched");

  // Re-run execute (idempotency check): 0 corrections, 0 writes
  const secondRun = await runNextServiceBackfill({
    ServiceModel: mockServiceModel,
    execute: true,
    today: refToday,
    tomorrow: refTomorrow,
  });
  assert.equal(secondRun.requiringCorrection, 0);
  assert.equal(secondRun.unchanged, 3);
  assert.equal(secondRun.modified, 0);
  assert.equal(bulkWriteCalls, 1);
});

console.log(`\n🎉 ALL ${passed} NEXT SERVICE AUTO-CALCULATION TESTS PASSED SUCCESSFULLY!`);
