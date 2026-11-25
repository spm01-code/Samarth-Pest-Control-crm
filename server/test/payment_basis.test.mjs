import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { PDFDocument } from "pdf-lib";

import Service from "../model/serviceModel.js";
import Quotation from "../model/quotationModel.js";
import Renewal from "../model/renewalModel.js";
import Customer from "../model/customerModel.js";
import Employee from "../model/employeeModel.js";
import { createService, updateService } from "../controller/serviceController.js";
import { createQuotation, updateQuotation } from "../controller/quotationController.js";
import { createRenewal, updateRenewal } from "../controller/renewalController.js";
import {
  generateQuotationDocx,
  generateAttQuotationDocx,
  generateContractRenewalDocx,
  generateOneTimeJobDocx,
} from "../utils/docGenerator.js";
import { generatePdfFromPdfTemplate } from "../utils/pdfTemplateGenerator.js";
import { inspectPdfTemplate } from "../utils/pdfTemplateInspector.js";
import { parsePaymentBasis, formatPaymentBasisLabel } from "../utils/paymentBasisHelper.js";
import { PAYMENT_BASIS_OPTIONS, formatPaymentBasis } from "../../client/src/utils/paymentBasis.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serverRoot, "..");
process.chdir(serverRoot);

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`  ✅ PASS: ${name}`);
}

const makeMockRes = () => {
  const res = {
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
  };
  return res;
};

console.log("================================================================================");
console.log("  PAYMENT BASIS / CHARGE BASIS END-TO-END VERIFICATION SUITE                    ");
console.log("================================================================================\n");

await test("1. Helper & Frontend formatting options match requirements", async () => {
  assert.deepEqual(PAYMENT_BASIS_OPTIONS, [
    { value: "per-service", label: "Per Service" },
    { value: "per-month", label: "Per Month" },
    { value: "per-year", label: "Per Year" },
  ]);
  assert.equal(formatPaymentBasis("per-service"), "Per Service");
  assert.equal(formatPaymentBasis("per-month"), "Per Month");
  assert.equal(formatPaymentBasis("per-year"), "Per Year");
  assert.equal(formatPaymentBasis(undefined), "Not Specified");
  assert.equal(formatPaymentBasis(""), "Not Specified");

  assert.equal(parsePaymentBasis("Per Month").value, "per-month");
  assert.equal(parsePaymentBasis("per_year").value, "per-year");
  assert.equal(parsePaymentBasis("per-service").value, "per-service");
  assert.equal(parsePaymentBasis("invalid-unit").valid, false);
  assert.equal(formatPaymentBasisLabel(undefined, ""), "");
});

