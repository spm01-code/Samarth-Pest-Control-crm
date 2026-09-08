import { useEffect, useState } from "react";
import { FaArrowLeft } from "react-icons/fa";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import { deleteRenewal, fetchRenewalById } from "../slices/renewalSlice";
import DocumentPreviewModal from "../Components/DocumentPreviewModal";
import CreateRenewalModal from "../Components/CreateRenewalModal";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";

function RenewalDetails() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const { renewal, loading, error } = useSelector((state) => state.renewal);
  const token = useSelector((state) => state.auth.token);

  useEffect(() => {
    dispatch(fetchRenewalById(id));
  }, [dispatch, id]);

  const handleDelete = async () => {
    const confirmed = window.confirm("Are you sure you want to delete this contract renewal?");

    if (!confirmed) return;

    setDeleting(true);
    setDeleteError("");

    try {
      await dispatch(deleteRenewal(id)).unwrap();
      navigate("/renewals");
      toast.success("Contract renewal deleted successfully.");
    } catch (deleteRequestError) {
      const msg = getErrorMessage(
        deleteRequestError,
        "Failed to delete contract renewal. Please try again."
      );
      setDeleteError(msg);
      toast.error(msg);
      setDeleting(false);
    }
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

  if (loading && (!renewal || renewal._id !== id)) {
    return <div className="p-10 text-center">Loading contract renewal...</div>;
  }

  if (error && (!renewal || renewal._id !== id)) {
    return <div className="p-10 text-center text-red-700">{error}</div>;
  }

  if (!renewal || renewal._id !== id) return null;

  const customer = renewal.customer || {};
  const services = Array.isArray(renewal.services) ? renewal.services : [];

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6 lg:p-8">
      <button
        type="button"
        onClick={() => navigate("/renewals")}
        className="mb-5 flex items-center gap-2 rounded-lg bg-white px-4 py-2 shadow-sm hover:bg-slate-50"
      >
        <FaArrowLeft /> Back
      </button>

      <div className="rounded-3xl bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-blue-600">
              Contract Renewal
            </p>
            <h1 className="mt-2 text-3xl font-bold">{renewal.renewalNumber}</h1>
            <p className="mt-2 text-gray-500">
              Issued on {formatDate(renewal.renewalDate)}
            </p>
          </div>
          <span className="self-start rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
            {renewal.status || "Draft"}
          </span>
        </div>
      </div>

      <div className="mb-6 mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Total Value</p>
          <p className="mt-2 text-2xl font-bold">
            ₹{formatAmount(renewal.totalAmount)}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Services Included</p>
          <p className="mt-2 text-2xl font-bold">{services.length}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Payment Term</p>
          <p className="mt-2 font-semibold">
            {renewal.paymentTerm || "-"}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Contract Period</p>
          <p className="mt-2 text-sm font-semibold truncate" title={renewal.contractPeriod}>
            {renewal.contractPeriod || "-"}
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-5">Customer Information</h2>
          <dl className="grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-gray-500">Name</dt>
              <dd className="mt-1 font-medium">{customer.fullName || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Company</dt>
              <dd className="mt-1 font-medium">{customer.companyName || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Phone</dt>
              <dd className="mt-1 font-medium">{customer.phone || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Email</dt>
              <dd className="mt-1 break-words font-medium">{customer.email || "-"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm text-gray-500">Customer Address</dt>
              <dd className="mt-1 whitespace-pre-line font-medium">
                {customer.address || "-"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-5">Contract Information</h2>
          <dl className="grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-gray-500">Contract Start Date</dt>
              <dd className="mt-1 font-medium">{formatDate(renewal.contractStartDate)}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Contract End Date</dt>
              <dd className="mt-1 font-medium">{formatDate(renewal.contractEndDate)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm text-gray-500">Amount in Words</dt>
              <dd className="mt-1 font-medium">{renewal.amountInWords || "-"}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="mb-6 overflow-hidden rounded-3xl bg-white shadow-sm">
        <div className="border-b p-6">
          <h2 className="text-xl font-semibold">Services</h2>
        </div>

        {services.length === 0 ? (
          <p className="p-6 text-gray-500">
            No services were added to this contract renewal.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-slate-50 text-left text-sm text-gray-500">
                <tr>
                  <th className="p-4 font-medium">#</th>
                  <th className="p-4 font-medium">Service</th>
                  <th className="p-4 font-medium">Frequency</th>
                  <th className="p-4 font-medium">Location</th>
                  <th className="p-4 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service, index) => (
                  <tr key={service._id || index} className="border-t">
                    <td className="p-4 text-gray-500">{index + 1}</td>
                    <td className="p-4 font-medium">{service.serviceName}</td>
                    <td className="p-4">{service.frequency}</td>
                    <td className="p-4 max-w-xs truncate">{service.address || "-"}</td>
                    <td className="p-4 text-right font-medium">
                      ₹{formatAmount(service.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 bg-slate-50">
                <tr>
                  <td colSpan="4" className="p-4 text-right font-semibold">
                    Total
                  </td>
                  <td className="p-4 text-right text-lg font-bold">
                    ₹{formatAmount(renewal.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Notes</h2>
        <p className="whitespace-pre-line leading-relaxed text-gray-700">
          {renewal.notes || "No notes added."}
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
          onClick={() => setShowPreview(true)}
          className="rounded-xl bg-slate-900 px-6 py-3 font-medium text-white hover:bg-black"
        >
          Preview PDF
        </button>
        <button
          type="button"
          onClick={() => setShowEditModal(true)}
          className="rounded-xl bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
        >
          Edit Renewal
        </button>
        {customer._id && (
          <button
            type="button"
            onClick={() => navigate(`/customers/${customer._id}`)}
            className="rounded-xl bg-cyan-600 px-6 py-3 font-medium text-white hover:bg-cyan-700"
          >
            View Customer
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-xl bg-red-600 px-6 py-3 font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {deleting ? "Deleting..." : "Delete Renewal"}
        </button>
      </div>

      <DocumentPreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        title="Preview"
        iframeId="renewal-preview-iframe"
        iframeSrc={`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/renewals/${id}/pdf?token=${token}`}
        iframeTitle="Contract Renewal PDF Preview"
        onPrint={() => {
          window.open(
            `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/renewals/${id}/pdf?token=${token}`,
            "_blank"
          );
        }}
      />

      {showEditModal && (
        <CreateRenewalModal
          isOpen={showEditModal}
          initialRenewal={renewal}
          onClose={() => setShowEditModal(false)}
          onUpdated={() => dispatch(fetchRenewalById(id))}
        />
      )}
    </div>
  );
}
export default RenewalDetails;
