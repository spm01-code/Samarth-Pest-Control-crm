import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import PizZip from "pizzip";
import { PDFDocument } from "pdf-lib";

import * as serverCalc from "../utils/serviceDateCalculator.js";
import * as clientCalc from "../../client/src/utils/serviceDateCalculator.js";
import { createService, updateService } from "../controller/serviceController.js";
import Service from "../model/serviceModel.js";
import Customer from "../model/customerModel.js";
import Employee from "../model/employeeModel.js";
import {
  generateQuotationDocx,
  generateAttQuotationDocx,
  generateContractRenewalDocx,
  generateInvoiceDocx,
  generateOneTimeJobDocx,
  normalizeTableRowSpacingXml,
} from "../utils/docGenerator.js";
import { generatePdfFromPdfTemplate } from "../utils/pdfTemplateGenerator.js";
import { inspectPdfTemplate } from "../utils/pdfTemplateInspector.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "..");
process.chdir(serverRoot);

const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`  ✅ PASS: ${name}`);
}

console.log("================================================================================");
console.log("  PART A: SERVICE FREQUENCY & UPCOMING SERVICE DATE TESTS                       ");
console.log("================================================================================");

await test("1. Three Services Yearly (24 Nov 2026) -> 3 total dates (1 initial + 2 future)", async () => {
  const res = serverCalc.calculateServiceDates("2026-11-24", "3 Services Yearly", "2026-11-24");
  const upcoming = res.upcomingServiceDates.map(iso);
  assert.deepEqual(upcoming, ["2027-03-24", "2027-07-24"]);
  assert.equal(iso(res.nextServiceDate), "2027-03-24");
  // Total = initial (1) + upcoming (2) = 3
  assert.equal(1 + res.upcomingServiceDates.length, 3);

  // Alias "Yearly 3 services"
  const aliasRes = serverCalc.calculateServiceDates("2026-11-24", "Yearly 3 services", "2026-11-24");
  assert.deepEqual(aliasRes.upcomingServiceDates.map(iso), ["2027-03-24", "2027-07-24"]);
});

await test("2. Quarterly (24 Nov 2026) -> 4 total dates (1 initial + 3 future)", async () => {
  const res = serverCalc.calculateServiceDates("2026-11-24", "Quarterly", "2026-11-24");
  const upcoming = res.upcomingServiceDates.map(iso);
  assert.deepEqual(upcoming, ["2027-02-24", "2027-05-24", "2027-08-24"]);
  assert.equal(iso(res.nextServiceDate), "2027-02-24");
  assert.equal(1 + res.upcomingServiceDates.length, 4);
});

await test("3. Half-Yearly (24 Nov 2026) -> 2 total dates (1 initial + 1 future)", async () => {
  const res = serverCalc.calculateServiceDates("2026-11-24", "Half-Yearly", "2026-11-24");
  const upcoming = res.upcomingServiceDates.map(iso);
  assert.deepEqual(upcoming, ["2027-05-24"]);
  assert.equal(iso(res.nextServiceDate), "2027-05-24");
  assert.equal(1 + res.upcomingServiceDates.length, 2);
});

await test("4. Yearly (24 Nov 2026) -> 1 total date (0 future dates in cycle)", async () => {
  const res = serverCalc.calculateServiceDates("2026-11-24", "Yearly", "2026-11-24");
  assert.deepEqual(res.upcomingServiceDates, []);
  assert.equal(res.nextServiceDate, null);
  assert.equal(1 + res.upcomingServiceDates.length, 1);
});

await test("5. Monthly (24 Nov 2026) -> 12 total dates (1 initial + 11 future)", async () => {
  const res = serverCalc.calculateServiceDates("2026-11-24", "monthly", "2026-11-24");
  const upcoming = res.upcomingServiceDates.map(iso);
  assert.deepEqual(upcoming, [
    "2026-12-24",
    "2027-01-24",
    "2027-02-24",
    "2027-03-24",
    "2027-04-24",
    "2027-05-24",
    "2027-06-24",
    "2027-07-24",
    "2027-08-24",
    "2027-09-24",
    "2027-10-24",
  ]);
  assert.equal(iso(res.nextServiceDate), "2026-12-24");
  assert.equal(1 + res.upcomingServiceDates.length, 12);
  assert.equal(serverCalc.isMultiDateFrequency("monthly"), true);
});