await test("2. Mongoose Schema validation on Service, Quotation, and Renewal", async () => {
  // Valid service with paymentBasis
  const s1 = new Service({
    customer: "65a000000000000000000001",
    serviceName: "General Pest Control",
    frequency: "twice a week",
    serviceDate: new Date("2026-11-25"),
    address: "Virar West",
    amount: 4500,
    paymentBasis: "per-month",
  });
  assert.equal(s1.validateSync(), undefined);

  // Legacy service without paymentBasis (must remain valid and absent)
  const sLegacy = new Service({
    customer: "65a000000000000000000001",
    serviceName: "Legacy Pest Control",
    frequency: "monthly",
    serviceDate: new Date("2026-11-25"),
    address: "Virar West",
    amount: 1200,
  });
  assert.equal(sLegacy.validateSync(), undefined);
  assert.equal(sLegacy.paymentBasis, undefined);

  // Invalid paymentBasis rejected by Mongoose schema
  const sInvalid = new Service({
    customer: "65a000000000000000000001",
    serviceName: "Invalid Basis",
    frequency: "monthly",
    serviceDate: new Date("2026-11-25"),
    address: "Virar West",
    amount: 500,
    paymentBasis: "per-week",
  });
  assert.ok(sInvalid.validateSync()?.errors?.paymentBasis);

  // Quotation schema with multiple paymentBasis values and absent legacy row
  const q1 = new Quotation({
    quotationNumber: "SPM/PC/2026/99",
    quotationType: "PC",
    premises: "Test Complex",
    services: [
      { serviceName: "S1", frequency: "Twice a Week", cost: 4500, paymentBasis: "per-month" },
      { serviceName: "S2", frequency: "Monthly", cost: 500, paymentBasis: "per-service" },
      { serviceName: "S3", frequency: "Quarterly", cost: 12000, paymentBasis: "per-year" },
      { serviceName: "S4", frequency: "3 Services Yearly", cost: 1000, paymentBasis: "per-service" },
      { serviceName: "S5", frequency: "Yearly", cost: 2500 },
    ],
  });
  assert.equal(q1.validateSync(), undefined);

  // Renewal schema with paymentBasis
  const r1 = new Renewal({
    renewalNumber: "SPM/CR/2026/99",
    customer: "65a000000000000000000001",
    services: [
      { serviceName: "S1", frequency: "Twice a Week", amount: 4500, paymentBasis: "per-month" },
      { serviceName: "S2", frequency: "Quarterly", amount: 12000, paymentBasis: "per-year" },
    ],
  });
  assert.equal(r1.validateSync(), undefined);
});

await test("3. Service controller tests all 4 required combinations, editing, validation, and non-derivation", async () => {
  const origCustFindById = Customer.findById;
  const origEmpFindById = Employee.findById;
  const origSrvSave = Service.prototype.save;
  const origSrvPopulate = Service.prototype.populate;
  const origSrvFindById = Service.findById;
  const origSrvFindByIdAndUpdate = Service.findByIdAndUpdate;

  const mockCustomer = { _id: "65a000000000000000000001", fullName: "Test Client", jobNo: "C/01", address: "Pune", phone: "9999999999" };
  const store = new Map();

  Customer.findById = async (id) => (String(id) === mockCustomer._id ? mockCustomer : null);
  Employee.findById = async () => null;
  Service.prototype.save = async function () {
    store.set(String(this._id), this.toObject());
    return this;
  };
  Service.prototype.populate = async function () {
    return this;
  };
  Service.findById = async (id) => store.get(String(id)) || null;
  Service.findByIdAndUpdate = (id, updateOp) => {
    const existing = { ...(store.get(String(id)) || {}) };
    const next = { ...existing, ...updateOp };
    delete next.$unset;
    if (updateOp.$unset) {
      for (const k of Object.keys(updateOp.$unset)) {
        delete next[k];
      }
    }
    store.set(String(id), next);
    const q = {
      populate: () => q,
      then: (resolve) => resolve(next),
    };
    return q;
  };

  try {
    const cases = [
      { frequency: "twice a week", amount: 4500, paymentBasis: "per-month", expectedFreq: "twice a week" },
      { frequency: "monthly", amount: 500, paymentBasis: "per-service", expectedFreq: "monthly" },
      { frequency: "Quarterly", amount: 12000, paymentBasis: "per-year", expectedFreq: "Quarterly" },
      { frequency: "3 Services Yearly", amount: 1000, paymentBasis: "per-service", expectedFreq: "Yearly 3 services" },
    ];

    const createdIds = [];
    for (const c of cases) {
      const res = makeMockRes();
      await createService(
        {
          body: {
            customer: mockCustomer._id,
            serviceName: `Pest Control (${c.frequency})`,
            frequency: c.frequency,
            serviceDate: "2026-11-25",
            address: "Pune",
            amount: c.amount,
            paymentBasis: c.paymentBasis,
          },
        },
        res
      );
      assert.equal(res.statusCode, 201);
      assert.equal(res.body.service.paymentBasis, c.paymentBasis);
      assert.equal(res.body.service.amount, c.amount);
      assert.equal(res.body.service.frequency, c.expectedFreq);
      createdIds.push(res.body.service._id);
    }

    // Legacy / absent paymentBasis is NOT auto-derived from frequency
    const legacyRes = makeMockRes();
    await createService(
      {
        body: {
          customer: mockCustomer._id,
          serviceName: "No Basis Service",
          frequency: "monthly",
          serviceDate: "2026-11-25",
          address: "Pune",
          amount: 2000,
        },
      },
      legacyRes
    );
    assert.equal(legacyRes.statusCode, 201);
    assert.equal(legacyRes.body.service.paymentBasis, undefined, "Must NOT auto-derive paymentBasis from frequency");

    // Invalid paymentBasis rejected with 400
    const badRes = makeMockRes();
    await createService(
      {
        body: {
          customer: mockCustomer._id,
          serviceName: "Bad Basis",
          frequency: "monthly",
          serviceDate: "2026-11-25",
          address: "Pune",
          amount: 2000,
          paymentBasis: "weekly",
        },
      },
      badRes
    );
    assert.equal(badRes.statusCode, 400);

    // Edit existing service without paymentBasis -> set paymentBasis -> update -> clear
    const editRes1 = makeMockRes();
    await updateService(
      {
        params: { id: legacyRes.body.service._id },
        body: { customer: mockCustomer._id, paymentBasis: "per-year" },
      },
      editRes1
    );
    assert.equal(editRes1.statusCode, 200);
    assert.equal(editRes1.body.service.paymentBasis, "per-year");
    assert.equal(editRes1.body.service.amount, 2000, "Amount unchanged on paymentBasis update");

    const editRes2 = makeMockRes();
    await updateService(
      {
        params: { id: legacyRes.body.service._id },
        body: { customer: mockCustomer._id, paymentBasis: "" },
      },
      editRes2
    );
    assert.equal(editRes2.statusCode, 200);
    assert.equal(editRes2.body.service.paymentBasis, undefined, "Cleared paymentBasis unsets field");
  } finally {
    Customer.findById = origCustFindById;
    Employee.findById = origEmpFindById;
    Service.prototype.save = origSrvSave;
    Service.prototype.populate = origSrvPopulate;
    Service.findById = origSrvFindById;
    Service.findByIdAndUpdate = origSrvFindByIdAndUpdate;
  }
});

