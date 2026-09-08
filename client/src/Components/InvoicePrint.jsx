import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { fetchInvoiceByIdAPI } from "../API/invoiceAPI";
import { generateInvoiceHtml } from "../utils/invoiceTemplate";

const InvoicePrint = () => {
  const { id } = useParams();
  const token = useSelector((state) => state.auth.token);
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const getInvoice = async () => {
      try {
        const data = await fetchInvoiceByIdAPI(id, token);
        setInvoice(data.invoice);
      } catch (requestError) {
        setError(requestError.message || "Invoice could not be loaded.");
      }
    };

    getInvoice();
  }, [id, token]);

  if (error) {
    return <div className="p-8 text-sm text-slate-600">{error}</div>;
  }

  if (!invoice) {
    return <div className="p-8 text-sm text-slate-500">Loading invoice...</div>;
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

  // The stored type is authoritative: a GST invoice must never be rendered as
  // a regular invoice merely because a print URL was edited.
  const htmlContent = generateInvoiceHtml(invoice, companySettings, window.location.origin);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-7 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex w-[210mm] justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white cursor-pointer"
        >
          Download PDF
        </button>
      </div>

      <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
    </main>
  );
};

export default InvoicePrint;