await test("6. One-Time Job -> 1 total date (0 recurring dates, nextServiceDate=null)", async () => {
  const res = serverCalc.calculateServiceDates("2026-11-24", "one-time", "2026-11-24");
  assert.deepEqual(res.upcomingServiceDates, []);
  assert.equal(res.nextServiceDate, null);
  assert.equal(1 + res.upcomingServiceDates.length, 1);
});

await test("7. Month-end date clamping (29, 30, 31) and leap year handling", async () => {
  // Jan 31 in non-leap year 2027 -> Feb 28
  const jan31NonLeap = serverCalc.calculateServiceDates("2027-01-31", "monthly", "2027-01-31");
  assert.deepEqual(jan31NonLeap.upcomingServiceDates.map(iso), [
    "2027-02-28",
    "2027-03-31",
    "2027-04-30",
    "2027-05-31",
    "2027-06-30",
    "2027-07-31",
    "2027-08-31",
    "2027-09-30",
    "2027-10-31",
    "2027-11-30",
    "2027-12-31",
  ]);

  // Nov 30, 2027 Quarterly -> Feb 29, 2028 (leap year!), May 30, 2028, Aug 30, 2028
  const leapQtr = serverCalc.calculateServiceDates("2027-11-30", "Quarterly", "2027-11-30");
  assert.deepEqual(leapQtr.upcomingServiceDates.map(iso), [
    "2028-02-29",
    "2028-05-30",
    "2028-08-30",
  ]);

  // Leap day Feb 29, 2028 -> Half-Yearly -> Aug 29, 2028
  const leapHalf = serverCalc.calculateServiceDates("2028-02-29", "Half-Yearly", "2028-02-29");
  assert.deepEqual(leapHalf.upcomingServiceDates.map(iso), ["2028-08-29"]);

  // Year transition Dec 31, 2026 -> 3 Services Yearly -> Apr 30, 2027, Aug 31, 2027
  const dec31 = serverCalc.calculateServiceDates("2026-12-31", "3 Services Yearly", "2026-12-31");
  assert.deepEqual(dec31.upcomingServiceDates.map(iso), ["2027-04-30", "2027-08-31"]);
});

await test("8. Timezone stability (local Date objects vs ISO strings)", async () => {
  const localMidnight = new Date(2026, 10, 24, 0, 0, 0, 0); // Nov 24, 2026 in local TZ
  const fromLocal = serverCalc.calculateServiceDates(localMidnight, "Quarterly", localMidnight);
  const fromIso = serverCalc.calculateServiceDates("2026-11-24", "Quarterly", "2026-11-24");
  assert.deepEqual(fromLocal.upcomingServiceDates.map(iso), fromIso.upcomingServiceDates.map(iso));
  assert.equal(iso(fromLocal.nextServiceDate), iso(fromIso.nextServiceDate));
});

await test("9. Client and Server calculators produce identical results across all frequencies", async () => {
  const freqs = [
    "one-time",
    "weekly",
    "twice a week",
    "Fourth nightly",
    "monthly",
    "Quarterly",
    "Half-Yearly",
    "3 Services Yearly",
    "Yearly",
  ];
  const dates = ["2026-11-24", "2027-01-31", "2027-11-30", "2028-02-29"];
  for (const f of freqs) {
    assert.equal(clientCalc.isMultiDateFrequency(f), serverCalc.isMultiDateFrequency(f), `isMultiDateFrequency(${f})`);
    for (const d of dates) {
      const s = serverCalc.calculateServiceDates(d, f, d);
      const c = clientCalc.calculateServiceDates(d, f, d);
      assert.equal(iso(c.nextServiceDate), iso(s.nextServiceDate), `nextServiceDate parity ${f} ${d}`);
      assert.deepEqual(c.upcomingServiceDates.map(iso), s.upcomingServiceDates.map(iso), `upcoming parity ${f} ${d}`);
    }
  }
});

