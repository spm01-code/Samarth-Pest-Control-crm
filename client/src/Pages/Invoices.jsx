import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  deleteInvoice,
  fetchInvoices,
} from "../slices/invoiceSlice";
import { FaPlus } from "react-icons/fa";
import { HiOutlineEye, HiOutlineUser, HiOutlineTrash } from "react-icons/hi2";
import CreateInvoiceModal from "../Components/CreateInvoiceModel";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";

function InvoicePage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState("All");
  const [search, setSearch] = useState("");

  const { invoices, loading, error } = useSelector(
    (state) => state.invoice
  );

  useEffect(() => {
    dispatch(fetchInvoices());
  }, [dispatch]);

  const invoiceList = Array.isArray(invoices) ? invoices : [];

  const filteredInvoices = invoiceList.filter((invoice) => {
    const matchesStatus =
      statusFilter === "All" ? true : invoice.paymentStatus === statusFilter;

    const matchesType =
      invoiceTypeFilter === "All"
        ? true
        : invoiceTypeFilter === "GST"
        ? invoice.invoiceType === "GST"
        : invoice.invoiceType === "NON_GST";

    const matchesSearch =
      (invoice.invoiceNumber?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (invoice.workOrderNumber?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (invoice.customer?.fullName?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (invoice.customer?.phone || "").includes(search) ||
      (invoice.customer?.alternatePhone || "").includes(search);

    return matchesStatus && matchesType && matchesSearch;
  });

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this invoice?"
    );

    if (!confirmDelete) return;

    try {
      await dispatch(deleteInvoice(id)).unwrap();
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

  const getStatusCount = (status) => {
    if (status === "All") {
      return invoiceList.length;
    }

    return invoiceList.filter((invoice) => {
      return invoice.paymentStatus === status;
    }).length;
  };

  const getTypeCount = (type) => {
    if (type === "All") {
      return invoiceList.length;
    }

    return invoiceList.filter((invoice) => {
      return invoice.invoiceType === type;
    }).length;
  };

  const formatDate = (date) => {
    if (!date) return "-";

    return new Date(date).toLocaleDateString();
  };

  const getPaymentStatusClass = (status) => {
    if (status === "Paid") {
      return "bg-green-100 text-green-700";
    }

    if (status === "Partially Paid") {
      return "bg-yellow-100 text-yellow-700";
    }

    if (status === "Overdue") {
      return "bg-orange-100 text-orange-700";
    }

    if (status === "Cancelled") {
      return "bg-gray-100 text-gray-700";
    }

    return "bg-red-100 text-red-700";
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Invoices</h1>

          <p className="text-gray-500 mt-1">
            Manage and track all invoices
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <FaPlus />Create Invoice
        </button>
      </div>

      {/* Invoice Type Filter Row */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-slate-700 mr-2">Invoice Type:</span>
        {[
          { label: "All", value: "All" },
          { label: "GST", value: "GST" },
          { label: "Non GST", value: "NON_GST" },
        ].map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setInvoiceTypeFilter(value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              invoiceTypeFilter === value
                ? "bg-blue-600 text-white"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
            }`}
          >
            {label} ({getTypeCount(value)})
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex flex-wrap gap-3">
          {[
            "All",
            "Pending",
            "Partially Paid",
            "Paid",
            "Overdue",
            "Cancelled",
          ].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                statusFilter === status
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              {status} ({getStatusCount(status)})
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search by Invoice No, Customer, or Work Order..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full md:w-80 px-4 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-sm"
        />
      </div>

      {loading && (
        <div className="text-center py-10">
          Loading invoices...
        </div>
      )}

      {error && (
        <div className="bg-red-100 text-red-600 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {!loading && filteredInvoices.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-500">
          No invoices found
        </div>
      )}

      {!loading && filteredInvoices.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-4">Invoice No</th>
                  <th className="text-left p-4">Customer</th>
                  <th className="text-left p-4">Invoice Date</th>
                  <th className="text-left p-4">Invoice Type</th>
                  <th className="text-left p-4">Amount</th>
                  <th className="text-left p-4">Payment</th>
                  <th className="text-left p-4">Invoice Status</th>
                  <th className="text-left p-4">Due Date</th>
                  <th className="text-left p-4 whitespace-nowrap">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredInvoices.map((invoice) => (
                  <tr
                    key={invoice._id}
                    className="border-t hover:bg-slate-50"
                  >
                    <td className="p-4 font-medium">
                      {invoice.invoiceNumber}
                    </td>

                    <td className="p-4">
                      {invoice.customer?.fullName || "N/A"}
                    </td>

                    <td className="p-4">
                      {formatDate(invoice.invoiceDate)}
                    </td>

                    <td className="p-4">
                      {invoice.invoiceType}
                    </td>

                    <td className="p-4">
                      Rs. {invoice.totalAmount?.toLocaleString()}
                    </td>

                    <td className="p-4">
                      <span
                        className={`px-3 py-1 rounded-full text-sm ${getPaymentStatusClass(
                          invoice.paymentStatus
                        )}`}
                      >
                        {invoice.paymentStatus}
                      </span>
                    </td>

                    <td className="p-4">
                      <span className="px-3 py-1 rounded-full text-sm bg-slate-100 text-slate-700">
                        {invoice.status || "-"}
                      </span>
                    </td>

                    <td className="p-4">
                      {formatDate(invoice.dueDate)}
                    </td>

                    <td className="p-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/invoices/${invoice._id}`)
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 hover:border-blue-300 hover:text-blue-800 cursor-pointer !shadow-none active:!translate-y-0"
                          title="View Invoice"
                        >
                          <HiOutlineEye className="size-3.5 shrink-0" />
                          View
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              `/customers/${invoice.customer?._id}?tab=invoices`
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-100 hover:border-cyan-300 hover:text-cyan-800 cursor-pointer !shadow-none active:!translate-y-0"
                          title="View Customer Invoices"
                        >
                          <HiOutlineUser className="size-3.5 shrink-0" />
                          Customer
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(invoice._id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 hover:border-red-300 hover:text-red-700 cursor-pointer !shadow-none active:!translate-y-0"
                          title="Delete Invoice"
                        >
                          <HiOutlineTrash className="size-3.5 shrink-0" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CreateInvoiceModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </div>
  );
}

export default InvoicePage;
