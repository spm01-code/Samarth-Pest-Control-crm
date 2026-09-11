import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import {
  deleteQuotation,
  fetchQuotationById,
} from "../slices/quotationSlice";
import { FaArrowLeft } from "react-icons/fa";
import CreateQuotationModal from "../Components/CreateQuotationModel";
import DocumentPreviewModal from "../Components/DocumentPreviewModal";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";

const statusStyles = {
  Draft: "bg-gray-100 text-gray-700",
  Sent: "bg-blue-100 text-blue-700",
  Accepted: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
};

const formatDate = (date) => {
  if (!date) return "-";

  const parsedDate = new Date(date);
  return Number.isNaN(parsedDate.getTime())
    ? "-"
    : parsedDate.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
};

const formatAmount = (amount) =>
  Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatPdfDate = (date) => {
  if (!date) return "-";

  return new Date(date).toLocaleDateString("en-GB");
};

const safeText = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function QuotationDetails() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const { quotation, loading, error } = useSelector(
    (state) => state.quotation,
  );
  const token = useSelector((state) => state.auth.token);

  useEffect(() => {
    dispatch(fetchQuotationById(id));
  }, [dispatch, id]);

  const handleDelete = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this quotation?",
    );

    if (!confirmed) return;

    setDeleting(true);
    setDeleteError("");

    try {
      await dispatch(deleteQuotation(id)).unwrap();
      navigate("/quotation");
      toast.success("Quotation deleted successfully.");
    } catch (deleteRequestError) {
      const msg = getErrorMessage(
        deleteRequestError,
        "Failed to delete quotation. Please try again."
      );
      setDeleteError(msg);
      toast.error(msg);
      setDeleting(false);
    }
  };

  const downloadQuotation = () => {
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      toast.warning("Please allow popups to download this quotation.");
      return;
    }

    const quotationServices = Array.isArray(quotation.services)
      ? quotation.services
      : [];
    const customer =
      typeof quotation.customer === "object"
        ? quotation.customer
        : {};
    const customerName =
      customer.companyName || customer.fullName || "Customer";
    const customerAddress = customer.address || quotation.premises || "-";
    const logoUrl = `${window.location.origin}/logo.png`;
    const signatureUrl = `${window.location.origin}/signature.png`;

    const serviceRows = quotationServices
      .map(
        (service, index) => `
          <tr>
            <td class="serial">${index + 1}</td>
            <td>${safeText(service.location || service.address || quotation.premises || customerAddress)}</td>
            <td class="center service-name">${safeText(service.serviceName)}</td>
            <td class="center">${safeText(service.frequency)}</td>
            <td class="center">Rs. ${formatAmount(service.cost)}<br>(Per Service)</td>
          </tr>
        `,
      )
      .join("");

    const quotationHtml = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${safeText(quotation.quotationNumber)} - Quotation</title>
          <style>
            * { box-sizing: border-box; }
            @page { size: A4 portrait; margin: 0; }
            html, body {
              margin: 0;
              padding: 0;
              color: #000;
              background: #d9d9d9;
              font-family: "Times New Roman", Times, serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .print-button {
              position: fixed;
              top: 14px;
              right: 18px;
              z-index: 20;
              border: 0;
              border-radius: 6px;
              padding: 10px 16px;
              color: #fff;
              background: #111827;
              font: 600 14px Arial, sans-serif;
              cursor: pointer;
            }
            .pdf-page {
              width: 210mm;
              height: 297mm;
              margin: 18px auto;
              padding: 2mm 9mm 5mm;
              overflow: hidden;
              background: #fff;
              box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
              font-size: 11.5px;
              line-height: 1.18;
            }
            .company-header {
              min-height: 1.35in;
              border: 2px solid #172033;
              padding: 0;
              font-family: Arial, Helvetica, sans-serif;
            }
            .company-header-top {
              display: grid;
              grid-template-columns: 1.32in 1fr;
              min-height: 0.98in;
            }
            .logo-panel {
              display: flex;
              align-items: center;
              justify-content: center;
              border-right: 2px solid #7683c7;
              margin: 0.05in 0;
            }
            .logo-panel img { width: 1.08in; height: auto; }
            .company-header-info { padding: 0.03in 0.11in 0; }
            .company-name {
              margin: 0;
              color: #0837b6;
              font-size: 26px;
              line-height: 1;
              font-weight: 900;
              letter-spacing: 1px;
              white-space: nowrap;
            }
            .offices {
              display: grid;
              grid-template-columns: 1fr 1fr;
              margin: 6px 0 0 0.45in;
            }
            .office { min-height: 0.48in; padding: 0 0.18in; }
            .office + .office { border-left: 2px solid #999; }
            .office-title {
              margin: 0 0 2px;
              color: #0837b6;
              font-size: 12px;
              font-weight: 900;
              letter-spacing: .3px;
            }
            .office-title::before {
              content: "\\25CF";
              display: inline-flex;
              width: 15px;
              height: 15px;
              margin-right: 5px;
              align-items: center;
              justify-content: center;
              border-radius: 50%;
              color: #fff;
              background: #0837b6;
              font-size: 8px;
            }
            .office-address {
              margin: 0;
              font-size: 8.5px;
              line-height: 1.25;
              font-weight: 700;
            }
            .company-contact {
              display: flex;
              justify-content: space-between;
              padding: 0.05in 0.32in;
              border-top: 1px solid #a2a2a2;
              font-size: 12px;
              font-weight: 700;
            }
            .company-contact > span {
              display: inline-flex;
              align-items: center;
              gap: 5px;
              white-space: nowrap;
              font-size: 0;
            }
            .company-contact > span::before {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 17px;
              height: 17px;
              border-radius: 50%;
              color: #fff;
              background: #0837b6;
              font: 700 9px Arial, sans-serif;
            }
            .company-contact > span::after {
              font: 700 12px Arial, Helvetica, sans-serif;
            }
            .company-contact > span:nth-child(1)::before { content: "\\260E"; }
            .company-contact > span:nth-child(1)::after { content: "8356080548"; }
            .company-contact > span:nth-child(2)::before { content: "\\2709"; }
            .company-contact > span:nth-child(2)::after { content: "samarthpest2022@gmail.com"; }
            .company-contact > span:nth-child(3)::before { content: "\\25CB"; }
            .company-contact > span:nth-child(3)::after { content: "samarthpest.com"; }
            .document-title {
              margin: 4px 0 1px;
              text-align: center;
              font-size: 16px;
              font-weight: 700;
            }
            .address-row {
              display: grid;
              grid-template-columns: 1fr 2.05in;
              min-height: 1.03in;
              padding: 0 0.09in;
            }
            .recipient { padding-top: 12px; }
            .recipient strong {
              display: block;
              margin: 5px 0 0 18px;
              max-width: 4.05in;
              line-height: 1.25;
              text-transform: uppercase;
              white-space: pre-line;
            }
            .quotation-meta {
              padding-top: 1px;
              font-size: 12px;
              line-height: 1.45;
            }
            .reference {
              margin: 1px 0 5px;
              text-align: center;
              font-size: 12px;
            }
            .intro p { margin: 0 0 6px; text-align: justify; }
            .intro .indent { text-indent: 25px; }
            .intro-heading { margin: 4px 0 5px; font-weight: 700; }
            .proposal-line { margin: 4px 0 2px; font-weight: 700; }
            .annexure-list { margin: 0 0 2px; padding-left: 18px; font-weight: 700; }
            .annexure-title {
              margin: 2px 0 0;
              text-align: center;
              font-size: 16px;
              font-weight: 700;
            }
            .proposal-title {
              margin: 0 0 4px;
              font-size: 14px;
              font-weight: 700;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            .proposal-table {
              table-layout: fixed;
              font-size: 10.5px;
              line-height: 1.10;
            }
            .proposal-table th,
            .proposal-table td {
              border: 1px solid #111;
              padding: 5px 6px;
              vertical-align: middle;
            }
            .proposal-table .premises-label,
            .proposal-table .premises-value {
              color: #fff;
              background-color: #91cf4e !important;
              font-weight: 700;
              text-align: left;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .proposal-table .column-header {
              background-color: #91cf4e !important;
              text-align: center;
              font-weight: 400;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .proposal-table .serial { width: 3%; text-align: center; }
            .proposal-table .location { width: 39%; }
            .proposal-table .service { width: 19%; }
            .proposal-table .frequency { width: 20%; }
            .proposal-table .cost { width: 19%; }
            .center { text-align: center; }
            .service-name { text-transform: uppercase; }
            .payment-notes {
              margin: 5px 0 3px;
              padding-left: 18px;
              color: #072b62;
              font-size: 12px;
              line-height: 1.18;
            }
            .closing { margin: 0; font-size: 11px; }
            .signature-img {
              display: block;
              width: 1.28in;
              height: auto;
              margin: 3px 0 0 24px;
            }
            .for-company { margin: 1px 0 0; font-weight: 700; }
            .page-two {
              padding-top: 0.20in;
              font-size: 11px;
            }
            .page-two h2 {
              margin: 0 0 10px;
              text-align: center;
              font-size: 17px;
            }
            .page-two h3 {
              margin: 0 0 10px;
              font-size: 16px;
            }
            .annexure-table {
              table-layout: fixed;
              font-size: 8.6px;
              line-height: 1.08;
            }
            .annexure-table th,
            .annexure-table td {
              border: 1px solid #111;
              padding: 4px 7px;
              vertical-align: middle;
            }
            .annexure-table th {
              background-color: #a8e400 !important;
              font-size: 12px;
              font-weight: 700;
              text-align: center;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .annexure-table .code { width: 12%; }
            .annexure-table .name { width: 26%; }
            .annexure-table .pests { width: 19%; }
            .annexure-table .procedure { width: 43%; }
            .terms-title {
              margin: 0 !important;
              text-align: center;
              font-size: 16px !important;
            }
            .terms {
              margin: 3px 0 0;
              padding-left: 25px;
              font-size: 10.8px;
              line-height: 1.16;
            }
            .terms li { margin-bottom: 2px; }
            @media print {
              html, body { background: #fff; }
              .print-button { display: none; }
              .pdf-page {
                margin: 0;
                box-shadow: none;
                break-after: page;
                page-break-after: always;
              }
              .pdf-page:last-child {
                break-after: auto;
                page-break-after: auto;
              }
            }
          </style>
        </head>
        <body>
          <button class="print-button" onclick="window.print()">Download PDF</button>

          <section class="pdf-page">
            <header class="company-header">
              <div class="company-header-top">
                <div class="logo-panel">
                  <img src="${logoUrl}" alt="SPM" />
                </div>
                <div class="company-header-info">
                  <h1 class="company-name">SAMARTH PEST MANAGEMENT</h1>
                  <div class="offices">
                    <div class="office">
                      <p class="office-title">REGISTER OFFICE</p>
                      <p class="office-address">Office No. 102, Balaji, New Vijay<br />CHSL, Near Datta Mandir,<br />Nallasopara (E) - 401209</p>
                    </div>
                    <div class="office">
                      <p class="office-title">CORPORATE OFFICE</p>
                      <p class="office-address">Office No. B - 221, Bhaskar<br />Commercial Complex, Near<br />Platform No. 1, Virar (W)-401303</p>
                    </div>
                  </div>
                </div>
              </div>
              <div class="company-contact">
                <span>☎ 8356080548</span>
                <span>✉ samarthpest2022@gmail.com</span>
                <span>◎ samarthpest.com</span>
              </div>
            </header>

            <div class="document-title">PC QUOTATION</div>

            <div class="address-row">
              <div class="recipient">
                TO,
                <strong>${safeText(customerName)}
${safeText(customerAddress)}</strong>
              </div>
              <div class="quotation-meta">
                QTN: ${safeText(quotation.quotationNumber)}<br />
                DATE: ${formatPdfDate(quotation.quotationDate)}
              </div>
            </div>

            <div class="reference">
              <strong>Reference:</strong> Quotation for Pest Management Services from Samarth Pest Management.
            </div>

            <div class="intro">
              <p><strong>Respected Sir,</strong></p>
              <p class="indent">
                We thank you very much for your enquiry and the opportunity given to us to quote our rates.
                Further to your instructions, we are pleased to submit our quotation as below. It is our
                commitment to provide you with the best and reliable services.
              </p>
              <p>
                For more information about our extensive range of services and what you can expect from our
                expertise and initiatives, please refer to our company website: samarthpest.com
              </p>
              <p class="intro-heading">About SPM - Samarth Pest Management:</p>
              <p>
                At SPM, we are committed to providing safe, effective, and eco-friendly pest control solutions.
                With years of experience, our team ensures your home or business remains pest-free.
              </p>
              <p>
                Over the past three years, we have built a reputation for excellence through professional
                expertise, innovative solutions, and a relentless focus on <strong>customer satisfaction.</strong>
                We believe in providing high-quality services that are safe, effective, and long-lasting.
              </p>
              <p>
                At SPM, we use <strong>scientific and innovative techniques</strong> to minimize chemical usage,
                ensuring an <strong>odourless, safe, and eco-friendly approach</strong> to pest control.
              </p>
            </div>

            <div class="proposal-line">
              Based on the observations during the inspection, please find below our proposal which consists of -
            </div>
            <ul class="annexure-list">
              <li>Annexure I - SPM commercial proposal for pest management services</li>
              <li>Annexure II - SPM Service description and abbreviation with Targeted Pests &amp; Treatment Procedure</li>
            </ul>

            <div class="annexure-title">Annexure I</div>
            <div class="proposal-title">SPM commercial proposal for pest management services</div>

            <table class="proposal-table">
              <colgroup>
                <col class="serial" />
                <col class="location" />
                <col class="service" />
                <col class="frequency" />
                <col class="cost" />
              </colgroup>
              <thead>
                <tr>
                  <th colspan="2" class="premises-label">Premises to be Treated</th>
                  <th colspan="3" class="premises-value">${safeText(quotation.premises)}</th>
                </tr>
                <tr>
                  <th class="column-header">No</th>
                  <th class="column-header">Location to be Treated</th>
                  <th class="column-header">Service Name</th>
                  <th class="column-header">Frequency</th>
                  <th class="column-header">Service Cost</th>
                </tr>
              </thead>
              <tbody>
                ${
                  serviceRows ||
                  '<tr><td colspan="5" class="center">No services added</td></tr>'
                }
              </tbody>
            </table>

            <ul class="payment-notes">
              <li>All payments should be made payable to <strong>Samarth Pest Management</strong> via <strong>Cheque or NEFT / RTGS / GPAY.</strong></li>
              <li>The above quote is exclusive of GST and will be charged as per applicable rate.</li>
              <li>Payment Term: ${safeText(quotation.paymentTerm)}</li>
              <li>Billing Term: ${safeText(quotation.billingTerm)}</li>
            </ul>

            <p class="closing">
              We trust that our proposed solution is acceptable to you and we await your favourable reply.
              Thank you for your interest in Samarth Pest Management.
            </p>
            <p class="closing">Yours faithfully,</p>
            <img class="signature-img" src="${signatureUrl}" alt="Authorised Signature" />
            <p class="for-company">For Samarth Pest Management</p>
          </section>

          <section class="pdf-page page-two">
            <h2>Annexure II</h2>
            <h3>Service description and abbreviation with Targeted Pests &amp; Treatment Procedure</h3>

            <table class="annexure-table">
              <colgroup>
                <col class="code" />
                <col class="name" />
                <col class="pests" />
                <col class="procedure" />
              </colgroup>
              <thead>
                <tr>
                  <th>Service<br />code</th>
                  <th>Service Name</th>
                  <th>Pests covered</th>
                  <th>Treatment Procedure</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>GS</td><td>GREEN SHIELD</td><td>COCKROACH &amp; ANTS</td><td>INSECTICIDES SPRAY AND GEL APPLICABLE</td></tr>
                <tr><td>BB</td><td>BED BUG</td><td>BED BUG</td><td>INSECTICIDES SPRAY</td></tr>
                <tr><td>RC</td><td>RAT CONTROL</td><td>RAT, MOUSE</td><td>BAITING OF POISON / GLUE BOARD TRAPPING / RAT GUARD INSTALLATION</td></tr>
                <tr><td>MQ</td><td>MOSQUITO CONTROL</td><td>MOSQUITOES, LARVA</td><td>INSECTICIDES SPRAY AND THERMAL FOGGING</td></tr>
                <tr><td>ATT - POST</td><td>ANTI TERMITE - POST CONSTRUCTION</td><td>TERMITE</td><td>INSECTICIDES SPRAY, DRILLING, SEALING</td></tr>
                <tr><td>ATT - PRE</td><td>ANTI TERMITE - PRE CONSTRUCTION</td><td>TERMITE</td><td>INSECTICIDES SPRAY</td></tr>
                <tr><td>SC</td><td>SNAKE CONTROL</td><td>SNAKE</td><td>INSECTICIDES SPRAY AND POWDER DUSTING</td></tr>
                <tr><td>HB</td><td>HONEYBEE SERVICE</td><td>HONEY BEE</td><td>INSECTICIDES SPRAY</td></tr>
                <tr><td>FL</td><td>FLY CONTROL (HOUSEFLY/DARIN)</td><td>FLY</td><td>INSECTICIDES SPRAY / GRANULES BAITING</td></tr>
                <tr><td>WB</td><td>WOOD BORER</td><td>WOOD BORER</td><td>INSECTICIDES SPRAY</td></tr>
                <tr><td>SP</td><td>SPIDER CONTROL</td><td>SPIDER</td><td>INSECTICIDES SPRAY</td></tr>
                <tr><td>LZ</td><td>LIZARD CONTROL</td><td>LIZARD</td><td>INSECTICIDES SPRAY</td></tr>
                <tr><td>SS</td><td>SANITIZATION SERVICE</td><td>PATHOGENTS</td><td>INSECTICIDES SPRAY</td></tr>
              </tbody>
            </table>

            <h3 class="terms-title">Terms and conditions</h3>
            <ul class="terms">
              <li>Note that pests like bats, birds, dogs, cats, monkeys, squirrels, scorpions, etc. are not covered in above services.</li>
              <li>Rodent Station are property of SPM and shall be taken back in case of expiry or termination of service contract.</li>
              <li>Charges are levied for misplacement or damage of rodent station that will be installed in your premises.</li>
              <li>The customer understands that SPM technicians have instructions not to handle the customer's property to avoid any inadvertent damage. A representative of the customer should be present during the pest management treatment to remove and shift all articles as necessary.</li>
              <li>SPM does not give any express or implied warranty or assurance on elimination or eradication of the pests in respect whereof this agreement is signed, during the period of this service contract.</li>
              <li>SPM shall be obliged to carry out the necessary pest management operation without incurring any liability or obligation for any inconvenience, loss, injury or damage that may be caused to the customer or any occupant of, or visitor to, the premises or to any property of any such persons.</li>
              <li>SPM shall not be liable for any loss, injury or damage to the customer or any occupant or visitor to the premises or to any property of any such persons by reason of or as a consequence of the pest management operations and treatment carried out by SPM pursuant to this agreement. Ensuring the safety of all valuables in the customer premises is solely the customer's responsibility.</li>
              <li>The customer has understood his/her obligation to ensure that shelter, entry and food are denied to pests as possible and to maintain hygienic conditions in the premises.</li>
              <li>All material(s) and equipment kept by SPM in customer's premises for carrying out/during service, remains the sole property of SPM and customer has no right over it/them whatsoever.</li>
              <li>In the event of termination of agreement by either party or upon expiry, SPM will take back all equipment and other property such as Rodent bait-Station, etc. from the customer's premises.</li>
              <li>All annexures are part and parcel of this proposal.</li>
              <li>Services shall be rendered during working hrs with All days.</li>
            </ul>
          </section>

        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(quotationHtml);
    printWindow.document.close();
  };

  if (loading && (!quotation || quotation._id !== id)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-gray-500">Loading quotation...</p>
      </div>
    );
  }

  if (error && (!quotation || quotation._id !== id)) {
    return (
      <div className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6 lg:p-8">
        <button
          type="button"
          onClick={() => navigate("/quotation")}
          className="mb-6 rounded-lg bg-white px-4 py-2 shadow-sm hover:bg-slate-50 flex items-center gap-2"
        >
          <FaArrowLeft /> Back
        </button>
        <div className="rounded-2xl bg-red-50 p-8 text-center text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!quotation || quotation._id !== id) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-gray-500">Quotation not found.</p>
        <button
          type="button"
          onClick={() => navigate("/quotation")}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white flex items-center gap-2"
        >
          <FaArrowLeft /> Back
        </button>
      </div>
    );
  }
  

  const isAtt = quotation.quotationType === "ATT";
  const services = Array.isArray(quotation.services)
    ? quotation.services
    : [];
  const treatments = Array.isArray(quotation.treatments)
    ? quotation.treatments
    : [];
  const totalCost = services.reduce(
    (total, service) => total + Number(service.cost || 0),
    0,
  );
  const customer = quotation.customer || {};
  const customerId =
    typeof quotation.customer === "string"
      ? quotation.customer
      : quotation.customer?._id;

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6 lg:p-8">
      <button
        type="button"
        onClick={() => navigate("/quotation")}
        className="mb-4 rounded-lg bg-white px-4 py-2 shadow-sm hover:bg-slate-50 flex items-center gap-2"
      >
        <FaArrowLeft /> Back
      </button>

      <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <p className="text-sm font-medium uppercase tracking-wide text-blue-600">
                {isAtt ? "Anti-Termite Quotation" : "Pest Control Quotation"}
              </p>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                {isAtt ? "ATT" : "PC"}
              </span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900">
              {quotation.quotationNumber}
            </h1>
            <p className="mt-2 text-gray-500">
              Issued on {formatDate(quotation.quotationDate)}
            </p>
          </div>

          <span
            className={`self-start rounded-full px-4 py-2 text-sm font-medium ${
              statusStyles[quotation.status] ||
              "bg-slate-100 text-slate-700"
            }`}
          >
            {quotation.status || "Draft"}
          </span>
        </div>
      </div>

      {isAtt ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Treatments</p>
            <p className="mt-2 text-2xl font-bold">{treatments.length}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Payment Term</p>
            <p className="mt-2 font-semibold">
              {quotation.paymentTerm || "-"}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Quotation Date</p>
            <p className="mt-2 font-semibold">
              {formatDate(quotation.quotationDate)}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Last Updated</p>
            <p className="mt-2 font-semibold">
              {formatDate(quotation.updatedAt)}
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Total Value</p>
            <p className="mt-2 text-2xl font-bold">
              ₹{formatAmount(totalCost)}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Services</p>
            <p className="mt-2 text-2xl font-bold">{services.length}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Billing Term</p>
            <p className="mt-2 font-semibold">
              {quotation.billingTerm || "-"}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Last Updated</p>
            <p className="mt-2 font-semibold">
              {formatDate(quotation.updatedAt)}
            </p>
          </div>
        </div>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Customer Information</h2>
            {customerId && (
              <button
                type="button"
                onClick={() => navigate(`/customers/${customerId}`)}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                View Customer
              </button>
            )}
          </div>

          <dl className="grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-gray-500">Name</dt>
              <dd className="mt-1 font-medium">
                {customer.fullName || "Not available"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Company</dt>
              <dd className="mt-1 font-medium">
                {customer.companyName || "Not available"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Phone</dt>
              <dd className="mt-1 font-medium">
                {customer.phone || "Not available"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Email</dt>
              <dd className="mt-1 break-words font-medium">
                {customer.email || "Not available"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm text-gray-500">Customer Address</dt>
              <dd className="mt-1 whitespace-pre-line font-medium">
                {customer.address || "Not available"}
              </dd>
            </div>
          </dl>
        </section>

        {isAtt ? (
          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-xl font-semibold">ATT Details &amp; Terms</h2>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm text-gray-500">Subject</dt>
                <dd className="mt-1 font-medium">{quotation.subject || "-"}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Premise To Be Treated</dt>
                <dd className="mt-1 whitespace-pre-line font-medium">
                  {quotation.premises || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Specification</dt>
                <dd className="mt-1 whitespace-pre-line font-medium">
                  {quotation.specification || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Equipment</dt>
                <dd className="mt-1 whitespace-pre-line font-medium">
                  {quotation.equipment || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Payment Terms</dt>
                <dd className="mt-1 font-medium">
                  {quotation.paymentTerm || "-"}
                </dd>
              </div>
            </dl>
          </section>
        ) : (
          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-xl font-semibold">Quotation Terms</h2>
            <dl className="space-y-5">
              <div>
                <dt className="text-sm text-gray-500">Payment Term</dt>
                <dd className="mt-1 font-medium">
                  {quotation.paymentTerm || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Billing Term</dt>
                <dd className="mt-1 font-medium">
                  {quotation.billingTerm || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Premises</dt>
                <dd className="mt-1 whitespace-pre-line font-medium">
                  {quotation.premises || "-"}
                </dd>
              </div>
            </dl>
          </section>
        )}
      </div>

      {isAtt ? (
        <section className="mb-6 overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="border-b p-6">
            <h2 className="text-xl font-semibold">Treatments</h2>
          </div>

          {treatments.length === 0 ? (
            <p className="p-6 text-gray-500">
              No treatments were added to this quotation.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-slate-50 text-left text-sm text-gray-500">
                  <tr>
                    <th className="p-4 font-medium">#</th>
                    <th className="p-4 font-medium">Type of Treatment</th>
                    <th className="p-4 font-medium">Period of Warranty</th>
                    <th className="p-4 font-medium">Chemical Used</th>
                    <th className="p-4 font-medium">Service Charges</th>
                  </tr>
                </thead>
                <tbody>
                  {treatments.map((treatment, index) => (
                    <tr
                      key={treatment._id || index}
                      className="border-t"
                    >
                      <td className="p-4 text-gray-500">{index + 1}</td>
                      <td className="p-4 font-medium">
                        {treatment.typeOfTreatment || "-"}
                      </td>
                      <td className="p-4">{treatment.warrantyPeriod || "-"}</td>
                      <td className="p-4">{treatment.chemicalUsed || "-"}</td>
                      <td className="p-4 font-medium">
                        {treatment.serviceCharges || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="mb-6 overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="border-b p-6">
            <h2 className="text-xl font-semibold">Services</h2>
          </div>

          {services.length === 0 ? (
            <p className="p-6 text-gray-500">
              No services were added to this quotation.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-slate-50 text-left text-sm text-gray-500">
                  <tr>
                    <th className="p-4 font-medium">#</th>
                    <th className="p-4 font-medium">Service</th>
                    <th className="p-4 font-medium">Location</th>
                    <th className="p-4 font-medium">Frequency</th>
                    <th className="p-4 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((service, index) => (
                    <tr
                      key={service._id || `${service.serviceName}-${index}`}
                      className="border-t"
                    >
                      <td className="p-4 text-gray-500">{index + 1}</td>
                      <td className="p-4 font-medium">
                        {service.serviceName}
                      </td>
                      <td className="p-4 text-sm text-gray-600">
                        {service.location || service.address || quotation.premises || "-"}
                      </td>
                      <td className="p-4">{service.frequency}</td>
                      <td className="p-4 text-right font-medium">
                        ₹{formatAmount(service.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 bg-slate-50">
                  <tr>
                    <td
                      colSpan="4"
                      className="p-4 text-right font-semibold"
                    >
                      Total
                    </td>
                    <td className="p-4 text-right text-lg font-bold">
                      ₹{formatAmount(totalCost)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Notes</h2>
        <p className="whitespace-pre-line leading-relaxed text-gray-700">
          {quotation.notes || "No notes added."}
        </p>
      </section>

      {deleteError && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">
          {deleteError}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setShowEditModal(true)}
          className="rounded-xl bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
        >
          Edit Quotation
        </button>
        <button
          type="button"
          onClick={() => setShowPreview(true)}
          className="rounded-xl bg-slate-900 px-6 py-3 font-medium text-white hover:bg-black"
        >
          Preview PDF
        </button>
        {customerId && (
          <button
            type="button"
            onClick={() =>
              navigate(`/customers/${customerId}?tab=quotations`)
            }
            className="rounded-xl bg-cyan-600 px-6 py-3 font-medium text-white hover:bg-cyan-700"
          >
            Open Customer
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-xl bg-red-600 px-6 py-3 font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {deleting ? "Deleting..." : "Delete Quotation"}
        </button>
      </div>

      <DocumentPreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        title="Preview"
        iframeId="quotation-preview-iframe"
        iframeSrc={`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/quotations/${id}/pdf?token=${token}`}
        iframeTitle="Quotation PDF Preview"
        onPrint={() => {
          window.open(
            `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/quotations/${id}/pdf?token=${token}`,
            "_blank"
          );
        }}
      />

      {showEditModal && (
        <CreateQuotationModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          initialQuotation={quotation}
          onUpdated={() => {
            dispatch(fetchQuotationById(id));
            setShowEditModal(false);
          }}
        />
      )}
    </div>
  );
}

export default QuotationDetails;