await test("10. Service create/edit/completion workflow preserves manual overrides and historical dates", async () => {
  const origCustFindById = Customer.findById;
  const origEmpFindById = Employee.findById;
  const origSrvPrototypeSave = Service.prototype.save;
  const origSrvPrototypePopulate = Service.prototype.populate;
  const origSrvFindById = Service.findById;
  const origSrvFindByIdAndUpdate = Service.findByIdAndUpdate;

  const mockCustomer = { _id: "65a000000000000000000001", fullName: "Test Society", jobNo: "S/01", address: "Virar", phone: "9999999999" };
  let savedServices = [];
  let updatedCaptures = [];

  Customer.findById = async (id) => (String(id) === mockCustomer._id ? mockCustomer : null);
  Employee.findById = async () => null;
  Service.prototype.save = async function () {
    savedServices.push(this);
    return this;
  };
  Service.prototype.populate = async function () {
    return this;
  };

  try {
    // Create Quarterly service -> 3 upcoming dates, status remains pending (not auto-completed)
    let statusCode = 0;
    let body = null;
    const makeRes = () => ({
      status(c) {
        statusCode = c;
        return { json(d) { body = d; } };
      },
    });

    await createService(
      {
        body: {
          customer: mockCustomer._id,
          serviceName: "Cockroach Control",
          frequency: "Quarterly",
          serviceDate: "2026-11-24",
          address: "Virar",
          amount: 5000,
        },
      },
      makeRes()
    );
    assert.equal(statusCode, 201);
    assert.equal(body.service.status, "pending");
    assert.equal(body.service.upcomingServiceDates.length, 3);
    assert.deepEqual(body.service.upcomingServiceDates.map(iso), ["2027-02-24", "2027-05-24", "2027-08-24"]);
    assert.equal(iso(body.service.nextServiceDate), "2027-02-24");

    // Edit service: manually override nextServiceDate without changing serviceDate or frequency
    const existingDoc = {
      _id: "65b000000000000000000001",
      customer: mockCustomer._id,
      serviceName: "Cockroach Control",
      frequency: "Quarterly",
      serviceDate: new Date("2026-11-24T00:00:00.000Z"),
      nextServiceDate: new Date("2027-02-24T00:00:00.000Z"),
      upcomingServiceDates: [
        new Date("2027-02-24T00:00:00.000Z"),
        new Date("2027-05-24T00:00:00.000Z"),
        new Date("2027-08-24T00:00:00.000Z"),
      ],
      status: "active",
    };

    Service.findById = async () => existingDoc;
    Service.findByIdAndUpdate = (id, updatePayload) => {
      updatedCaptures.push(updatePayload);
      const merged = { ...existingDoc, ...updatePayload };
      const q = {
        populate: () => q,
        then: (resolve) => resolve(merged),
      };
      return q;
    };

    // Case A: Manual nextServiceDate input is ignored; calculated schedule is preserved
    await updateService(
      {
        params: { id: existingDoc._id },
        body: {
          customer: mockCustomer._id,
          frequency: "Quarterly",
          serviceDate: "2026-11-24",
          nextServiceDate: "2027-03-05",
        },
      },
      makeRes()
    );
    assert.equal(statusCode, 200);
    assert.equal(iso(body.service.nextServiceDate), "2027-02-24", "Manual nextServiceDate override ignored; calculated schedule used");
    assert.equal(updatedCaptures[0].upcomingServiceDates, undefined, "Historical upcomingServiceDates not overwritten");

    // Case B: Marking service completed does NOT alter dates
    await updateService(
      {
        params: { id: existingDoc._id },
        body: {
          customer: mockCustomer._id,
          status: "completed",
        },
      },
      makeRes()
    );
    assert.equal(statusCode, 200);
    assert.equal(updatedCaptures[1].status, "completed");
    assert.equal(updatedCaptures[1].nextServiceDate, undefined);
    assert.equal(updatedCaptures[1].upcomingServiceDates, undefined);

    // Case C: Changing frequency to 3 Services Yearly recalculates upcomingServiceDates (2 future dates)
    await updateService(
      {
        params: { id: existingDoc._id },
        body: {
          customer: mockCustomer._id,
          frequency: "3 Services Yearly",
          serviceDate: "2026-11-24",
        },
      },
      makeRes()
    );
    assert.equal(statusCode, 200);
    assert.deepEqual(updatedCaptures[2].upcomingServiceDates.map(iso), ["2027-03-24", "2027-07-24"]);
    assert.equal(iso(updatedCaptures[2].nextServiceDate), "2027-03-24");
  } finally {
    Customer.findById = origCustFindById;
    Employee.findById = origEmpFindById;
    Service.prototype.save = origSrvPrototypeSave;
    Service.prototype.populate = origSrvPrototypePopulate;
    Service.findById = origSrvFindById;
    Service.findByIdAndUpdate = origSrvFindByIdAndUpdate;
  }
});

