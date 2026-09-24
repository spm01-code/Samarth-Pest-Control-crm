import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import { BASE_URL } from "../API/apiConfig";
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
        iframeSrc={`${BASE_URL}/quotations/${id}/pdf?token=${token}`}
        iframeTitle="Quotation PDF Preview"
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
