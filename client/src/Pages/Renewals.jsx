import { useEffect, useState } from "react";
import { FaPlus } from "react-icons/fa";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import CreateRenewalModal from "../Components/CreateRenewalModal";
import DocumentPreviewModal from "../Components/DocumentPreviewModal";
import { deleteRenewal, fetchRenewals } from "../slices/renewalSlice";
import { HiOutlineEye, HiOutlinePrinter, HiOutlineTrash } from "react-icons/hi2";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";
import TooltipCell from "../Components/TooltipCell";
import DataTable from "../Components/DataTable";
import { BASE_URL } from "../API/apiConfig";

function Renewals() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [previewRenewalId, setPreviewRenewalId] = useState(null);

  const { renewals = [], loading, error } = useSelector((state) => state.renewal);
  const token = useSelector((state) => state.auth.token);

  useEffect(() => {
    dispatch(fetchRenewals());
  }, [dispatch]);

  const formatDate = (date) => (date ? new Date(date).toLocaleDateString() : "-");

  const renewalList = Array.isArray(renewals) ? renewals : [];

  const filteredRenewals = renewalList.filter((renewal) => {
    const searchLower = search.toLowerCase();
    return (
      (renewal.renewalNumber?.toLowerCase() || "").includes(searchLower) ||
      (renewal.customer?.fullName?.toLowerCase() || "").includes(searchLower) ||
      (renewal.customer?.phone || "").includes(search) ||
      (renewal.customer?.alternatePhone || "").includes(search) ||
      (renewal.customer?.companyName?.toLowerCase() || "").includes(searchLower) ||
      (renewal.customer?.address?.toLowerCase() || "").includes(searchLower) ||
      (renewal.contractPeriod?.toLowerCase() || "").includes(searchLower)
    );
  });

  const handleDelete = async (id) => {
    const confirmed = window.confirm("Are you sure you want to delete this contract renewal?");
    if (!confirmed) return;

    try {
      await dispatch(deleteRenewal(id)).unwrap();
      toast.success("Contract renewal deleted successfully.");
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          "Failed to delete contract renewal. Please try again."
        )
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Contract Renewals</h1>
          <p className="mt-1 text-gray-500">
            Create customer-specific copies of the fixed renewal template
          </p>
        </div>
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-800/80 px-5 py-2.5 text-white hover:bg-blue-600"
        >
          <FaPlus /> Create Renewal
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <input
          type="text"
          placeholder="Search by Renewal No, Customer, Phone, or Address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-4 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-sm"
        />
      </div>

      <DataTable
        headers={[
          { key: "rNo", label: "Renewal No", width: "18%" },
          { key: "customer", label: "Customer", width: "24%" },
          { key: "address", label: "Address", width: "28%" },
          { key: "date", label: "Date", width: "12%" },
          { key: "status", label: "Status", width: "10%" },
          { key: "actions", label: "Actions", width: "160px" },
        ]}
        loading={loading}
        error={error}
        emptyMessage="No contract renewals found"
        minWidth="min-w-[900px]"
        hasActions={true}
      >
        {filteredRenewals.map((renewal) => (
          <tr key={renewal._id} className="border-t border-slate-100 hover:bg-slate-50 transition group">
            <td className="p-3.5 font-semibold text-slate-900">
              <TooltipCell value={renewal.renewalNumber} maxWidth="max-w-[150px]" />
            </td>

            <td className="p-3.5 font-medium text-slate-900">
              <TooltipCell value={renewal.customer?.fullName} maxWidth="max-w-[200px]" />
            </td>

            <td className="p-3.5 text-slate-700">
              <TooltipCell value={renewal.customer?.address} maxWidth="max-w-[260px]" />
            </td>

            <td className="p-3.5 text-slate-700 whitespace-nowrap">
              {formatDate(renewal.renewalDate)}
            </td>

            <td className="p-3.5">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 whitespace-nowrap">
                {renewal.status}
              </span>
            </td>

            <td className="p-3.5 sticky right-0 bg-white group-hover:bg-slate-50 border-l border-slate-100 shadow-[-4px_0px_8px_rgba(0,0,0,0.03)] z-10 w-[160px]">
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => navigate(`/renewals/${renewal._id}`)}
                  className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 hover:border-blue-300 cursor-pointer"
                  title="View Renewal Details"
                >
                  <HiOutlineEye className="size-3.5 shrink-0" />
                  View
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewRenewalId(renewal._id)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 hover:border-slate-300 cursor-pointer"
                  title="Print Renewal PDF"
                >
                  <HiOutlinePrinter className="size-3.5 shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(renewal._id)}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 hover:border-red-300 cursor-pointer"
                  title="Delete Contract Renewal"
                >
                  <HiOutlineTrash className="size-3.5 shrink-0" />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
      <CreateRenewalModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
      <DocumentPreviewModal
        isOpen={Boolean(previewRenewalId)}
        onClose={() => setPreviewRenewalId(null)}
        title="Preview"
        iframeId="renewal-table-preview-iframe"
        iframeSrc={previewRenewalId ? `${BASE_URL}/renewals/${previewRenewalId}/pdf?token=${token}` : null}
        iframeTitle="Contract Renewal PDF Preview"
      />
    </div>
  );
}

export default Renewals;