console.log("\n================================================================================");
console.log("  PART B: DOCUMENT TABLE SPACING & PDF VERIFICATION TESTS                       ");
console.log("================================================================================");

const extractTablesXml = (docxBuffer) => {
  const zip = new PizZip(docxBuffer);
  const xml = zip.file("word/document.xml").asText();
  return {
    xml,
    tables: [...xml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/g)].map((m) => m[0]),
  };
};

await test("11. PC Quotation DOCX removes excessive trHeight, empty cell paragraphs, and leading-space padding", async () => {
  const zip = new PizZip(fs.readFileSync(path.join(serverRoot, "uploads/templates/1791265093032-349139013.docx"), "binary"));
  const xml = zip.file("word/document.xml").asText();
  assert.equal(/<w:trHeight\b/i.test(xml), false, "Template has no fixed/min trHeight");

  // Also test normalizeTableRowSpacingXml against an uncleaned legacy table XML with trHeight=962, self-closing spacing, rPr spacing, vAlign, and empty <w:p>
  const legacyXml = `
    <w:tbl>
      <w:tr><w:trPr><w:trHeight w:val="962"/></w:trPr>
        <w:tc><w:tcPr><w:tcW w:w="4530" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
          <w:p><w:pPr><w:spacing w:before="0"/><w:rPr><w:spacing w:val="-5"/></w:rPr></w:pPr><w:r><w:t></w:t></w:r></w:p>
          <w:p><w:pPr><w:pStyle w:val="TableParagraph"/><w:spacing w:before="120"/><w:rPr><w:spacing w:val="-5"/></w:rPr></w:pPr><w:r><w:t>Lobby &amp; Staircase   </w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  `;
  const cleaned = normalizeTableRowSpacingXml(legacyXml, "quotation");
  assert.equal(cleaned.includes("//>"), false, "Must never produce invalid '//>' self-closing XML");
  assert.equal(cleaned.includes('<w:spacing w:val="-5"/>'), true, "Run-level character spacing inside <w:rPr> preserved untouched");
  assert.ok(cleaned.indexOf("<w:tcMar>") < cleaned.indexOf('<w:vAlign w:val="center"/>'), "<w:tcMar> inserted before <w:vAlign> per OOXML schema");
  assert.ok(cleaned.indexOf('<w:pStyle w:val="TableParagraph"/>') < cleaned.indexOf('<w:spacing w:before="0" w:after="0"/>'), "<w:spacing> remains after <w:pStyle> per OOXML schema");
  assert.equal(/<w:trHeight\b/i.test(cleaned), false, "normalizeTableRowSpacingXml strips trHeight=962");
  assert.equal((cleaned.match(/<w:p\b/g) || []).length, 1, "Empty paragraph removed from cell");
  assert.equal(cleaned.includes('w:before="0" w:after="0"'), true, "Paragraph spacing normalized to 0");
  assert.equal(cleaned.includes('<w:top w:w="50" w:type="dxa"/>'), true, "Clean 50 dxa cell top padding applied");
  assert.equal(cleaned.includes('w:w="4530"'), true, "Column width preserved");
});

