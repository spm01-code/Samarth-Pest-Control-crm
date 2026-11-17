import Invoice from "../model/invoiceModel.js";
import Quotation from "../model/quotationModel.js";
import Renewal from "../model/renewalModel.js";
import Service from "../model/serviceModel.js";
import Customer from "../model/customerModel.js";

/**
 * Backfills immutable customerSnapshot subdocuments on historical
 * Invoices, Quotations, Renewals, and Services where missing.
 * Ensures historical documents retain their original Job Number and details
 * permanently, decoupled from future Job Number releases or reassignments.
 */
export async function backfillHistoricalCustomerSnapshots() {
  console.log("Starting historical document snapshot backfill...");

  const customerMap = new Map();
  const allCustomers = await Customer.find().lean();
  allCustomers.forEach((c) => customerMap.set(String(c._id), c));

  const makeSnapshot = (cust) => {
    if (!cust) return null;
    return {
      jobNo: cust.jobNo || cust.archivedJobNo || "",
      fullName: cust.fullName || "",
      companyName: cust.companyName || "",
      address: cust.address || "",
      phone: cust.phone || "",
      email: cust.email || "",
      gstNumber: cust.gstNumber || "",
      contactPerson: cust.contactPerson || "",
      snapshotTakenAt: new Date(),
    };
  };

  const results = {
    invoicesUpdated: 0,
    quotationsUpdated: 0,
    renewalsUpdated: 0,
    servicesUpdated: 0,
  };

  // 1. Invoices
  const invoicesWithoutSnap = await Invoice.find({
    $or: [
      { customerSnapshot: { $exists: false } },
      { "customerSnapshot.jobNo": { $exists: false } },
      { "customerSnapshot.jobNo": "" },
    ],
  });

  for (const inv of invoicesWithoutSnap) {
    if (!inv.customer) continue;
    const cust = customerMap.get(String(inv.customer));
    if (cust && (cust.jobNo || cust.archivedJobNo)) {
      inv.customerSnapshot = makeSnapshot(cust);
      await inv.save();
      results.invoicesUpdated++;
    }
  }

  // 2. Quotations
  const quotationsWithoutSnap = await Quotation.find({
    $or: [
      { customerSnapshot: { $exists: false } },
      { "customerSnapshot.jobNo": { $exists: false } },
      { "customerSnapshot.jobNo": "" },
    ],
  });

  for (const qtn of quotationsWithoutSnap) {
    if (!qtn.customer) continue;
    const cust = customerMap.get(String(qtn.customer));
    if (cust && (cust.jobNo || cust.archivedJobNo)) {
      qtn.customerSnapshot = makeSnapshot(cust);
      await qtn.save();
      results.quotationsUpdated++;
    }
  }

  // 3. Renewals
  const renewalsWithoutSnap = await Renewal.find({
    $or: [
      { customerSnapshot: { $exists: false } },
      { "customerSnapshot.jobNo": { $exists: false } },
      { "customerSnapshot.jobNo": "" },
    ],
  });

  for (const ren of renewalsWithoutSnap) {
    if (!ren.customer) continue;
    const cust = customerMap.get(String(ren.customer));
    if (cust && (cust.jobNo || cust.archivedJobNo)) {
      ren.customerSnapshot = makeSnapshot(cust);
      await ren.save();
      results.renewalsUpdated++;
    }
  }

  // 4. Services
  const servicesWithoutSnap = await Service.find({
    $or: [
      { customerSnapshot: { $exists: false } },
      { "customerSnapshot.jobNo": { $exists: false } },
      { "customerSnapshot.jobNo": "" },
    ],
  });

  for (const srv of servicesWithoutSnap) {
    if (!srv.customer) continue;
    const cust = customerMap.get(String(srv.customer));
    if (cust && (cust.jobNo || cust.archivedJobNo)) {
      srv.customerSnapshot = makeSnapshot(cust);
      await srv.save();
      results.servicesUpdated++;
    }
  }

  console.log("Historical document snapshot backfill completed:", results);
  return results;
}
