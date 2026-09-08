// Shared Invoice Template Utility for Samarth Pest Management
// Renders both GST and NON-GST invoices to match the client references exactly.

const formatDate = (date) => {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatAmount = (amount) => {
  return Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const getBillingPeriod = (invoiceDate) => {
  if (!invoiceDate) return "-";
  const date = new Date(invoiceDate);
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  const formatDateString = (d) => {
    const day = String(d.getDate()).padStart(2, "0");
    const month = d.toLocaleDateString("en-GB", { month: "long" }).toUpperCase();
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  };

  return `${formatDateString(start)} to ${formatDateString(end)}`;
};

const numberToWords = (amount) => {
  const ones = [
    "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN",
    "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"
  ];
  const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

  const belowHundred = (num) => {
    if (num < 20) return ones[num];
    return (tens[Math.floor(num / 10)] + " " + ones[num % 10]).trim();
  };

  const belowThousand = (num) => {
    const hundred = Math.floor(num / 100);
    const remainder = num % 100;
    return [hundred ? belowHundred(hundred) + " HUNDRED" : "", remainder ? belowHundred(remainder) : ""]
      .filter(Boolean)
      .join(" ");
  };

  const convertInt = (num) => {
    if (num === 0) return "ZERO";
    const parts = [
      [Math.floor(num / 10000000), "CRORE"],
      [Math.floor((num % 10000000) / 100000), "LAKH"],
      [Math.floor((num % 100000) / 1000), "THOUSAND"],
      [num % 1000, ""]
    ];
    return parts
      .filter(([val]) => val)
      .map(([val, label]) => (belowThousand(val) + (label ? " " + label : "")).trim())
      .join(" ");
  };

  const cleanAmount = Number(amount) || 0;
  const rupees = Math.floor(cleanAmount);
  const paise = Math.round((cleanAmount - rupees) * 100);

  let words = `RUPEES ${convertInt(rupees)}`;
  if (paise > 0) {
    words += ` AND PAISA ${belowHundred(paise)}`;
  }
  words += " ONLY";
  return words;
};

export const generateInvoiceHtml = (invoice, isGstInvoice, companySettings = null) => {
  // 1. Resolve Settings (using localStorage structure fallback to real client defaults)
  const defaults = {
    companyName: "SAMARTH PEST MANAGEMENT",
    regOffice: "Office No. 102, Balaji, New Vijay CHSL, Near Datta Mandir, Nallasopara (E) - 401209",
    corpOffice: "Office No. B - 221, Bhaskar Commercial Complex, Near Platform No. 1, Virar (w)-401303",
    phone: "8356080548",
    email: "samarthpest2022@gmail.com",
    website: "samarthpest.com",
    companyGstin: "27BDMPM1204J1ZL",
    gstBankName: "HDFC BANK",
    gstBankAccount: "50200095291619",
    gstBankIfsc: "HDFC0000051",
    nongstBankName: "HDFC BANK",
    nongstBankAccount: "50200102548611",
    nongstBankIfsc: "HDFC0000051",
    pan: "JCHPM5440Q",
    upiId: "8356080548@okbizaxis"
  };

  const settings = {
    companyName: companySettings?.companyName || defaults.companyName,
    regOffice: companySettings?.companyAddressReg || companySettings?.regOffice || defaults.regOffice,
    corpOffice: companySettings?.companyAddress || companySettings?.corpOffice || defaults.corpOffice,
    phone: companySettings?.companyPhone || defaults.phone,
    email: companySettings?.companyEmail || defaults.email,
    website: companySettings?.companyWebsite || defaults.website,
    companyGstin: companySettings?.companyTaxId || defaults.companyGstin,
    gstBankName: companySettings?.gstBankName || defaults.gstBankName,
    gstBankAccount: companySettings?.gstBankAccount || defaults.gstBankAccount,
    gstBankIfsc: companySettings?.gstBankIfsc || defaults.gstBankIfsc,
    nongstBankName: companySettings?.nongstBankName || defaults.nongstBankName,
    nongstBankAccount: companySettings?.nongstBankAccount || defaults.nongstBankAccount,
    nongstBankIfsc: companySettings?.nongstBankIfsc || defaults.nongstBankIfsc,
    pan: companySettings?.pan || defaults.pan,
    upiId: companySettings?.upiId || defaults.upiId
  };

  // 2. Resolve Invoice Fields
  const customerName = invoice.customer?.companyName || invoice.customer?.fullName || "-";
  const customerAddress = invoice.customer?.address || "-";
  
  // Periods
  const calculatedPeriod = getBillingPeriod(invoice.invoiceDate);
  const billingPeriod = invoice.billingPeriod || calculatedPeriod;
  const contractPeriod = invoice.contractPeriod || calculatedPeriod;

  // HSN, SAC, Work Order
  const hsnCode = invoice.hsnCode || "";
  const sacCode = invoice.sacCode || "";
  const workOrderNumber = invoice.workOrderNumber || "";
  const workOrderDate = invoice.workOrderDate ? formatDate(invoice.workOrderDate) : "";

  // GST Number & Code
  const gstNumber = invoice.gstNumber || "";
  let gstCode = "";
  if (gstNumber && gstNumber.length >= 2) {
    gstCode = gstNumber.substring(0, 2);
  } else {
    gstCode = "-";
  }

  // Amounts
  const subtotal = invoice.subtotal || 0;
  const total = isGstInvoice ? (invoice.totalAmount || subtotal) : subtotal;
  const amountWords = invoice.amountInWords || numberToWords(total);

  // QR Code URL (Only for Non-GST if UPI ID is configured)
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(
    `upi://pay?pa=${settings.upiId}&pn=${encodeURIComponent(settings.companyName)}&am=${total.toFixed(2)}&cu=INR`
  )}`;

  // Inline SVG icons
  const phoneSvg = `<svg viewBox="0 0 24 24" class="icon-svg"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>`;
  const emailSvg = `<svg viewBox="0 0 24 24" class="icon-svg"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`;
  const webSvg = `<svg viewBox="0 0 24 24" class="icon-svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.53c-.26-.81-1-1.4-1.9-1.4h-1v-3c0-.55-.45-1-1-1h-6v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`;
  const pinSvg = `<svg viewBox="0 0 24 24" class="pin-svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;
  const keySvg = `<svg viewBox="0 0 24 24" class="gst-icon-svg"><path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 15H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V8h10v2z"/></svg>`;

  return `
    <style>
      /* Print Geometry Configuration */
      .invoice-container {
        font-family: Calibri, Arial, Helvetica, sans-serif;
        color: #000;
        background: #fff;
        width: 210mm;
        min-height: 297mm;
        box-sizing: border-box;
        padding: 10mm 12mm 10mm 12mm;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        font-size: 11pt;
        line-height: 1.35;
      }

      /* Header Section */
      .header-table {
        width: 100%;
        border-collapse: collapse;
        border: 2px solid #000;
        table-layout: fixed;
      }
      .header-table td {
        border: 2px solid #000;
        padding: 6px 10px;
        vertical-align: middle;
        box-sizing: border-box;
      }
      .logo-cell {
        width: 120px;
        text-align: center;
      }
      .logo-cell img {
        width: 90px;
        height: auto;
      }
      .header-details-cell {
        text-align: center;
      }
      .company-name {
        color: #0034B5;
        font-size: 21pt;
        font-weight: bold;
        margin: 0 0 6px 0;
        text-align: center;
      }
      .offices-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        font-size: 8.5pt;
        line-height: 1.35;
        text-align: left;
      }
      .office-box-col {
        padding: 0 5px;
      }
      .office-title-line {
        color: #0034B5;
        font-weight: bold;
        margin-bottom: 2px;
        display: flex;
        align-items: center;
      }
      .office-address-text {
        font-weight: normal;
      }
      .pin-svg {
        width: 10px;
        height: 10px;
        fill: #0034B5;
        margin-right: 4px;
      }

      /* Contact Strip */
      .contact-strip {
        border: 2px solid #000;
        border-top: none;
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        padding: 5px 0;
        font-size: 9.5pt;
        font-weight: bold;
      }
      .contact-item {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      .icon-circle {
        width: 17px;
        height: 17px;
        border-radius: 50%;
        background-color: #0034B5;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .icon-svg {
        width: 9px;
        height: 9px;
        fill: #fff;
      }

      /* Title Strip */
      .title-strip {
        border: 2px solid #000;
        border-top: none;
        padding: 6px 0;
        text-align: center;
        font-size: 13pt;
        font-weight: bold;
      }
      .title-strip-gst {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
      }
      .gstin-right {
        text-align: right;
        padding-right: 15px;
        font-size: 10.5pt;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: flex-end;
      }
      .gst-icon-svg {
        width: 13px;
        height: 13px;
        fill: #0034B5;
        margin-right: 5px;
      }

      /* Customer details + Metadata table */
      .details-table {
        width: 100%;
        border-collapse: collapse;
        border: 2px solid #000;
        border-top: none;
        table-layout: fixed;
      }
      .details-table td {
        border: 2px solid #000;
        padding: 6px 10px;
        vertical-align: top;
        box-sizing: border-box;
      }
      .customer-cell {
        width: 68%;
      }
      .customer-to {
        font-weight: bold;
        font-size: 11pt;
        margin-bottom: 2px;
      }
      .customer-details-block {
        margin-left: 20px;
        font-weight: bold;
      }
      .customer-name {
        text-transform: uppercase;
        margin-bottom: 3px;
      }
      .customer-address-text {
        font-weight: normal;
        white-space: pre-wrap;
        line-height: 1.3;
      }
      
      /* GST details aligned customer-side */
      .customer-gst-block {
        margin-left: 20px;
        margin-top: 10px;
        font-weight: bold;
      }
      .gst-row {
        display: flex;
        margin-bottom: 2px;
      }
      .gst-label {
        width: 60px;
        flex-shrink: 0;
      }
      .gst-sep {
        width: 15px;
        flex-shrink: 0;
      }
      .gst-val {
        flex-grow: 1;
      }

      /* Metadata cell layout */
      .invoice-cell {
        width: 32%;
        font-size: 9pt;
        line-height: 1.3;
        font-weight: bold;
      }
      .meta-row {
        display: flex;
        margin-bottom: 3px;
      }
      .meta-label {
        width: 95px;
        flex-shrink: 0;
      }
      .meta-separator {
        width: 10px;
        flex-shrink: 0;
      }
      .meta-value {
        flex-grow: 1;
      }

      /* GST specific subsplit */
      .hsn-sac-split-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        border-top: 2px solid #000;
        border-bottom: 2px solid #000;
        margin-left: -10px; /* Offset cell padding */
        margin-right: -10px;
        margin-top: 4px;
        margin-bottom: 4px;
        font-weight: bold;
      }
      .hsn-sac-col {
        padding: 4px 0;
        text-align: center;
      }
      .hsn-sac-col:first-child {
        border-right: 2px solid #000;
      }

      /* Main particulars & amount table */
      .invoice-table {
        width: 100%;
        border-collapse: collapse;
        border: 2px solid #000;
        border-top: none;
        table-layout: fixed;
      }
      .invoice-table th, .invoice-table td {
        border: 2px solid #000;
        padding: 6px 10px;
        vertical-align: top;
        box-sizing: border-box;
      }
      .table-header-cell {
        text-align: center;
        font-weight: bold;
        font-size: 11pt;
        padding: 5px 0;
        border-top: none !important;
      }
      .particulars-cell {
        width: 68%;
        height: 380px; /* Acts as minimum height */
        text-align: left;
      }
      .amount-cell {
        width: 32%;
        height: 380px;
        text-align: right;
        font-weight: bold;
      }
      .particulars-lead {
        margin-bottom: 15px;
      }

      /* Label-Value Grid inside Particulars cell */
      .field-row {
        display: flex;
        margin-bottom: 8px;
      }
      .field-label {
        width: 160px;
        font-weight: bold;
        flex-shrink: 0;
      }
      .field-value {
        flex-grow: 1;
        white-space: pre-wrap;
      }
      
      .services-list {
        margin-left: 160px;
        margin-top: 5px;
        line-height: 1.35;
      }
      .service-item-row {
        margin-bottom: 3px;
      }
      .service-total-row {
        margin-top: 8px;
        font-weight: bold;
      }

      .hsn-sac-nongst {
        font-size: 9.5pt;
        font-weight: bold;
        margin-top: 15px;
      }
      .hsn-sac-nongst p {
        margin: 2px 0;
      }

      .base-amount-display {
        margin-top: 100px;
      }

      /* CGST/SGST/IGST tax rows */
      .tax-row td {
        padding: 4px 10px;
        font-weight: bold;
      }
      .tax-label-cell {
        text-align: right;
        border-top: none;
      }
      .tax-value-cell {
        text-align: right;
        border-top: none;
      }

      /* Bottom total row */
      .total-row td {
        font-weight: bold;
        padding: 6px 10px;
      }
      .words-cell {
        font-size: 8.5pt;
      }
      .words-wrapper {
        display: flex;
        align-items: center;
      }
      .total-amount-cell {
        text-align: right;
        font-size: 11pt;
      }

      /* Footer block */
      .footer-wrap {
        margin-top: 10px;
      }
      .bullets-list {
        margin: 0 0 10px 0;
        padding-left: 15px;
        font-size: 9.5pt;
        color: #002060;
        font-weight: bold;
        line-height: 1.4;
      }
      .bullets-list li {
        margin-bottom: 2px;
      }

      .footer-table {
        width: 100%;
        border-collapse: collapse;
        border: none;
        table-layout: fixed;
      }
      .footer-table td {
        border: none;
        padding: 0;
        vertical-align: bottom;
      }
      .footer-bank-cell {
        width: 60%;
        text-align: left;
      }
      .footer-signature-cell {
        width: 40%;
        text-align: center;
      }
      
      .bank-block {
        font-size: 9.5pt;
        font-weight: bold;
      }
      .bank-title {
        color: #000;
        margin-bottom: 4px;
      }
      .bank-details-lines {
        margin-left: 45px;
        font-style: italic;
        line-height: 1.35;
        font-family: Arial, sans-serif;
      }
      .qr-and-bank {
        display: flex;
        align-items: center;
        gap: 15px;
      }
      .qr-code-img {
        width: 80px;
        height: 80px;
        border: 1px solid #ccc;
        padding: 2px;
      }

      .signature-block {
        display: inline-block;
        text-align: center;
        width: 100%;
      }
      .thanks-regards {
        font-family: "Segoe Script", "Segoe Print", "Brush Script MT", cursive;
        font-size: 11pt;
        margin-bottom: 2px;
      }
      .signature-for {
        font-weight: bold;
        font-size: 9.5pt;
      }
      .signature-img-box {
        margin-top: 5px;
      }
      .signature-img-box img {
        height: 55px;
        width: auto;
        object-fit: contain;
      }

      /* Print Overrides */
      @page {
        size: A4;
        margin: 0;
      }
      @media print {
        body {
          background: #fff;
          margin: 0;
          padding: 0;
        }
        .invoice-container {
          box-shadow: none;
          margin: 0;
          padding: 10mm 12mm;
        }
        button, .no-print {
          display: none !important;
        }
      }
    </style>

    <div class="invoice-container">
      <!-- 1. Header Grid -->
      <div>
        <table class="header-table">
          <colgroup>
            <col style="width: 120px;" />
            <col style="width: auto;" />
          </colgroup>
          <tbody>
            <tr>
              <td class="logo-cell">
                <img src="/logo.png" alt="SPM Logo" />
              </td>
              <td class="header-details-cell">
                <h1 class="company-name">${settings.companyName}</h1>
                <div class="offices-grid">
                  <div class="office-box-col">
                    <div class="office-title-line">${pinSvg}REGISTER OFFICE</div>
                    <div class="office-address-text">${settings.regOffice}</div>
                  </div>
                  <div class="office-box-col">
                    <div class="office-title-line">${pinSvg}CORPORATE OFFICE</div>
                    <div class="office-address-text">${settings.corpOffice}</div>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 2. Contact Strip -->
        <div class="contact-strip">
          <div class="contact-item">
            <span class="icon-circle">${phoneSvg}</span>
            <span>${settings.phone}</span>
          </div>
          <div class="contact-item">
            <span class="icon-circle">${emailSvg}</span>
            <span>${settings.email}</span>
          </div>
          <div class="contact-item">
            <span class="icon-circle">${webSvg}</span>
            <span>${settings.website}</span>
          </div>
        </div>

        <!-- 3. Title Strip -->
        <div class="title-strip ${isGstInvoice ? 'title-strip-gst' : ''}">
          ${isGstInvoice ? '<span></span>' : ''}
          <span>${isGstInvoice ? 'TAX INVOICE' : 'INVOICE'}</span>
          ${isGstInvoice ? `<span class="gstin-right">${keySvg}${settings.companyGstin}</span>` : ''}
        </div>

        <!-- 4. Customer details + Metadata details table -->
        <table class="details-table">
          <colgroup>
            <col style="width: 68%;" />
            <col style="width: 32%;" />
          </colgroup>
          <tbody>
            <tr>
              <td class="customer-cell">
                <div class="customer-to">TO,</div>
                <div class="customer-details-block">
                  <div class="customer-name">${customerName}</div>
                  <div class="customer-address-text">${customerAddress}</div>
                </div>
                ${isGstInvoice && gstNumber ? `
                  <div class="customer-gst-block">
                    <div class="gst-row">
                      <span class="gst-label">GST NO.</span>
                      <span class="gst-sep">-</span>
                      <span class="gst-val">${gstNumber}</span>
                    </div>
                    <div class="gst-row">
                      <span class="gst-label">CODE</span>
                      <span class="gst-sep">-</span>
                      <span class="gst-val">${gstCode}</span>
                    </div>
                  </div>
                ` : ''}
              </td>
              <td class="invoice-cell">
                <div class="meta-row">
                  <div class="meta-label">Invoice No</div>
                  <div class="meta-separator">:</div>
                  <div class="meta-value">${invoice.invoiceNumber}</div>
                </div>
                <div class="meta-row">
                  <div class="meta-label">Invoice Date</div>
                  <div class="meta-separator">:</div>
                  <div class="meta-value">${formatDate(invoice.invoiceDate)}</div>
                </div>
                <div class="meta-row">
                  <div class="meta-label">BILLING PERIOD</div>
                  <div class="meta-separator">:</div>
                  <div class="meta-value">${billingPeriod}</div>
                </div>
                
                ${isGstInvoice ? `
                  <div class="hsn-sac-split-grid">
                    <div class="hsn-sac-col">HSN - ${hsnCode || '-'}</div>
                    <div class="hsn-sac-col">SAC CODE - ${sacCode || '-'}</div>
                  </div>
                  <div class="meta-row">
                    <div class="meta-label">WORK ORDER NO</div>
                    <div class="meta-separator">:</div>
                    <div class="meta-value">${workOrderNumber || '-'}</div>
                  </div>
                  <div class="meta-row">
                    <div class="meta-label">WORK ORDER DATE</div>
                    <div class="meta-separator">:</div>
                    <div class="meta-value">${workOrderDate || '-'}</div>
                  </div>
                ` : `
                  <div class="meta-row">
                    <div class="meta-label">Contract Period</div>
                    <div class="meta-separator">:</div>
                    <div class="meta-value">${contractPeriod}</div>
                  </div>
                `}
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 5. Particulars & Amount main table -->
        <table class="invoice-table">
          <colgroup>
            <col style="width: 68%;" />
            <col style="width: 32%;" />
          </colgroup>
          <thead>
            <tr>
              <th class="table-header-cell">Particulars</th>
              <th class="table-header-cell">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr class="content-row">
              <td class="particulars-cell">
                <p class="particulars-lead">Being Charges for pest management service rendered as details mentioned below.</p>
                
                <div class="field-row">
                  <div class="field-label">PREMISES TREATED:</div>
                  <div class="field-value">${invoice.premisesTreated || '-'}</div>
                </div>
                
                <div class="field-row">
                  <div class="field-label">TYPE OF TREATMENT:</div>
                  <div class="field-value">${invoice.treatmentType || '-'}</div>
                </div>

                <!-- Dynamic Services -->
                <div class="services-list">
                  ${invoice.services && invoice.services.length > 0 ? invoice.services.map((service, index) => `
                    <div class="service-item-row">
                      ${index + 1}) ${service.serviceName}${service.desc ? ` (${service.desc})` : ''}${service.serviceDate ? ` : ${formatDate(service.serviceDate)}` : ''}
                    </div>
                  `).join('') : ''}
                  <div class="service-total-row">TOTAL = Rs. ${formatAmount(subtotal)}</div>
                </div>

                <!-- Non-GST HSN/SAC -->
                ${!isGstInvoice && (hsnCode || sacCode) ? `
                  <div class="hsn-sac-nongst">
                    ${hsnCode ? `<p>HSN - ${hsnCode}</p>` : ''}
                    ${sacCode ? `<p>SAC CODE - ${sacCode}</p>` : ''}
                  </div>
                ` : ''}
              </td>
              <td class="amount-cell">
                <div class="base-amount-display">Rs. ${formatAmount(subtotal)}</div>
              </td>
            </tr>

            <!-- GSTCGST/SGST/IGST tax rows -->
            ${isGstInvoice ? `
              <tr class="tax-row">
                <td class="tax-label-cell">ADD CGST (${invoice.tax?.cgstPercentage || 9}%)</td>
                <td class="tax-value-cell">Rs. ${formatAmount(invoice.tax?.cgstAmount || (subtotal * 0.09))}</td>
              </tr>
              <tr class="tax-row">
                <td class="tax-label-cell">ADD SGST (${invoice.tax?.sgstPercentage || 9}%)</td>
                <td class="tax-value-cell">Rs. ${formatAmount(invoice.tax?.sgstAmount || (subtotal * 0.09))}</td>
              </tr>
              ${Number(invoice.tax?.igstAmount || 0) > 0 ? `
                <tr class="tax-row">
                  <td class="tax-label-cell">ADD IGST (${invoice.tax?.igstPercentage || 0}%)</td>
                  <td class="tax-value-cell">Rs. ${formatAmount(invoice.tax?.igstAmount)}</td>
                </tr>
              ` : ''}
            ` : ''}

            <!-- Amount in words & grand total -->
            <tr class="total-row">
              <td class="words-cell">
                <div class="words-wrapper">
                  <span style="font-weight: bold; flex-shrink: 0; margin-right: 5px;">AMOUNT IN WORDS:-</span>
                  <span style="font-weight: normal; text-transform: uppercase;">${amountWords}</span>
                </div>
              </td>
              <td class="total-amount-cell">Rs. ${formatAmount(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 6. Footer Wrap -->
      <div class="footer-wrap">
        <ul class="bullets-list">
          <li>Payment can be made via ${!isGstInvoice ? 'GPAY / ' : ''}CHEQUE or NEFT / RTGS.</li>
          <li>All payments should be made payable to Samarth Pest Management.</li>
        </ul>

        <table class="footer-table">
          <colgroup>
            <col style="width: 60%;" />
            <col style="width: 40%;" />
          </colgroup>
          <tbody>
            <tr>
              <td class="footer-bank-cell">
                ${!isGstInvoice && settings.upiId ? `
                  <div class="qr-and-bank">
                    <div class="bank-block">
                      <div class="bank-title">BANK DETAILS:</div>
                      <div class="bank-details-lines">
                        BANK NAME - ${settings.nongstBankName}<br/>
                        A/C NO - ${settings.nongstBankAccount}<br/>
                        IFSC CODE - ${settings.nongstBankIfsc}<br/>
                        PAN NO - ${settings.pan}
                      </div>
                    </div>
                    <img class="qr-code-img" src="${qrCodeUrl}" alt="Payment QR Code" />
                  </div>
                ` : `
                  <div class="bank-block">
                    <div class="bank-title">Bank Details</div>
                    <div class="bank-details-lines">
                      BANK - ${settings.gstBankName}<br/>
                      A/C NO - ${settings.gstBankAccount}<br/>
                      IFSC - ${settings.gstBankIfsc}
                    </div>
                  </div>
                `}
              </td>
              <td class="footer-signature-cell">
                <div class="signature-block">
                  <div class="thanks-regards">Thanks & ${isGstInvoice ? 'regards' : 'Regards'}</div>
                  <div class="signature-for">For ${isGstInvoice ? 'Samarth Pest Management' : 'SAMARTH PEST MANAGEMENT'}</div>
                  <div class="signature-img-box">
                    <img src="/signature.png" alt="Authorised Signature" />
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
};