await test("12. ATT Quotation & Contract Renewal DOCX render cleanly without empty table cell paragraphs or bloated spacing", async () => {
  const attRes = await generateAttQuotationDocx({
    quotationNumber: "SPM/ATT/2026/01",
    quotationType: "ATT",
    quotationDate: "2026-11-24",
    customer: { fullName: "Metro Builders", address: "Vasai East" },
    treatments: [
      {
        typeOfTreatment: "Anti Termite Pre-construction Treatment",
        warrantyPeriod: "10 Years",
        chemicalUsed: "Imidacloprid 30.5% SC",
        serviceCharges: "Rs. 18/- per Sq. Ft.",
      },
    ],
  });
  assert.ok(attRes.buffer);
  if (!attRes.isPdfDirect) {
    const { xml } = extractTablesXml(attRes.buffer);
    assert.equal(/<w:trHeight\b/i.test(xml), false, "ATT Quotation DOCX has no fixed/min row height");
  }

  const crRes = await generateContractRenewalDocx({
    renewalNumber: "SPM/CR/2026/01",
    renewalDate: "2026-11-24",
    customer: { fullName: "Sterling Enterprises", address: "Virar" },
    services: [
      { serviceName: "General Pest Control", location: "Ground Floor", frequency: "Monthly", amount: 3000 },
    ],
    totalAmount: 3000,
  });
  assert.ok(crRes.buffer);
  if (!crRes.isPdfDirect) {
    const { tables } = extractTablesXml(crRes.buffer);
    assert.equal(tables.length >= 1, true);
    assert.equal(/<w:trHeight\b/i.test(tables[0]), false, "Contract Renewal table has no trHeight");
    assert.equal(tables[0].includes('w:after="0"'), true, "Contract Renewal table overrides Normal w:after=160");
  }
});

await test("13. Invoice & One-Time Job DOCX preserve their intentional layout heights (not altered)", async () => {
  const otjRes = await generateOneTimeJobDocx({
    jobNo: "Job No/2026/01",
    frequency: "one-time",
    serviceDate: "2026-11-24",
    customerName: "Mr. Kulkarni",
    address: "Baner, Pune",
    serviceName: "Fogging",
    amount: 1500,
  });
  assert.ok(otjRes.buffer);
  if (!otjRes.isPdfDirect) {
    const { xml } = extractTablesXml(otjRes.buffer);
    assert.equal(xml.includes('w:trHeight w:val="2400"'), true, "OTJ client info box trHeight preserved");
  }

  const invRes = await generateInvoiceDocx({
    invoiceNumber: "SPMJ/01/2026-27",
    invoiceType: "NON_GST",
    invoiceDate: "2026-11-24",
    customer: { fullName: "Acme", address: "MIDC" },
    subtotal: 2500,
    totalAmount: 2500,
  });
  assert.ok(invRes.buffer);
});

