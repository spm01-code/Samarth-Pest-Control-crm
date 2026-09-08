import { useEffect, useState } from "react";
import { FaPlus } from "react-icons/fa";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import CreateRenewalModal from "../Components/CreateRenewalModal";
import { deleteRenewal, fetchRenewals } from "../slices/renewalSlice";
import { HiOutlineEye, HiOutlinePrinter, HiOutlineTrash } from "react-icons/hi2";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";

function Renewals() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { renewals = [], loading, error } = useSelector((state) => state.renewal);

  useEffect(() => {
    dispatch(fetchRenewals());
  }, [dispatch]);

  const formatDate = (date) => (date ? new Date(date).toLocaleDateString() : "-");

  const renewalList = Array.isArray(renewals) ? renewals : [];

  const filteredRenewals = renewalList.filter((renewal) => {
    return (
      (renewal.renewalNumber?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (renewal.customer?.fullName?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (renewal.customer?.address?.toLowerCase() || "").includes(search.toLowerCase())
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
          placeholder="Search by Renewal No, Customer, or Address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-4 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600 text-sm"
        />
      </div>

      {error && <p className="mb-5 rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}
      {loading && <p className="py-10 text-center">Loading renewals...</p>}
      {!loading && filteredRenewals.length === 0 && (
        <p className="rounded-xl bg-white p-10 text-center text-gray-500 shadow-sm">
          No contract renewals found
        </p>
      )}
      {!loading && filteredRenewals.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-4 text-left">Renewal No</th>
                  <th className="p-4 text-left">Customer</th>
                  <th className="p-4 text-left">Address</th>
                  <th className="p-4 text-left">Date</th>
                  <th className="p-4 text-left">Status</th>
                  <th className="p-4 text-left whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRenewals.map((renewal) => (
                  <tr key={renewal._id} className="border-t hover:bg-slate-50">
                    <td className="p-4 font-medium">{renewal.renewalNumber}</td>
                    <td className="p-4">{renewal.customer?.fullName || "N/A"}</td>
                    <td className="max-w-xs truncate p-4">
                      {renewal.customer?.address || "-"}
                    </td>
                    <td className="p-4">{formatDate(renewal.renewalDate)}</td>
                    <td className="p-4">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700">
                        {renewal.status}
                      </span>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => navigate(`/renewals/${renewal._id}`)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 hover:border-blue-300 hover:text-blue-800 cursor-pointer !shadow-none active:!translate-y-0"
                          title="View Renewal Details"
                        >
                          <HiOutlineEye className="size-3.5 shrink-0" />
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/renewals/${renewal._id}/print`)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 hover:border-slate-300 hover:text-slate-900 cursor-pointer !shadow-none active:!translate-y-0"
                          title="Print Renewal"
                        >
                          <HiOutlinePrinter className="size-3.5 shrink-0" />
                          Print
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(renewal._id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 hover:border-red-300 hover:text-red-700 cursor-pointer !shadow-none active:!translate-y-0"
                          title="Delete Contract Renewal"
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
      <CreateRenewalModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </div>
  );
}

export default Renewals;
