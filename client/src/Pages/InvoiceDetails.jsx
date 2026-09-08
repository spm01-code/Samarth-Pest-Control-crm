import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchInvoiceById } from "../slices/invoiceSlice";
import { deleteInvoice } from "../slices/invoiceSlice";
import { useNavigate } from "react-router-dom";
import EditInvoiceModal from "../Components/EditInvoiceModel";
import DocumentPreviewModal from "../Components/DocumentPreviewModal";
import { FaArrowLeft } from "react-icons/fa";
import { generateInvoiceHtml } from "../utils/invoiceTemplate";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";

function InvoiceDetails() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const { invoice, loading, error } = useSelector((state) => state.invoice);
  const token = useSelector((state) => state.auth.token);

  useEffect(() => {
    dispatch(fetchInvoiceById(id));
  }, [dispatch, id]);

  const getPaymentStatusColor = (status) => {
    switch (status) {
      case "Paid":
        return "bg-green-100 text-green-700";

      case "Partially Paid":
        return "bg-yellow-100 text-yellow-700";

      case "Overdue":
        return "bg-red-100 text-red-700";

      case "Cancelled":
        return "bg-gray-100 text-gray-700";

      default:
        return "bg-blue-100 text-blue-700";
    }
  };

  const formatDate = (date) => {
    if (!date) return "-";

    return new Date(date).toLocaleDateString("en-IN");
  };

  const formatAmount = (amount) => {
    return Number(amount || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const safeText = (value) => {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  };

  const numberToWords = (amount) => {
    const ones = [
      "",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
      "Ten",
      "Eleven",
      "Twelve",
      "Thirteen",
      "Fourteen",
      "Fifteen",
      "Sixteen",
      "Seventeen",
      "Eighteen",
      "Nineteen",
    ];

    const tens = [
      "",
      "",
      "Twenty",
      "Thirty",
      "Forty",
      "Fifty",
      "Sixty",
      "Seventy",
      "Eighty",
      "Ninety",
    ];

    const convertBelowHundred = (number) => {
      if (number < 20) return ones[number];

      const ten = Math.floor(number / 10);
      const one = number % 10;

      return `${tens[ten]} ${ones[one]}`.trim();
    };

    const convertBelowThousand = (number) => {
      const hundred = Math.floor(number / 100);
      const rest = number % 100;

      if (hundred && rest) {
        return `${ones[hundred]} Hundred ${convertBelowHundred(rest)}`;
      }

      if (hundred) {
        return `${ones[hundred]} Hundred`;
      }

      return convertBelowHundred(rest);
    };

    const rupees = Math.round(Number(amount || 0));

    if (rupees === 0) return "Zero";

    const crore = Math.floor(rupees / 10000000);
    const lakh = Math.floor((rupees % 10000000) / 100000);
    const thousand = Math.floor((rupees % 100000) / 1000);
    const rest = rupees % 1000;

    let words = "";

    if (crore) words += `${convertBelowThousand(crore)} Crore `;
    if (lakh) words += `${convertBelowThousand(lakh)} Lakh `;
    if (thousand) words += `${convertBelowThousand(thousand)} Thousand `;
    if (rest) words += convertBelowThousand(rest);

    return words.trim();
  };

  const getServiceRows = () => {
    if (!invoice.services || invoice.services.length === 0) {
      return '<div class="service-detail">-</div>';
    }

    return invoice.services
      .map((service) => {
        const serviceBits = [
          formatDate(service.serviceDate),
          service.desc ? safeText(service.desc) : "",
        ].filter(Boolean);

        return `
          <div class="service-detail">
            <strong>${safeText(service.serviceName || "SERVICE")}</strong>${
              serviceBits.length ? `: ${serviceBits.join(" - ")}` : ""
            }
          </div>
        `;
      })
      .join("");
  };

  const formatAddress = (address) => {
    return safeText(address || "-")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => `<div>${line}</div>`)
      .join("");
  };

  const printInvoice = () => {
    const printWindow = window.open(
      `/invoices/${id}/print`,
      "_blank",
      "noopener,noreferrer",
    );

    if (!printWindow) {
      printInvoiceLegacy();
    }
  };

  const printInvoiceLegacy = () => {
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      toast.warning("Please allow popups to print this invoice.");
      return;
    }

    // Load company settings from localStorage if available
    let companySettings = null;
    try {
      const saved = localStorage.getItem("crm_settings_account");
      if (saved) {
        companySettings = JSON.parse(saved);
      }
    } catch (e) {
      console.error("Error reading company settings:", e);
    }

    const innerHtml = generateInvoiceHtml(invoice, companySettings, window.location.origin);

    const invoiceHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${safeText(invoice.invoiceNumber)} PDF</title>
        </head>
        <body style="margin: 0; padding: 0;">
          ${innerHtml}
          <script>
            window.onload = function () {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(invoiceHtml);
    printWindow.document.close();
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl shadow p-6">Loading invoice...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-100 text-red-600 p-4 rounded-xl">{error}</div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl shadow p-6">Invoice not found</div>
      </div>
    );
  }

  const handleDelete = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this invoice?",
    );

    if (!confirmed) return;

    try {
      await dispatch(deleteInvoice(invoice._id)).unwrap();
      navigate("/invoices");
      toast.success("Invoice deleted successfully.");
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          "Failed to delete invoice. Please try again."
        )
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <button
        onClick={() => navigate(-1)}
        className="mb-4 bg-white px-4 py-2 rounded-lg shadow cursor-pointer hover:bg-slate-200 flex items-center gap-2"
      >
        <FaArrowLeft /> Back
      </button>

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{invoice.invoiceNumber}</h1>

            <p className="text-gray-500 mt-1">Invoice Details</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowPreview(true)}
              className="bg-slate-900 cursor-pointer text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-black transition"
            >
              Preview PDF
            </button>

            <button
              onClick={() => setShowEditModal(true)}
              className="bg-blue-800 cursor-pointer text-white px-5 py-1 rounded-lg"
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="bg-red-700 cursor-pointer text-white px-5 py-1 rounded-lg"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-gray-500 text-sm">Total Amount</p>

          <h2 className="text-3xl font-bold mt-2">
            ₹{invoice.totalAmount?.toLocaleString()}
          </h2>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-gray-500 text-sm">Amount Paid</p>

          <h2 className="text-3xl font-bold text-green-600 mt-2">
            ₹{invoice.amountPaid?.toLocaleString()}
          </h2>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-gray-500 text-sm">Balance</p>

          <h2 className="text-3xl font-bold text-red-600 mt-2">
            ₹{invoice.balanceAmount?.toLocaleString()}
          </h2>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-gray-500 text-sm">Payment Status</p>

          <div className="mt-3">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${getPaymentStatusColor(
                invoice.paymentStatus,
              )}`}
            >
              {invoice.paymentStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Customer + Invoice Info */}

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-5">Customer Information</h2>

          <div className="space-y-3">
            <p>
              <strong>Name:</strong> {invoice.customer?.fullName}
            </p>

            <p>
              <strong>Phone:</strong> {invoice.customer?.phone}
            </p>

            <p>
              <strong>Alternate Phone:</strong>{" "}
              {invoice.customer?.alternatePhone || "-"}
            </p>

            <p>
              <strong>Company:</strong> {invoice.customer?.companyName || "-"}
            </p>

            <p>
              <strong>Customer Type:</strong> {invoice.customer?.customerType}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-5">Invoice Information</h2>

          <div className="space-y-3">
            <p>
              <strong>Invoice Number:</strong> {invoice.invoiceNumber}
            </p>

            <p>
              <strong>Invoice Date:</strong>{" "}
              {new Date(invoice.invoiceDate).toLocaleDateString()}
            </p>

            <p>
              <strong>Due Date:</strong>{" "}
              {invoice.dueDate
                ? new Date(invoice.dueDate).toLocaleDateString()
                : "-"}
            </p>

            <p>
              <strong>Work Order Number:</strong>{" "}
              {invoice.workOrderNumber || "-"}
            </p>

            <p>
              <strong>Work Order Date:</strong>{" "}
              {formatDate(invoice.workOrderDate)}
            </p>

            <p>
              <strong>Status:</strong> {invoice.status}
            </p>

            <p>
              <strong>Generated By:</strong>{" "}
              {invoice.generatedBy?.fullName || "-"}
            </p>

            <p>
              <strong>Created:</strong>{" "}
              {new Date(invoice.createdAt).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Invoice Content */}

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-xl font-semibold mb-5">Invoice Content</h2>

        <p className="mb-4"><strong>Invoice Type:</strong> {invoice.invoiceType === "NON_GST" ? "Without GST" : "GST Invoice"}</p>

        <div className="grid md:grid-cols-2 gap-4">
          {invoice.invoiceType !== "NON_GST" && <p>
            <strong>Customer GST Number:</strong>{" "}
            {invoice.gstNumber || "-"}
          </p>}

          <p>
            <strong>Premises Treated:</strong>{" "}
            {invoice.premisesTreated || "-"}
          </p>

          <p>
            <strong>Treatment Type:</strong>{" "}
            {invoice.treatmentType || "-"}
          </p>

          {invoice.invoiceType !== "NON_GST" && <p>
            <strong>HSN Code:</strong>{" "}
            {invoice.hsnCode || "-"}
          </p>}

          {invoice.invoiceType !== "NON_GST" && <p>
            <strong>SAC Code:</strong>{" "}
            {invoice.sacCode || "-"}
          </p>}
        </div>

        <div className="mt-5">
          <p className="font-semibold mb-2">Particulars</p>

          <p className="text-gray-700">
            {invoice.particulars || "-"}
          </p>
        </div>
      </div>

      {/* Services */}

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-xl font-semibold mb-5">Services</h2>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3">Service</th>

                <th className="text-left py-3">Description</th>

                <th className="text-right py-3">Amount</th>
              </tr>
            </thead>

            <tbody>
              {invoice.services?.map((service) => (
                <tr key={service._id} className="border-b">
                  <td className="py-4">{service.serviceName}</td>

                  <td className="py-4">
                    {service.desc || "-"}
                  </td>

                  <td className="py-4 text-right font-semibold">
                    ₹{service.amount?.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tax & Amount */}

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {invoice.invoiceType !== "NON_GST" && <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-5">Tax Breakdown</h2>

          <div className="space-y-4">
            <div>
              CGST ({invoice.tax?.cgstPercentage}
              %)
              <span className="float-right">₹{invoice.tax?.cgstAmount}</span>
            </div>

            <div>
              SGST ({invoice.tax?.sgstPercentage}
              %)
              <span className="float-right">₹{invoice.tax?.sgstAmount}</span>
            </div>

            <div>
              IGST ({invoice.tax?.igstPercentage}
              %)
              <span className="float-right">₹{invoice.tax?.igstAmount}</span>
            </div>

            <hr />

            <div className="font-bold">
              Total Tax
              <span className="float-right">
                ₹{invoice.totalTax?.toLocaleString()}
              </span>
            </div>
          </div>
        </div>}

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-5">Amount Summary</h2>

          <div className="space-y-4">
            <div>
              Subtotal
              <span className="float-right">
                ₹{invoice.subtotal?.toLocaleString()}
              </span>
            </div>

            {invoice.invoiceType !== "NON_GST" && <div>
              Tax
              <span className="float-right">
                ₹{invoice.totalTax?.toLocaleString()}
              </span>
            </div>}

            <hr />

            <div className="font-bold text-lg">
              Grand Total
              <span className="float-right">
                ₹{invoice.totalAmount?.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment */}

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-xl font-semibold mb-5">Payment Information</h2>

        <div className="grid md:grid-cols-2 gap-4">
          <p>
            <strong>Payment Method:</strong> {invoice.paymentMethod || "-"}
          </p>

          <p>
            <strong>Amount Paid:</strong> ₹
            {invoice.amountPaid?.toLocaleString()}
          </p>

          <p>
            <strong>Payment Date:</strong>{" "}
            {invoice.paymentDate
              ? new Date(invoice.paymentDate).toLocaleDateString()
              : "-"}
          </p>

          <p>
            <strong>Transaction Ref:</strong>{" "}
            {invoice.transactionReference || "-"}
          </p>
        </div>
      </div>

      {/* Notes */}

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-xl font-semibold mb-5">Notes</h2>

        <p className="text-gray-700">{invoice.notes || "No notes available"}</p>
      </div>

      {/* Amount In Words */}

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-semibold mb-5">Amount In Words</h2>

        <p className="text-gray-700">
          {invoice.amountInWords ||
            `Rupees ${numberToWords(invoice.totalAmount)} Only`}
        </p>
      </div>

      {(invoice.pdfFileName || invoice.pdfPath) && (
        <div className="bg-white rounded-xl shadow-sm p-6 mt-6">
          <h2 className="text-xl font-semibold mb-5">PDF Information</h2>

          <p>
            <strong>PDF File Name:</strong>{" "}
            {invoice.pdfFileName || "-"}
          </p>

          <p className="mt-2">
            <strong>PDF Path:</strong>{" "}
            {invoice.pdfPath || "-"}
          </p>
        </div>
      )}

      {showEditModal && (
        <EditInvoiceModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          invoice={invoice}
          onUpdated={() => dispatch(fetchInvoiceById(id))}
        />
      )}

      <DocumentPreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        title="Preview"
        iframeId="invoice-preview-iframe"
        iframeSrc={`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/invoices/${id}/pdf?token=${token}`}
        iframeTitle="Invoice PDF Preview"
        onPrint={() => {
          window.open(
            `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/invoices/${id}/pdf?token=${token}`,
            "_blank"
          );
        }}
      />
    </div>
  );
}

export default InvoiceDetails;