await test("4. Quotation & Renewal controllers validate and preserve paymentBasis without changing totals", async () => {
  const origQtnFindById = Quotation.findById;
  const origQtnFindByIdAndUpdate = Quotation.findByIdAndUpdate;
  const origRenFindById = Renewal.findById;
  const origRenFindByIdAndUpdate = Renewal.findByIdAndUpdate;
  const origCustFindById = Customer.findById;

  try {
    // Quotation validation rejects invalid paymentBasis
    const badQtnRes = makeMockRes();
    await createQuotation(
      {
        body: {
          quotationType: "PC",
          customerName: "Test",
          premises: "Pune",
          services: [{ serviceName: "PC", frequency: "Monthly", cost: 4500, paymentBasis: "per-decade" }],
        },
      },
      badQtnRes
    );
    assert.equal(badQtnRes.statusCode, 400);

    // Quotation update strips empty paymentBasis & accepts valid ones without changing totalAmount
    Quotation.findById = (id) => {
      const doc = { _id: id, quotationType: "PC", premises: "Pune", customerSnapshot: { fullName: "Test" } };
      const q = { populate: () => q, then: (resolve) => resolve(doc) };
      return q;
    };
    let capturedQtnUpdate = null;
    Quotation.findByIdAndUpdate = (id, updateData) => {
      capturedQtnUpdate = updateData;
      return { ...updateData, _id: id };
    };
    const updQtnRes = makeMockRes();
    await updateQuotation(
      {
        params: { id: "65c000000000000000000001" },
        body: {
          services: [
            { serviceName: "S1", frequency: "Twice a Week", cost: 4500, paymentBasis: "per-month" },
            { serviceName: "S2", frequency: "Monthly", cost: 500, paymentBasis: "" },
          ],
        },
      },
      updQtnRes
    );
    assert.equal(updQtnRes.statusCode, 200);
    assert.equal(capturedQtnUpdate.totalAmount, 5000, "Total remains simple sum without recalculation");
    assert.equal(capturedQtnUpdate.services[0].paymentBasis, "per-month");
    assert.equal("paymentBasis" in capturedQtnUpdate.services[1], false);

    // Renewal validation rejects invalid paymentBasis
    Customer.findById = async () => ({ _id: "65a000000000000000000001", fullName: "Test", address: "Pune" });
    const badRenRes = makeMockRes();
    await createRenewal(
      {
        body: {
          customer: "65a000000000000000000001",
          services: [{ serviceName: "PC", frequency: "Monthly", amount: 500, paymentBasis: "invalid" }],
        },
      },
      badRenRes
    );
    assert.equal(badRenRes.statusCode, 400);

    Renewal.findById = (id) => {
      const doc = { _id: id, customer: "65a000000000000000000001" };
      const q = { populate: () => q, then: (resolve) => resolve(doc) };
      return q;
    };
    let capturedRenUpdate = null;
    Renewal.findByIdAndUpdate = (id, updateData) => {
      capturedRenUpdate = updateData;
      return { ...updateData, _id: id };
    };
    const updRenRes = makeMockRes();
    await updateRenewal(
      {
        params: { id: "65d000000000000000000001" },
        body: {
          services: [
            { serviceName: "S1", frequency: "Quarterly", amount: 12000, paymentBasis: "per-year" },
            { serviceName: "S2", frequency: "3 Services Yearly", amount: 1000, paymentBasis: "per-service" },
          ],
        },
      },
      updRenRes
    );
    assert.equal(updRenRes.statusCode, 200);
    assert.equal(capturedRenUpdate.totalAmount, 13000);
    assert.equal(capturedRenUpdate.services[0].paymentBasis, "per-year");
    assert.equal(capturedRenUpdate.services[1].paymentBasis, "per-service");
  } finally {
    Quotation.findById = origQtnFindById;
    Quotation.findByIdAndUpdate = origQtnFindByIdAndUpdate;
    Renewal.findById = origRenFindById;
    Renewal.findByIdAndUpdate = origRenFindByIdAndUpdate;
    Customer.findById = origCustFindById;
  }
});