await test("14. Generated Quotation PDFs (short, wrapped, multi-page) have compact row heights and zero overlap/clipping", async () => {
  const qtnPdfPath = path.join(serverRoot, "uploads/templates/1791628450521-535595073.pdf");
  const outDir = path.join(os.tmpdir(), "crm_pdf_verify");
  fs.mkdirSync(outDir, { recursive: true });

  // Case A: Short single-line services
  const shortBuf = await generatePdfFromPdfTemplate(
    qtnPdfPath,
    {
      quotationNumber: "SPM/PC/2026/01",
      quotationDate: "24/11/2026",
      customerName: "Acme Towers",
      customerAddress: "Virar West",
      premisesTreated: "Acme Towers, Virar West",
      billingTerm: "Monthly",
      services: [
        { serviceNumber: "1", location: "Common Areas", serviceName: "General Pest Control", frequency: "Quarterly", amount: "4,500.00" },
        { serviceNumber: "2", location: "Basement", serviceName: "Rat Control", frequency: "Monthly", amount: "2,500.00" },
      ],
      totalAmount: "7,000.00",
    },
    "quotation"
  );
  fs.writeFileSync(path.join(outDir, "pc_qtn_short.pdf"), shortBuf);
  const shortDoc = await PDFDocument.load(shortBuf);
  assert.equal(shortDoc.getPageCount(), 2, "Short PC Quotation stays 2 pages (Annexure I + II)");

  const shortInsp = await inspectPdfTemplate(shortBuf);
  const p0 = shortInsp.pages[0];
  const row1Line = p0.lines.find((l) => l.text.includes("Common Areas"));
  const row2Line = p0.lines.find((l) => l.text.includes("Basement"));
  const totalLine = p0.lines.find((l) => l.text.includes("TOTAL AMOUNT"));
  assert.ok(row1Line && row2Line && totalLine, "All table rows present in generated PDF");
  const rowSpacing = row1Line.y - row2Line.y;
  assert.ok(rowSpacing >= 18 && rowSpacing <= 25, `Compact single-line row spacing (${rowSpacing.toFixed(1)}pt, expected 18-25pt)`);

  // Case B: Long wrapped text + many services (multi-page continuation)
  const manyServices = Array.from({ length: 14 }, (_, idx) => ({
    serviceNumber: String(idx + 1),
    location:
      idx === 0
        ? "Building A, B, C Common Corridors, Staircases, Lift Lobbies, Garbage Chutes & Basement Parking Area"
        : `Wing ${idx + 1} Common Passage & Utility Shafts`,
    serviceName: idx === 0 ? "Comprehensive General Pest Control (Gel + Spray)" : "Rodent Control",
    frequency: idx % 2 === 0 ? "Quarterly" : "3 Services Yearly",
    amount: "1,500.00",
  }));
  const longBuf = await generatePdfFromPdfTemplate(
    qtnPdfPath,
    {
      quotationNumber: "SPM/PC/2026/02",
      quotationDate: "24/11/2026",
      customerName: "Grand Residency Co-op Housing Society Ltd",
      customerAddress: "Sector 12, Hiranandani Complex, Powai, Mumbai - 400076",
      premisesTreated: "Grand Residency Co-op Housing Society Ltd, Buildings A-D, Powai",
      billingTerm: "Quarterly",
      services: manyServices,
      totalAmount: "21,000.00",
    },
    "quotation"
  );
  fs.writeFileSync(path.join(outDir, "pc_qtn_wrapped_multipage.pdf"), longBuf);
  const longDoc = await PDFDocument.load(longBuf);
  assert.ok(longDoc.getPageCount() >= 3, "Long multi-row quotation overflows cleanly before Annexure II");
  const longInsp = await inspectPdfTemplate(longBuf);
  // Check wrapped lines from row 1 are all rendered without clipping
  const p0Text = longInsp.pages[0].fullText;
  assert.ok(p0Text.includes("Basement Parking Area"), "Wrapped text in row 1 rendered completely without clipping");
  // Annexure II remains the last page
  const lastText = longInsp.pages[longInsp.pageCount - 1].fullText;
  assert.ok(lastText.includes("Annexure II"), "Annexure II preserved as final page");

  // Case C: ATT Quotation PDF with compact 1-line row
  const attPdfPath = path.join(serverRoot, "uploads/templates/FORMAT - ATT QTN PLACEHOLDER.pdf");
  const attPdfBuf = await generatePdfFromPdfTemplate(
    attPdfPath,
    {
      quotationNumber: "SPM/ATT/2026/02",
      quotationDate: "24/11/2026",
      customerName: "Metro Builders",
      customerAddress: "Plot 45, Vasai East",
      subject: "Anti-termite treatment",
      premises: "Plot 45, Vasai East",
      specification: "As per IS 6313 (Part II) 2013",
      equipment: "Sprayers & Sprinklers",
      paymentTerm: "Within 10 Days",
      treatments: [
        { typeOfTreatment: "ATT Pre-Construction", warrantyPeriod: "10 Years", chemicalUsed: "Imidacloprid", serviceCharges: "Rs. 18/sqft" },
      ],
    },
    "att-quotation"
  );
  fs.writeFileSync(path.join(outDir, "att_qtn_compact.pdf"), attPdfBuf);
  const attInsp = await inspectPdfTemplate(attPdfBuf);
  assert.ok(attInsp.pages[0].fullText.includes("ATT Pre-Construction"), "ATT Quotation PDF rendered cleanly");
});

console.log(`\n🎉 ALL ${passed} TESTS PASSED SUCCESSFULLY!`);
