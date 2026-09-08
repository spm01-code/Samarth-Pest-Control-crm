// One Time Job Service Paper HTML Template
// Produces an exact visual replica of FORMAT - ONE TIME JOB.docx

const formatDate = (date) => {
  if (!date) return "";
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsedDate);
};

const formatAmount = (amount) => {
  const value = Number(amount);
  if (Number.isNaN(value)) return "0.00";
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const safeText = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const generateServicePaperHtml = (service, companySettings = null) => {
  const customer = typeof service?.customer === "object" ? service.customer || {} : {};
  const employee = typeof service?.employee === "object" ? service.employee || {} : {};

  // Company settings fallback
  const comp = {
    companyName: companySettings?.companyName || "SAMARTH PEST MANAGEMENT",
    registerOffice:
      companySettings?.registerOffice ||
      "Office No. 102, Balaji, New Vijay CHSL, Near Datta Mandir, Nallasopara (E) - 401209",
    corporateOffice:
      companySettings?.corporateOffice ||
      "Office No. B - 221, Bhaskar Commercial Complex, Near Platform No.1, Virar (w)-401303",
    phone: companySettings?.phone || "8356080548",
    email: companySettings?.email || "samarthpest2022@gmail.com",
    website: companySettings?.website || "samarthpest.com",
    bankName: companySettings?.nonGstBankName || companySettings?.bankName || "HDFC BANK",
    accountNumber:
      companySettings?.nonGstAccountNumber || companySettings?.gstAccountNumber || "50200102548611",
    ifsc: companySettings?.nonGstBankIfsc || companySettings?.ifsc || "HDFC0000051",
    pan: companySettings?.pan || "JCHPM5440Q",
    upiId: companySettings?.upiId || "8356080548@okbizaxis",
  };

  const jobNo = service?.jobNo || service?.jobNumber || "-";
  const customerName = customer.companyName || customer.fullName || "Customer";
  const customerAddress = service?.address || customer.address || "-";
  const contactPerson = service?.contactPerson || customer.contactPerson || customer.fullName || "-";
  const contactNumber = service?.contactNumber || customer.phone || customer.alternatePhone || "-";

  const serviceName = service?.serviceName || "Pest Control";
  const area = service?.area || service?.premisesArea || "-";
  const locationOfPest = service?.locationOfPest || "-";

  const rawFreq = String(service?.frequency || "One Time Job").trim();
  const frequency =
    rawFreq.toLowerCase() === "one-time"
      ? "One Time Job"
      : rawFreq.charAt(0).toUpperCase() + rawFreq.slice(1);

  const serviceCharges = formatAmount(service?.amount);

  // Occurrences
  const occurrences = Array.isArray(service?.serviceOccurrences) ? service.serviceOccurrences : [];
  const occ1 = occurrences[0] || null;
  const occ2 = occurrences[1] || null;
  const occ3 = occurrences[2] || null;

  const resolveOperator = (occ) => {
    if (!occ) return "";
    return occ.operatorName || (typeof occ.employee === "object" ? occ.employee?.fullName : "") || "";
  };

  // 1st Service
  const serviceDate1 = formatDate(occ1?.serviceDate || service?.serviceDate);
  const serviceTime1 = occ1?.serviceTime || service?.serviceTime || "";
  const operatorName1 = resolveOperator(occ1) || employee.fullName || service?.operatorName || "";
  const clientSignature1 = occ1?.clientSignature || service?.clientSignature || "";
  const paymentDetails1 = occ1?.paymentDetails || service?.paymentDetails || "";

  // 2nd Service
  const serviceDate2 = occ2?.serviceDate ? formatDate(occ2.serviceDate) : "";
  const serviceTime2 = occ2?.serviceTime || "";
  const operatorName2 = resolveOperator(occ2);
  const clientSignature2 = occ2?.clientSignature || "";
  const paymentDetails2 = occ2?.paymentDetails || "";

  // 3rd Service
  const serviceDate3 = occ3?.serviceDate ? formatDate(occ3.serviceDate) : "";
  const serviceTime3 = occ3?.serviceTime || "";
  const operatorName3 = resolveOperator(occ3);
  const clientSignature3 = occ3?.clientSignature || "";
  const paymentDetails3 = occ3?.paymentDetails || "";

  const remark = service?.remark || service?.desc || "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${safeText(jobNo)} - Service Paper</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page {
      size: A4 portrait;
      margin: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #111;
      background: #e2e8f0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-bar {
      position: fixed;
      top: 14px;
      right: 18px;
      z-index: 100;
      display: flex;
      gap: 8px;
    }
    .print-btn {
      background: #1e40af;
      color: #fff;
      border: none;
      padding: 10px 18px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .print-btn:hover { background: #1d4ed8; }
    .page-container {
      width: 210mm;
      min-height: 297mm;
      margin: 20px auto;
      background: #fff;
      padding: 7mm 12mm 6mm;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    @media print {
      body { background: #fff; }
      .print-bar { display: none !important; }
      .page-container {
        width: 100% !important;
        min-height: 297mm !important;
        margin: 0 !important;
        padding: 5mm 10mm 4mm !important;
        box-shadow: none !important;
      }
    }

    /* HEADER BANNER */
    .company-banner {
      width: 100%;
      border: 1.5px solid #002147;
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 5px;
    }
    .company-banner img {
      width: 100%;
      display: block;
      height: auto;
    }

    /* MAIN DOCUMENT BOX */
    .doc-box {
      border: 1.5px solid #000;
      margin-bottom: 8px;
    }
    .doc-title {
      text-align: center;
      font-size: 17px;
      font-weight: 800;
      letter-spacing: 0.5px;
      padding: 4px 0;
      border-bottom: 1.5px solid #000;
      background: #fafafa;
    }
    .job-row {
      text-align: right;
      padding: 3px 12px 0;
      font-size: 14px;
      font-weight: 800;
      color: #000;
    }
    .client-info-table {
      width: 100%;
      padding: 2px 12px 8px;
      font-size: 12.5px;
      line-height: 1.35;
    }
    .client-info-table td {
      vertical-align: top;
      padding: 2.5px 0;
    }
    .client-label {
      font-weight: 700;
      width: 130px;
      color: #000;
    }
    .client-colon {
      width: 15px;
      font-weight: 700;
    }
    .client-val {
      font-weight: 600;
      color: #111;
    }

    /* DESCRIPTION SECTION */
    .desc-header {
      text-align: center;
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.5px;
      padding: 3px 0;
      border-top: 1.5px solid #000;
      border-bottom: 1.5px solid #000;
      background: #fff;
    }
    .desc-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .desc-table td {
      border: 1px solid #000;
      padding: 4.5px 8px;
      vertical-align: middle;
    }
    .desc-table .label-col {
      width: 25%;
      font-weight: 700;
      color: #000;
    }
    .desc-table .value-col {
      width: 75%;
      font-weight: 600;
      color: #111;
    }

    /* SERVICE EXECUTION TABLE */
    .service-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: -1px;
      font-size: 12px;
    }
    .service-table th, .service-table td {
      border: 1px solid #000;
      padding: 5px 8px;
      text-align: left;
    }
    .service-table th {
      background: #fff;
      font-weight: 700;
      font-size: 11px;
      text-align: center;
      padding: 5px 4px;
    }
    .col-header-1 { width: 25%; }
    .col-header-2 { width: 27%; }
    .col-header-3 { width: 24%; }
    .col-header-4 { width: 24%; }

    .service-table td.row-label {
      font-weight: 700;
      color: #000;
    }
    .service-table td.cell-center {
      text-align: center;
      font-weight: 600;
    }
    .sig-row td {
      height: 38px;
      vertical-align: middle;
    }
    .remark-row td {
      padding: 6px 8px;
      font-weight: 600;
      min-height: 32px;
    }

    /* FOOTER */
    .footer-section {
      margin-top: 6px;
      font-size: 11px;
      line-height: 1.35;
      color: #002147;
    }
    .payment-notes {
      margin-bottom: 6px;
      padding-left: 14px;
    }
    .payment-notes li {
      margin-bottom: 2px;
    }
    .footer-columns {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 4px;
    }
    .bank-block {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .bank-info {
      font-weight: 700;
      font-size: 10.5px;
      line-height: 1.45;
      color: #000;
    }
    .bank-info .bank-title {
      font-size: 11px;
      margin-bottom: 2px;
    }
    .qr-img {
      width: 65px;
      height: 65px;
      object-fit: contain;
    }
    .regards-block {
      text-align: center;
    }
    .regards-title {
      font-size: 12px;
      font-weight: 700;
      color: #000;
      margin-bottom: 2px;
    }
    .regards-sub {
      font-size: 11px;
      font-weight: 700;
      color: #000;
      margin-bottom: 4px;
    }
    .stamp-img {
      width: 100px;
      height: auto;
      max-height: 55px;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <button class="print-btn" onclick="window.print()">Print Service Paper</button>
  </div>

  <div class="page-container">
    <div>
      <!-- COMPANY HEADER -->
      <div class="company-banner">
        <img src="/spm-banner.jpg" alt="Samarth Pest Management" onerror="this.style.display='none'" />
      </div>

      <!-- MAIN BORDERED DOCUMENT CONTAINER -->
      <div class="doc-box">
        <div class="doc-title">SERVICE PAPER</div>
        
        <div class="job-row">
          ${(() => {
            const raw = safeText(jobNo);
            const clean = raw.replace(/^job\s*no[\.\s\-\/:]*/i, "");
            return clean ? `JOB NO - ${clean}` : "JOB NO - ";
          })()}
        </div>

        <table class="client-info-table">
          <tr>
            <td class="client-label">Client Name</td>
            <td class="client-colon">:</td>
            <td class="client-val">${safeText(customerName)},</td>
          </tr>
          <tr>
            <td class="client-label">Address</td>
            <td class="client-colon">:</td>
            <td class="client-val">${safeText(customerAddress)}.</td>
          </tr>
          <tr>
            <td class="client-label">Contact Person</td>
            <td class="client-colon">:</td>
            <td class="client-val">${safeText(contactPerson)}</td>
          </tr>
          <tr>
            <td class="client-label">Contact Number</td>
            <td class="client-colon">:</td>
            <td class="client-val">${safeText(contactNumber)}</td>
          </tr>
        </table>

        <!-- DESCRIPTION SECTION -->
        <div class="desc-header">DESCRIPTION</div>
        <table class="desc-table">
          <tr>
            <td class="label-col">Type of Service</td>
            <td class="value-col">${safeText(serviceName)}</td>
          </tr>
          <tr>
            <td class="label-col">Premises Area</td>
            <td class="value-col">${safeText(area)}</td>
          </tr>
          <tr>
            <td class="label-col">Location of Pest</td>
            <td class="value-col">${safeText(locationOfPest)}</td>
          </tr>
          <tr>
            <td class="label-col">Service Frequency</td>
            <td class="value-col">${safeText(frequency)}</td>
          </tr>
          <tr>
            <td class="label-col">Service Charges</td>
            <td class="value-col">Rs. ${safeText(serviceCharges)}/--</td>
          </tr>
        </table>

        <!-- SERVICE EXECUTION 3-COLUMN TABLE -->
        <table class="service-table">
          <thead>
            <tr>
              <th class="col-header-1">Service</th>
              <th class="col-header-2">1ST Service / ONE TIME</th>
              <th class="col-header-3">2ND Service / Complaint</th>
              <th class="col-header-4">3RD Service / Complaint</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="row-label">Service Date</td>
              <td class="cell-center">${safeText(serviceDate1)}</td>
              <td class="cell-center">${safeText(serviceDate2)}</td>
              <td class="cell-center">${safeText(serviceDate3)}</td>
            </tr>
            <tr>
              <td class="row-label">Service Time</td>
              <td class="cell-center">${safeText(serviceTime1)}</td>
              <td class="cell-center">${safeText(serviceTime2)}</td>
              <td class="cell-center">${safeText(serviceTime3)}</td>
            </tr>
            <tr>
              <td class="row-label">Operator Name</td>
              <td class="cell-center">${safeText(operatorName1)}</td>
              <td class="cell-center">${safeText(operatorName2)}</td>
              <td class="cell-center">${safeText(operatorName3)}</td>
            </tr>
            <tr class="sig-row">
              <td class="row-label">Client Signature</td>
              <td class="cell-center">${safeText(clientSignature1)}</td>
              <td class="cell-center">${safeText(clientSignature2)}</td>
              <td class="cell-center">${safeText(clientSignature3)}</td>
            </tr>
            <tr>
              <td class="row-label">Payment Details</td>
              <td class="cell-center">${safeText(paymentDetails1)}</td>
              <td class="cell-center">${safeText(paymentDetails2)}</td>
              <td class="cell-center">${safeText(paymentDetails3)}</td>
            </tr>
            <tr class="remark-row">
              <td class="row-label">Remark</td>
              <td colspan="3">${safeText(remark)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="footer-section">
      <ul class="payment-notes">
        <li>Payment can be made via GPAY no. ${safeText(comp.phone)}</li>
        <li>All payments should be made payable to ${safeText(comp.companyName)}.</li>
      </ul>

      <div class="footer-columns">
        <div class="bank-block">
          <div class="bank-info">
            <div class="bank-title">BANK DETAILS:</div>
            <div>BANK NAME - ${safeText(comp.bankName)}</div>
            <div>A/C NO - ${safeText(comp.accountNumber)}</div>
            <div>IFSC CODE - ${safeText(comp.ifsc)}</div>
            <div>PAN NO - ${safeText(comp.pan)}</div>
          </div>
          <img class="qr-img" src="/spm-qr.jpg" alt="UPI QR Code" onerror="this.style.display='none'" />
        </div>

        <div class="regards-block">
          <div class="regards-title">Thanks &amp; Regards</div>
          <div class="regards-sub">For ${safeText(comp.companyName)}</div>
          <img class="stamp-img" src="/spm-stamp.png" alt="Authorized Signature" onerror="this.style.display='none'" />
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
};
