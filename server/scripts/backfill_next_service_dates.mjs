import dotenv from "dotenv";
dotenv.config({ path: "./server/.env" });
dotenv.config({ path: "./.env" });
dotenv.config();

import dns from "dns";
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder("ipv4first");

import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

import Service from "../model/serviceModel.js";
import {
  computeAuthoritativeServiceSync,
  getIndiaDateBoundaries,
} from "../controller/serviceController.js";

const formatDateIso = (val) => {
  if (!val) return "null";
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toISOString().slice(0, 10);
};

/**
 * Inspects all Service records and calculates authoritative nextServiceDate /
 * status updates without modifying billing fields or non-empty existing schedules.
 * Performs DB writes only when execute === true.
 */
export const runNextServiceBackfill = async ({
  ServiceModel = Service,
  execute = false,
  today = null,
  tomorrow = null,
} = {}) => {
  const boundaries = getIndiaDateBoundaries();
  const refToday = today || boundaries.today;
  const refTomorrow =
    tomorrow ||
    (() => {
      const nextDay = new Date(refToday);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      return nextDay;
    })();

  const query = ServiceModel.find({});
  const services =
    query && typeof query.select === "function"
      ? await query.select(
          "_id serviceName frequency serviceDate nextServiceDate upcomingServiceDates status serviceType isOneTimeJob",
        )
      : await query;

  if (!Array.isArray(services)) {
    return {
      execute,
      totalInspected: 0,
      requiringCorrection: 0,
      unchanged: 0,
      modified: 0,
      changes: [],
    };
  }

  const bulkOps = [];
  const changes = [];

  for (const srv of services) {
    const { skipped, updates } = computeAuthoritativeServiceSync(
      srv,
      refToday,
      refTomorrow,
    );

    if (skipped || Object.keys(updates).length === 0) {
      continue;
    }

    changes.push({
      id: String(srv._id),
      serviceName: srv.serviceName || "Unnamed Service",
      frequency: srv.frequency || "-",
      serviceDate: formatDateIso(srv.serviceDate),
      oldNextServiceDate: formatDateIso(srv.nextServiceDate),
      proposedNextServiceDate:
        "nextServiceDate" in updates
          ? formatDateIso(updates.nextServiceDate)
          : formatDateIso(srv.nextServiceDate),
      oldStatus: srv.status || "-",
      proposedStatus: updates.status || srv.status || "-",
      updates,
    });

    bulkOps.push({
      updateOne: {
        filter: { _id: srv._id },
        update: { $set: updates },
      },
    });
  }

  let modified = 0;
  if (execute && bulkOps.length > 0) {
    if (typeof ServiceModel.bulkWrite === "function") {
      const result = await ServiceModel.bulkWrite(bulkOps);
      modified = result?.modifiedCount ?? bulkOps.length;
    } else if (typeof ServiceModel.updateOne === "function") {
      for (const op of bulkOps) {
        await ServiceModel.updateOne(op.updateOne.filter, op.updateOne.update);
        modified += 1;
      }
    }
  }

  return {
    execute,
    totalInspected: services.length,
    requiringCorrection: changes.length,
    unchanged: services.length - changes.length,
    modified,
    changes,
  };
};

const printHelp = () => {
  console.log(`Usage: node server/scripts/backfill_next_service_dates.mjs [options]

Options:
  --dry-run        Inspect records and print proposed changes without writing (default)
  --execute        Persist calculated nextServiceDate and status fixes to MongoDB
  --uri <uri>      Override MONGO_URI from environment
  --allow-atlas    Allow --execute against a MongoDB Atlas host
  --help           Show this help message
`);
};

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const execute = args.includes("--execute");
  const allowAtlas = args.includes("--allow-atlas");
  const uriArgIndex = args.indexOf("--uri");
  const customUri =
    uriArgIndex !== -1 && args[uriArgIndex + 1] ? args[uriArgIndex + 1] : null;

  const uri = customUri || process.env.MONGO_URI;
  if (!uri) {
    throw new Error(
      "MONGO_URI is not configured in server/.env or passed via --uri",
    );
  }

  console.log("================================================================================");
  console.log("  SAMARTH CRM — NEXT SERVICE DATE BACKFILL & CONSISTENCY SCRIPT");
  console.log(
    `  MODE: ${execute ? "LIVE EXECUTION (WRITES ENABLED)" : "DRY RUN (NO WRITES)"}`,
  );
  console.log("================================================================================\n");
  console.log("Connecting to:", uri.replace(/:[^:@]+@/, ":****@"));

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    const dbName = mongoose.connection.name;
    const host = mongoose.connection.host || "";
    console.log(`Connected to database '${dbName}' on host '${host}'.`);

    const isAtlas = host.includes("mongodb.net");
    if (isAtlas) {
      console.warn(`NOTICE: Connection host is MongoDB Atlas ('${host}').`);
      if (execute && !allowAtlas) {
        throw new Error(
          "SAFETY ABORT: Target database is MongoDB Atlas. Pass --allow-atlas to execute writes against Atlas.",
        );
      }
    }

    const report = await runNextServiceBackfill({ execute });

    console.log("\n--- Backfill Report ---");
    console.log(`Total records inspected      : ${report.totalInspected}`);
    console.log(`Records requiring correction : ${report.requiringCorrection}`);
    console.log(`Unchanged records            : ${report.unchanged}`);
    console.log(`Records modified in DB       : ${report.modified}`);

    if (report.changes.length > 0) {
      console.log("\nProposed / Applied Corrections:");
      for (const item of report.changes) {
        const statusPart =
          item.oldStatus !== item.proposedStatus
            ? ` | status: ${item.oldStatus} -> ${item.proposedStatus}`
            : "";
        console.log(
          `- [${item.id}] ${item.serviceName} (${item.frequency}, start ${item.serviceDate}): ` +
            `nextServiceDate ${item.oldNextServiceDate} -> ${item.proposedNextServiceDate}${statusPart}`,
        );
      }
    } else {
      console.log("\nAll service records are already consistent.");
    }
  } finally {
    await mongoose.disconnect();
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((err) => {
    console.error("\nBackfill failed:", err.message);
    process.exit(1);
  });
}