await test("5. DOCX generation renders each service row's Payment Basis & preserves legacy rows", async () => {
  const servicesPayload = [
    { serviceNumber: "1", location: "Wing A", serviceName: "Cockroach Control", frequency: "TWICE A WEEK", amount: "4,500.00", paymentBasis: "Per Month" },
    { serviceNumber: "2", location: "Wing B", serviceName: "Rodent Control", frequency: "MONTHLY", amount: "500.00", paymentBasis: "Per Service" },
    { serviceNumber: "3", location: "Wing C", serviceName: "General Pest Control", frequency: "QUARTERLY", amount: "12,000.00", paymentBasis: "Per Year" },
    { serviceNumber: "4", location: "Wing D", serviceName: "Termite Check", frequency: "3 SERVICES YEARLY", amount: "1,000.00", paymentBasis: "Per Service" },
    { serviceNumber: "5", location: "Wing E", serviceName: "Legacy Service", frequency: "YEARLY", amount: "2,500.00", paymentBasis: "" },
  ];

  // PC Quotation DOCX template
  const pcZip = new PizZip(fs.readFileSync(path.join(serverRoot, "uploads/templates/1791265093032-349139013.docx"), "binary"));
  const pcDoc = new Docxtemplater(pcZip, { paragraphLoop: true, linebreaks: true });
  pcDoc.render({
    quotationDate: "25/11/2026",
    quotationNumber: "SPM/PC/2026/01",
    customerName: "Acme Residency",
    premisesTreated: "Acme Residency, Virar West",
    totalAmount: "20,500.00",
    billingTerm: "Monthly",
    services: servicesPayload,
  });
  const pcPlain = pcDoc.getZip().file("word/document.xml").asText().replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.ok(pcPlain.includes("4,500.00 Per Month"), "PC QTN DOCX renders Per Month");
  assert.ok(pcPlain.includes("500.00 Per Service"), "PC QTN DOCX renders Per Service");
  assert.ok(pcPlain.includes("12,000.00 Per Year"), "PC QTN DOCX renders Per Year");
  assert.ok(pcPlain.includes("1,000.00 Per Service"), "PC QTN DOCX renders 4th row Per Service");
  assert.ok(pcPlain.includes("2,500.00 TOTAL AMOUNT"), "PC QTN DOCX legacy row has no trailing clutter");

  // Contract Renewal DOCX (using docGenerator directly)
  const crRes = await generateContractRenewalDocx({
    renewalNumber: "SPM/CR/2026/01",
    renewalDate: "2026-11-25",
    customer: { fullName: "Sterling Residency", address: "Virar" },
    services: [
      { serviceName: "Cockroach Control", location: "Wing A", frequency: "Twice a Week", amount: 4500, paymentBasis: "per-month" },
      { serviceName: "Rodent Control", location: "Wing B", frequency: "Monthly", amount: 500, paymentBasis: "per-service" },
      { serviceName: "General Pest", location: "Wing C", frequency: "Quarterly", amount: 12000, paymentBasis: "per-year" },
      { serviceName: "3-Visit AMC", location: "Wing D", frequency: "3 Services Yearly", amount: 1000, paymentBasis: "per-service" },
      { serviceName: "Legacy", location: "Wing E", frequency: "Yearly", amount: 2500 },
    ],
    totalAmount: 20500,
  });
  assert.ok(crRes.buffer);
  if (!crRes.isPdfDirect) {
    const crZip = new PizZip(crRes.buffer);
    const crPlain = crZip.file("word/document.xml").asText().replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    assert.ok(crPlain.includes("4,500.00 Per Month"));
    assert.ok(crPlain.includes("500.00 Per Service"));
    assert.ok(crPlain.includes("12,000.00 Per Year"));
    assert.ok(crPlain.includes("1,000.00 Per Service"));
    assert.ok(!crPlain.includes("Not Specified"));
  }

  // One-Time Job DOCX
  const otjRes = await generateOneTimeJobDocx({
    jobNo: "Job No/2026/01",
    frequency: "one-time",
    serviceDate: "2026-11-25",
    customerName: "Mr. Kulkarni",
    address: "Baner, Pune",
    serviceName: "Fogging",
    amount: 1000,
    paymentBasis: "per-service",
  });
  assert.ok(otjRes.buffer);
  if (!otjRes.isPdfDirect) {
    const otjZip = new PizZip(otjRes.buffer);
    const otjPlain = otjZip.file("word/document.xml").asText().replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    assert.ok(otjPlain.includes("Rs. 1,000.00 /-- Per Service"));
  }

  // ATT Quotation DOCX
  const attRes = await generateAttQuotationDocx({
    quotationNumber: "SPM/ATT/2026/01",
    quotationType: "ATT",
    quotationDate: "2026-11-25",
    customer: { fullName: "Metro Builders", address: "Vasai" },
    treatments: [
      { typeOfTreatment: "ATT Pre-Construction", warrantyPeriod: "10 Years", chemicalUsed: "Imidacloprid", serviceCharges: "Rs. 4,500", paymentBasis: "per-month" },
    ],
  });
  assert.ok(attRes.buffer);
});

