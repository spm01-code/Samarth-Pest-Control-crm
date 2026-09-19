import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { FaPlus } from "react-icons/fa";
import { HiOutlineEye, HiOutlineUser, HiOutlineTrash } from "react-icons/hi2";
import { fetchQuotations, deleteQuotation } from "../slices/quotationSlice";
import CreateQuotationModal from "../Components/CreateQuotationModel";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";
import TooltipCell from "../Components/TooltipCell";
import DataTable from "../Components/DataTable";

function Quotations() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createType, setCreateType] = useState("PC");
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [search, setSearch] = useState("");

  const { quotations, loading, error } = useSelector(
    (state) => state.quotation,
  );

  useEffect(() => {
    dispatch(fetchQuotations());
  }, [dispatch]);

  const quotationList = Array.isArray(quotations) ? quotations : [];

  const filteredQuotations = quotationList.filter((quotation) => {
    const matchesStatus =
      statusFilter === "All" ? true : quotation.status === statusFilter;

    const qType = quotation.quotationType || "PC";
    const matchesType =
      typeFilter === "All" ? true : qType === typeFilter;

    const searchLower = search.toLowerCase();
    const matchesSearch =
      (quotation.quotationNumber?.toLowerCase() || "").includes(searchLower) ||
      (quotation.customer?.fullName?.toLowerCase() || "").includes(searchLower) ||
      (quotation.customer?.phone || "").includes(search) ||
      (quotation.customer?.alternatePhone || "").includes(search) ||
      (quotation.customer?.companyName?.toLowerCase() || "").includes(searchLower) ||
      (quotation.premises?.toLowerCase() || "").includes(searchLower) ||
      (quotation.billingTerm?.toLowerCase() || "").includes(searchLower) ||
      qType.toLowerCase().includes(searchLower);

    return matchesStatus && matchesType && matchesSearch;
  });

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this quotation?",
    );

    if (!confirmDelete) return;

    try {
      await dispatch(deleteQuotation(id)).unwrap();
      toast.success("Quotation deleted successfully.");
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          "Failed to delete quotation. Please try again."
        )
      );
    }
  };

  const getStatusCount = (status) => {
    if (status === "All") {
      return quotationList.length;
    }

    return quotationList.filter((quotation) => quotation.status === status)
      .length;
  };

  const getTypeCount = (type) => {
    if (type === "All") return quotationList.length;
    return quotationList.filter((q) => (q.quotationType || "PC") === type).length;
  };

  const formatDate = (date) => {
    if (!date) return "-";

    return new Date(date).toLocaleDateString();
  };

  const getStatusClass = (status) => {
    if (status === "Draft") {
      return "bg-gray-100 text-gray-700";
    }

    if (status === "Sent") {
      return "bg-blue-100 text-blue-700";
    }

    if (status === "Accepted") {
      return "bg-green-100 text-green-700";
    }

    if (status === "Rejected") {
      return "bg-red-100 text-red-700";
    }

    return "bg-slate-100 text-slate-700";
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Quotations</h1>

          <p className="text-gray-500 mt-1">Manage and track PC and ATT quotations</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setCreateType("PC");
              setIsCreateOpen(true);
            }}
            className="bg-blue-800/80 text-white hover:bg-blue-600 px-4 py-2.5 rounded-lg flex items-center gap-2 text-sm font-medium transition cursor-pointer"
          >
            <FaPlus /> Create PC Quotation
          </button>
          <button
            onClick={() => {
              setCreateType("ATT");
              setIsCreateOpen(true);
            }}
            className="bg-amber-600 text-white hover:bg-amber-700 px-4 py-2.5 rounded-lg flex items-center gap-2 text-sm font-medium transition cursor-pointer shadow-sm"
          >
            <FaPlus /> Create ATT Quotation
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 uppercase mr-1">Status:</span>
            {["All", "Draft", "Sent", "Accepted", "Rejected"].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
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
            placeholder="Search by Quotation No, Customer, Premises..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-80 px-4 py-2 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-xs font-semibold text-slate-400 uppercase mr-1">Type:</span>
          {[
            { key: "All", label: "All Quotations" },
            { key: "PC", label: "PC (Pest Control)" },
            { key: "ATT", label: "ATT (Anti-Termite)" },
          ].map((type) => (
            <button
              key={type.key}
              onClick={() => setTypeFilter(type.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                typeFilter === type.key
                  ? type.key === "ATT"
                    ? "bg-amber-600 text-white"
                    : "bg-blue-600 text-white"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              {type.label} ({getTypeCount(type.key)})
            </button>
          ))}
        </div>
      </div>

      <DataTable
        headers={[
          { key: "qNo", label: "Quotation No", width: "16%" },
          { key: "customer", label: "Customer", width: "20%" },
          { key: "date", label: "Date", width: "12%" },
          { key: "premises", label: "Premises", width: "20%" },
          { key: "billing", label: "Billing", width: "12%" },
          { key: "status", label: "Status", width: "10%" },
          { key: "actions", label: "Actions", width: "160px" },
        ]}
        loading={loading}
        error={error}
        emptyMessage="No quotations found"
        minWidth="min-w-[1000px]"
        hasActions={true}
      >
        {filteredQuotations.map((quotation) => (
          <tr
            key={quotation._id}
            className="border-t border-slate-100 hover:bg-slate-50 transition group"
          >
            <td className="p-3.5 font-semibold text-slate-900">
              <div className="flex items-center gap-2">
                <TooltipCell value={quotation.quotationNumber} maxWidth="max-w-[140px]" />
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    quotation.quotationType === "ATT"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {quotation.quotationType || "PC"}
                </span>
              </div>
            </td>

            <td className="p-3.5 font-medium text-slate-900">
              <TooltipCell value={quotation.customer?.fullName} maxWidth="max-w-[180px]" />
            </td>

            <td className="p-3.5 text-slate-700 whitespace-nowrap">
              {formatDate(quotation.quotationDate)}
            </td>

            <td className="p-3.5 text-slate-700">
              <TooltipCell value={quotation.premises} maxWidth="max-w-[200px]" />
            </td>

            <td className="p-3.5 text-slate-700">
              <TooltipCell value={quotation.billingTerm} maxWidth="max-w-[120px]" />
            </td>

            <td className="p-3.5">
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${getStatusClass(
                  quotation.status,
                )}`}
              >
                {quotation.status}
              </span>
            </td>

            <td className="p-3.5 sticky right-0 bg-white group-hover:bg-slate-50 border-l border-slate-100 shadow-[-4px_0px_8px_rgba(0,0,0,0.03)] z-10 w-[160px]">
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => navigate(`/quotations/${quotation._id}`)}
                  className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 hover:border-blue-300 cursor-pointer"
                  title="View Quotation"
                >
                  <HiOutlineEye className="size-3.5 shrink-0" />
                  View
                </button>

                <button
                  type="button"
                  onClick={() => navigate(`/customers/${quotation.customer?._id}?tab=quotations`)}
                  className="inline-flex items-center gap-1 rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-100 hover:border-cyan-300 cursor-pointer"
                  title="View Customer Quotations"
                >
                  <HiOutlineUser className="size-3.5 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(quotation._id)}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 hover:border-red-300 cursor-pointer"
                  title="Delete Quotation"
                >
                  <HiOutlineTrash className="size-3.5 shrink-0" />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      <CreateQuotationModal
        isOpen={isCreateOpen}
        initialType={createType}
        onClose={() => setIsCreateOpen(false)}
      />
    </div>
  );
}

export default Quotations;