await test("6. PDF generation renders all 4 combinations + legacy fallback across PC Quotation, Contract Renewal, One-Time Job, and ATT Quotation", async () => {
  const outDir = path.join(os.tmpdir(), "crm_payment_basis_pdfs");
  fs.mkdirSync(outDir, { recursive: true });

  // A. PC Quotation PDF
  const pcPdfBuf = await generatePdfFromPdfTemplate(
    path.join(serverRoot, "uploads/templates/1791628450521-535595073.pdf"),
    {
      quotationNumber: "SPM/PC/2026/01",
      quotationDate: "25/11/2026",
      customerName: "Samarth Residency Co-op Housing Society",
      customerAddress: "Plot 12, Virar West, Palghar - 401303",
      premisesTreated: "Samarth Residency Co-op Housing Society, Buildings A-D",
      billingTerm: "Monthly",
      services: [
        { serviceNumber: "1", location: "Common Areas & Ducts", serviceName: "General Pest Control", frequency: "TWICE A WEEK", amount: "4,500.00", paymentBasis: "per-month" },
        { serviceNumber: "2", location: "Kitchen & Pantry", serviceName: "Cockroach Gel Treatment", frequency: "MONTHLY", amount: "500.00", paymentBasis: "per-service" },
        { serviceNumber: "3", location: "Basement & Parking", serviceName: "Rodent Control", frequency: "QUARTERLY", amount: "12,000.00", paymentBasis: "per-year" },
        { serviceNumber: "4", location: "Garden & Perimeter", serviceName: "Anti-Termite Inspection", frequency: "3 SERVICES YEARLY", amount: "1,000.00", paymentBasis: "per-service" },
        { serviceNumber: "5", location: "Terrace Tanks", serviceName: "Legacy Fogging Service", frequency: "YEARLY", amount: "2,500.00" },
      ],
      totalAmount: "20,500.00",
    },
    "quotation"
  );
  const samplePdfPath = path.join(outDir, "sample_pc_quotation_payment_basis.pdf");
  fs.writeFileSync(samplePdfPath, pcPdfBuf);
  const pcInsp = await inspectPdfTemplate(pcPdfBuf);
  const pcText = pcInsp.pages[0].fullText;
  assert.ok(pcText.includes("4,500.00") && pcText.includes("Per Month"), "PC PDF has 4,500.00 and Per Month");
  assert.ok(pcText.includes("500.00") && pcText.includes("Per Service"), "PC PDF has 500.00 and Per Service");
  assert.ok(pcText.includes("12,000.00") && pcText.includes("Per Year"), "PC PDF has 12,000.00 and Per Year");
  assert.ok(pcText.includes("1,000.00"), "PC PDF has 1,000.00");
  assert.ok(pcText.includes("2,500.00"), "PC PDF has legacy 2,500.00");
  assert.ok(!pcText.includes("Not Specified"), "PC PDF does not pollute legacy row with Not Specified");

  // B. Contract Renewal PDF
  const crPdfBuf = await generatePdfFromPdfTemplate(
    path.join(serverRoot, "uploads/templates/FORMAT - CONTRACT RENEWAL.pdf"),
    {
      renewalDate: "25/11/2026",
      customerName: "Sterling Enterprises",
      customerAddress: "Plot 45, Vasai East",
      contractPeriod: "01 DECEMBER 2026 to 30 NOVEMBER 2027 (12 Months)",
      paymentTerm: "Quarterly",
      services: [
        { serviceNumber: "1", location: "Factory Floor", serviceName: "General Pest Control", frequency: "TWICE A WEEK", amount: "4500", paymentBasis: "per-month" },
        { serviceNumber: "2", location: "Canteen", serviceName: "Cockroach Control", frequency: "MONTHLY", amount: "500", paymentBasis: "per-service" },
        { serviceNumber: "3", location: "Warehouse", serviceName: "Rodent Control", frequency: "QUARTERLY", amount: "12000", paymentBasis: "per-year" },
        { serviceNumber: "4", location: "Perimeter", serviceName: "Termite Check", frequency: "3 SERVICES YEARLY", amount: "1000", paymentBasis: "per-service" },
      ],
      totalAmount: "18000",
      amountInWords: "RUPEES EIGHTEEN THOUSAND ONLY",
    },
    "contract-renewal"
  );
  fs.writeFileSync(path.join(outDir, "sample_contract_renewal_payment_basis.pdf"), crPdfBuf);
  const crInsp = await inspectPdfTemplate(crPdfBuf);
  const crText = crInsp.pages[0].fullText;
  assert.ok(crText.includes("4,500.00") && crText.includes("Per Month"), "CR PDF has Per Month");
  assert.ok(crText.includes("500.00") && crText.includes("Per Service"), "CR PDF has Per Service");
  assert.ok(crText.includes("12,000.00") && crText.includes("Per Year"), "CR PDF has Per Year");

  // C. One-Time Job PDF
  const otjPdfBuf = await generatePdfFromPdfTemplate(
    path.join(serverRoot, "uploads/templates/FORMAT - ONE TIME JOB.pdf"),
    {
      jobNo: "Job No/2026/01",
      customerName: "Mr. Kulkarni",
      customerAddress: "Baner, Pune",
      contactPerson: "Mr. Kulkarni",
      contactNumber: "9876543210",
      serviceName: "Fogging Treatment",
      area: "2500 Sq Ft",
      locationOfPest: "Garden",
      frequency: "One Time Job",
      serviceCharges: "1,000.00",
      paymentBasis: "per-service",
      serviceDate1: "25/11/2026",
    },
    "one-time-job"
  );
  fs.writeFileSync(path.join(outDir, "sample_one_time_job_payment_basis.pdf"), otjPdfBuf);
  const otjInsp = await inspectPdfTemplate(otjPdfBuf);
  assert.ok(otjInsp.pages[0].fullText.includes("Rs. 1,000.00 /-- Per Service"), "OTJ PDF displays Rs. 1,000.00 /-- Per Service");

  // D. ATT Quotation PDF
  const attPdfBuf = await generatePdfFromPdfTemplate(
    path.join(serverRoot, "uploads/templates/FORMAT - ATT QTN PLACEHOLDER.pdf"),
    {
      quotationNumber: "SPM/ATT/2026/01",
      quotationDate: "25/11/2026",
      customerName: "Metro Builders",
      customerAddress: "Plot 45, Vasai East",
      treatments: [
        { typeOfTreatment: "ATT Pre-Construction", warrantyPeriod: "10 Years", chemicalUsed: "Imidacloprid", serviceCharges: "Rs. 12,000", paymentBasis: "per-year" },
      ],
    },
    "att-quotation"
  );
  fs.writeFileSync(path.join(outDir, "sample_att_quotation_payment_basis.pdf"), attPdfBuf);
  const attInsp = await inspectPdfTemplate(attPdfBuf);
  assert.ok(attInsp.pages[0].fullText.includes("Per Year"), "ATT PDF displays Per Year");
});

await test("7. Frontend components include Payment Basis controls and fallback display", async () => {
  const files = [
    "client/src/Components/CreateServiceModel.jsx",
    "client/src/Components/EditServiceModel.jsx",
    "client/src/Pages/ServiceDetails.jsx",
    "client/src/Pages/Services.jsx",
    "client/src/Pages/CustomerProfile.jsx",
    "client/src/Components/CreateQuotationModel.jsx",
    "client/src/Pages/QuotationDetails.jsx",
    "client/src/Components/CreateRenewalModal.jsx",
    "client/src/Pages/RenewalDetails.jsx",
  ];
  for (const rel of files) {
    const content = fs.readFileSync(path.join(repoRoot, rel), "utf8");
    assert.ok(
      content.includes("paymentBasis") || content.includes("formatPaymentBasis"),
      `${rel} references paymentBasis / formatPaymentBasis`
    );
  }
});

console.log(`\n🎉 ALL ${passed} PAYMENT BASIS TESTS PASSED SUCCESSFULLY!`);
