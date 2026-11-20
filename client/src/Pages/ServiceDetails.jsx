import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchService, recordServicePayment, deleteService } from "../slices/serviceSlice";
import EditServiceModal from "../Components/EditServiceModel";
import CreateInvoiceModal from "../Components/CreateInvoiceModel";
import DocumentPreviewModal from "../Components/DocumentPreviewModal";
import { useScrollLock } from "../hooks/useScrollLock";
import { useNavigate } from "react-router-dom";
import { FaArrowLeft } from "react-icons/fa";
import {
  isMultiDateFrequency,
  calculateServiceDates,
  isOneTimeJobService,
} from "../utils/serviceDateCalculator";
import { getServiceDocxUrl, getServicePdfUrl } from "../API/serviceAPI";
import { fetchInvoiceByServiceIdAPI } from "../API/invoiceAPI";
import {
  HiOutlineDocumentText,
  HiOutlineBanknotes,
  HiOutlinePlus,
  HiOutlinePencilSquare,
  HiOutlineClipboardDocumentList,
  HiOutlineXMark,
} from "react-icons/hi2";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";
import { formatDateOnly as formatDate, formatTimestamp } from "../utils/dateUtils";
import usePermission from "../hooks/usePermission";

function ServiceDetails() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isAdmin } = usePermission();

  const [showEditModal, setShowEditModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  useScrollLock(showPaymentModal);

  // Payment Form State
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    paymentDate: new Date().toISOString().split("T")[0],
    paymentMode: "Cash",
    note: "",
  });

  const [checkingInvoice, setCheckingInvoice] = useState(false);
  const [existingInvoice, setExistingInvoice] = useState(null);
  const [invoiceCheckError, setInvoiceCheckError] = useState(null);

  const { service, serviceLoading } = useSelector((state) => state.services);
  const token = useSelector((state) => state.auth.token);

  useEffect(() => {
    if (id) {
      dispatch(fetchService(id));
    }
  }, [dispatch, id]);

  const checkInvoiceStatus = async () => {
    if (!service || !service._id || !token || isOneTimeJobService(service)) return;
    setCheckingInvoice(true);
    setInvoiceCheckError(null);
    try {
      const res = await fetchInvoiceByServiceIdAPI(service._id, token);
      if (res.exists && res.invoice) {
        setExistingInvoice(res.invoice);
      } else {
        setExistingInvoice(null);
      }
    } catch (err) {
      console.error("Failed to check existing invoice:", err);
      const errMsg = getErrorMessage(err, "Failed to check invoice status");
      setInvoiceCheckError(errMsg);
      toast.error(errMsg);
    } finally {
      setCheckingInvoice(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    if (service && service._id === id && token && !isOneTimeJobService(service)) {
      setCheckingInvoice(true);
      setInvoiceCheckError(null);

      fetchInvoiceByServiceIdAPI(service._id, token)
        .then((res) => {
          if (!isMounted) return;
          if (res.exists && res.invoice) {
            setExistingInvoice(res.invoice);
          } else {
            setExistingInvoice(null);
          }
        })
        .catch((err) => {
          if (!isMounted) return;
          console.error("Failed to check existing invoice:", err);
          const errMsg = getErrorMessage(err, "Failed to check invoice status");
          setInvoiceCheckError(errMsg);
          toast.error(errMsg);
        })
        .finally(() => {
          if (isMounted) {
            setCheckingInvoice(false);
          }
        });
    } else {
      setCheckingInvoice(false);
      setExistingInvoice(null);
    }

    return () => {
      isMounted = false;
    };
  }, [service, id, token]);

  const statusStyles = {
    pending: "bg-yellow-100 text-yellow-700",
    active: "bg-blue-100 text-blue-700",
    due: "bg-red-100 text-red-700",
    expired: "bg-red-100 text-red-700",
    completed: "bg-green-100 text-green-700",
    cancelled: "bg-gray-100 text-gray-700",
  };

  const paymentStatusStyles = {
    Paid: "bg-emerald-100 text-emerald-800 border-emerald-300",
    "Partially Paid": "bg-amber-100 text-amber-800 border-amber-300",
    Unpaid: "bg-rose-100 text-rose-800 border-rose-300",
  };

  const isPageLoading = serviceLoading && (!service || service._id !== id);

  if (isPageLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        Loading...
      </div>
    );
  }

  if (!service) {
    return (
      <div className="flex justify-center items-center h-screen">
        Service Not Found
      </div>
    );
  }

  const isOneTime = isOneTimeJobService(service);
  const totalAmount = Number(service.totalAmount ?? service.amount ?? 0);
  const paidAmount = Number(service.paidAmount ?? 0);
  const balanceAmount = Number(
    service.balanceAmount !== undefined
      ? service.balanceAmount
      : Math.max(0, totalAmount - paidAmount)
  );
  const paymentStatus =
    service.paymentStatus ||
    (paidAmount >= totalAmount && totalAmount > 0
      ? "Paid"
      : paidAmount > 0
      ? "Partially Paid"
      : "Unpaid");

  // Fallback service occurrences for One Time Jobs
  const serviceOccurrences =
    Array.isArray(service.serviceOccurrences) && service.serviceOccurrences.length > 0
      ? service.serviceOccurrences
      : [
          {
            serviceNo: "1st Service / ONE TIME",
            date: service.serviceDate,
            time: service.serviceTime || "",
            operatorName: service.operatorName || service.employee?.fullName || "",
            amount: totalAmount,
            paymentStatus: paymentStatus,
            clientSignature: false,
            remark: "",
          },
        ];

  const handleDelete = async () => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this service?",
    );

    if (!confirmDelete) return;

    try {
      await dispatch(deleteService(service._id)).unwrap();
      navigate(isOneTime ? "/one-time-jobs" : "/services");
      toast.success("Service deleted successfully.");
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          "Failed to delete service. Please try again."
        )
      );
    }
  };

  const handleOpenPaymentModal = () => {
    setPaymentForm({
      amount: balanceAmount > 0 ? String(balanceAmount) : "",
      paymentDate: new Date().toISOString().split("T")[0],
      paymentMode: "Cash",
      note: "",
    });
    setShowPaymentModal(true);
  };

  const handleRecordPaymentSubmit = async (e) => {
    e.preventDefault();
    const enteredAmount = Number(paymentForm.amount);

    if (!enteredAmount || enteredAmount <= 0) {
      toast.error("Please enter a valid payment amount greater than 0.");
      return;
    }

    if (enteredAmount > balanceAmount) {
      toast.error(
        `Payment amount (₹${enteredAmount}) cannot exceed the outstanding balance of ₹${balanceAmount}.`
      );
      return;
    }

    try {
      setIsSubmittingPayment(true);
      await dispatch(
        recordServicePayment({
          id: service._id,
          paymentData: {
            amount: enteredAmount,
            receivedAmount: enteredAmount,
            paymentDate: paymentForm.paymentDate,
            date: paymentForm.paymentDate,
            paymentMode: paymentForm.paymentMode,
            mode: paymentForm.paymentMode,
            note: paymentForm.note,
            remark: paymentForm.note,
          },
        })
      ).unwrap();

      toast.success("Payment recorded successfully!");
      setShowPaymentModal(false);
      dispatch(fetchService(id));
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Failed to record payment. Please try again.")
      );
    } finally {
      setIsSubmittingPayment(false);
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

      <div className="bg-white rounded-3xl shadow-sm p-8 mb-6">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold">{service.serviceName}</h1>
              {isOneTime && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold font-mono bg-blue-50 text-blue-700 border border-blue-200">
                  Job No: {service.jobNo || service.customer?.jobNo || "-"}
                </span>
              )}
            </div>

            <p className="text-gray-500 mt-2">
              Created on {formatTimestamp(service.createdAt)}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {isOneTime && (
              <span
                className={`px-4 py-2 rounded-full text-sm font-semibold border ${
                  paymentStatusStyles[paymentStatus] || "bg-gray-100 text-gray-800 border-gray-300"
                }`}
              >
                Payment: {paymentStatus}
              </span>
            )}
            <span
              className={`px-4 py-2 rounded-full text-sm font-medium capitalize ${
                statusStyles[service.status]
              }`}
            >
              Service: {service.status}
            </span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-gray-500 text-sm">
            {isOneTime ? "Total Job Value" : "Contract Value"}
          </p>
          <h3 className="text-2xl font-bold mt-2">₹{totalAmount}</h3>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-gray-500 text-sm">Frequency</p>
          <h3 className="text-lg font-semibold mt-2 capitalize">
            {service.frequency}
          </h3>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-gray-500 text-sm">Service Date</p>
          <h3 className="text-lg font-semibold mt-2">
            {formatDate(service.serviceDate)}
          </h3>
        </div>

        {isOneTime ? (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-blue-100">
            <p className="text-gray-500 text-sm">Job No.</p>
            <h3 className="text-xl font-bold mt-2 font-mono text-blue-900">
              {service.jobNo || service.customer?.jobNo || "-"}
            </h3>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-gray-500 text-sm">Next Service</p>
            <h3 className="text-lg font-semibold mt-2">
              {formatDate(service.nextServiceDate, "N/A")}
            </h3>
          </div>
        )}
      </div>

      {/* One Time Job Payment Tracking Cards */}
      {isOneTime && (
        <div className="bg-white rounded-3xl p-6 shadow-sm mb-6 border border-slate-100">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5">
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2 text-slate-800">
                <HiOutlineBanknotes className="w-6 h-6 text-emerald-600" />
                Payment Tracking
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Track payments and balance for this One Time Job
              </p>
            </div>
            {balanceAmount > 0 ? (
              <button
                type="button"
                onClick={handleOpenPaymentModal}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              >
                <HiOutlinePlus className="w-4 h-4" />
                Record Payment
              </button>
            ) : (
              <span className="text-xs font-semibold px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg">
                ✓ Fully Paid
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                Total Amount
              </p>
              <p className="text-2xl font-bold text-slate-800 mt-1">
                ₹{totalAmount.toLocaleString()}
              </p>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <p className="text-xs text-emerald-600 font-medium uppercase tracking-wider">
                Paid Amount
              </p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">
                ₹{paidAmount.toLocaleString()}
              </p>
            </div>

            <div className={`rounded-2xl p-4 border ${balanceAmount > 0 ? "bg-rose-50 border-rose-200" : "bg-slate-50 border-slate-200"}`}>
              <p className={`text-xs font-medium uppercase tracking-wider ${balanceAmount > 0 ? "text-rose-600" : "text-slate-500"}`}>
                Balance Amount
              </p>
              <p className={`text-2xl font-bold mt-1 ${balanceAmount > 0 ? "text-rose-700" : "text-slate-700"}`}>
                ₹{balanceAmount.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Customer + Employee */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Customer */}
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">Customer Information</h2>
              {service.customer ? (
                <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-semibold">
                  Registered Customer
                </span>
              ) : isOneTime ? (
                <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full font-semibold">
                  Manual Customer
                </span>
              ) : null}
            </div>
            {service.customer?._id && (
              <button
                type="button"
                onClick={() => navigate(`/customers/${service.customer._id}`)}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                View Customer
              </button>
            )}
          </div>

          <div className="space-y-3">
            {isOneTime && (
              <div>
                <p className="text-sm text-gray-500">Job No.</p>
                <p className="font-mono font-semibold text-blue-900">
                  {service.jobNo || service.customer?.jobNo || "-"}
                </p>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-500">Name</p>
              <p className="font-medium">
                {service.customerName ||
                  service.customer?.fullName ||
                  service.customerSnapshot?.fullName ||
                  service.customerSnapshot?.customerName ||
                  "Not Available"}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Phone</p>
              <p className="font-medium">
                {service.contactNumber ||
                  service.customer?.phone ||
                  service.customerSnapshot?.phone ||
                  "Not Available"}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Email</p>
              <p className="font-medium">
                {service.customer?.email ||
                  service.customerSnapshot?.email ||
                  "Not Available"}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Address</p>
              <p className="font-medium">
                {service.address ||
                  service.customer?.address ||
                  service.customerSnapshot?.address ||
                  "Not Available"}
              </p>
            </div>
          </div>
        </div>

        {/* Operator / Employee */}
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-5">Assigned Operator / Employee</h2>

          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Name</p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="font-medium text-slate-900">
                  {service.operatorName || service.employee?.fullName || "Not Assigned"}
                </p>
                {service.operatorName && !service.employee && (
                  <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-medium">
                    Manual Operator
                  </span>
                )}
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-500">Role</p>
              <p className="font-medium text-slate-800">
                {service.employee?.role || (service.operatorName ? "Operator" : "Not Available")}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Phone</p>
              <p className="font-medium text-slate-800">
                {service.employee?.phone || "Not Available"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Service History Table for One Time Jobs (Requirement 4C) */}
      {isOneTime && (
        <div className="bg-white rounded-3xl p-6 shadow-sm mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2 text-slate-800">
                <HiOutlineClipboardDocumentList className="w-6 h-6 text-blue-600" />
                Service History Records
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Visual history of all service visits and complaints recorded under this One Time Job
              </p>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowEditModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              >
                <HiOutlinePlus className="w-4 h-4" />
                Add / Edit Service Records
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Service No.</th>
                  <th className="py-3 px-4">Service Date</th>
                  <th className="py-3 px-4">Service Time</th>
                  <th className="py-3 px-4">Operator Name</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Payment Status</th>
                  {isAdmin && <th className="py-3 px-4 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {serviceOccurrences.map((occ, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      {occ.serviceNo || `${idx + 1}${idx === 0 ? "st" : idx === 1 ? "nd" : idx === 2 ? "rd" : "th"} Service`}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">
                      {formatDate(occ.date)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {occ.time || "-"}
                    </td>
                    <td className="py-3.5 px-4 text-slate-800 font-medium">
                      {occ.operatorName || service.operatorName || service.employee?.fullName || "-"}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      {occ.amount !== undefined && occ.amount !== null ? `₹${occ.amount}` : "-"}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          paymentStatusStyles[occ.paymentStatus] ||
                          (occ.paymentStatus === "Paid"
                            ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                            : occ.paymentStatus === "Partially Paid"
                            ? "bg-amber-100 text-amber-800 border-amber-300"
                            : "bg-rose-100 text-rose-800 border-rose-300")
                        }`}
                      >
                        {occ.paymentStatus || "Unpaid"}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setShowEditModal(true)}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium text-xs bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                        >
                          <HiOutlinePencilSquare className="w-3.5 h-3.5" />
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment History Ledger for One Time Jobs (Requirement 4D) */}
      {isOneTime && (
        <div className="bg-white rounded-3xl p-6 shadow-sm mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2 text-slate-800">
                <HiOutlineBanknotes className="w-6 h-6 text-emerald-600" />
                Payment History Ledger
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Chronological record of all payments received towards this One Time Job
              </p>
            </div>
            {balanceAmount > 0 && (
              <button
                type="button"
                onClick={handleOpenPaymentModal}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              >
                <HiOutlinePlus className="w-4 h-4" />
                Record Payment
              </button>
            )}
          </div>

          {Array.isArray(service.paymentHistory) && service.paymentHistory.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Payment Date</th>
                    <th className="py-3 px-4">Amount Received</th>
                    <th className="py-3 px-4">Payment Mode</th>
                    <th className="py-3 px-4">Balance After</th>
                    <th className="py-3 px-4">Note / Ref</th>
                    <th className="py-3 px-4">Recorded At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {service.paymentHistory.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70 transition">
                      <td className="py-3.5 px-4 font-medium text-slate-900">
                        {formatDate(p.paymentDate || p.date)}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-emerald-700">
                        ₹{Number(p.amount ?? p.receivedAmount ?? 0).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">
                        <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                          {p.paymentMode || p.mode || "Cash"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 font-medium">
                        ₹{Number(p.balanceAfter ?? p.balance ?? 0).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {p.note || p.remark || "-"}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {formatTimestamp(p.recordedAt || p.date || p.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <HiOutlineBanknotes className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-600">No payment records yet</p>
              <p className="text-xs text-slate-400 mt-1">
                Record initial partial or full payments using the button above.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Regular Service Details */}
      <div className="bg-white rounded-3xl p-6 shadow-sm mb-6">
        <h2 className="text-xl font-semibold mb-5">Service Details</h2>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-gray-500">Service Name</p>
            <p className="font-medium">{service.serviceName}</p>
          </div>

          <div>
            <p className="text-sm text-gray-500">Frequency</p>
            <p className="font-medium capitalize">{service.frequency}</p>
          </div>

          <div>
            <p className="text-sm text-gray-500">Amount</p>
            <p className="font-medium">₹{service.amount}</p>
          </div>

          <div>
            <p className="text-sm text-gray-500">Status</p>
            <p className="font-medium capitalize">{service.status}</p>
          </div>
        </div>
      </div>

      {/* Upcoming Service Dates for multi-date frequencies */}
      {isMultiDateFrequency(service.frequency) && (
        <div className="bg-white rounded-3xl p-6 shadow-sm mb-6">
          <h2 className="text-xl font-semibold mb-4">Upcoming Service Dates</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {(Array.isArray(service.upcomingServiceDates) &&
            service.upcomingServiceDates.length > 0
              ? service.upcomingServiceDates
              : calculateServiceDates(service.serviceDate, service.frequency).upcomingServiceDates
            ).map((d, index) => {
              const dateObj = new Date(d);
              const isNext =
                service.nextServiceDate &&
                new Date(service.nextServiceDate).toDateString() === dateObj.toDateString();
              return (
                <div
                  key={index}
                  className={`p-3 rounded-xl border text-center ${
                    isNext
                      ? "border-blue-500 bg-blue-50 text-blue-800 font-semibold"
                      : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                >
                  <p className="text-xs text-slate-500">Service {index + 1}</p>
                  <p className="mt-1 text-sm">{formatDate(dateObj)}</p>
                  {isNext && (
                    <span className="inline-block mt-1 text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full">
                      Next Due
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Description */}
      {!isOneTime && (
        <div className="bg-white rounded-3xl p-6 shadow-sm mb-6">
          <h2 className="text-xl font-semibold mb-4">Description</h2>
          <p className="text-gray-700 leading-relaxed">
            {service.desc || "No description available"}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-4">
        {/* Invoice Action (Only for eligible non-one-time job services) */}
        {!isOneTime && (
          <>
            {checkingInvoice ? (
              <button
                type="button"
                disabled
                className="bg-slate-200 text-slate-500 px-6 py-3 rounded-xl font-medium flex items-center gap-2 cursor-not-allowed opacity-80"
              >
                <HiOutlineDocumentText className="w-5 h-5 animate-pulse" />
                Checking Invoice...
              </button>
            ) : invoiceCheckError ? (
              <button
                type="button"
                onClick={checkInvoiceStatus}
                className="bg-amber-100 text-amber-800 hover:bg-amber-200 px-6 py-3 rounded-xl font-medium flex items-center gap-2 cursor-pointer transition"
              >
                <HiOutlineDocumentText className="w-5 h-5" />
                Retry Invoice Check
              </button>
            ) : existingInvoice ? (
              <button
                type="button"
                onClick={() => navigate(`/invoices/${existingInvoice._id}`)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 cursor-pointer transition"
              >
                <HiOutlineDocumentText className="w-5 h-5" />
                View Invoice
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowInvoiceModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 cursor-pointer transition"
              >
                <HiOutlineDocumentText className="w-5 h-5" />
                Create Invoice
              </button>
            )}
          </>
        )}

        {isOneTime && (
          <>
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="bg-slate-900 hover:bg-black text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition cursor-pointer"
            >
              <HiOutlineDocumentText className="w-5 h-5" />
              Generate Service Paper
            </button>

            {balanceAmount > 0 && (
              <button
                type="button"
                onClick={handleOpenPaymentModal}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition cursor-pointer"
              >
                <HiOutlineBanknotes className="w-5 h-5" />
                Record Payment
              </button>
            )}
          </>
        )}

        {isAdmin && (
          <>
            <button
              className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-3 rounded-xl font-medium cursor-pointer"
              onClick={() => setShowEditModal(true)}
            >
              {isOneTime ? "Edit One Time Job" : "Edit Service"}
            </button>

            <button
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl font-medium cursor-pointer"
              onClick={handleDelete}
            >
              {isOneTime ? "Delete One Time Job" : "Delete Service"}
            </button>
          </>
        )}
      </div>

      {/* Record Payment Modal */}
      {showPaymentModal &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-payment-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto overscroll-contain animate-in fade-in duration-200"
            onClick={(e) => {
              if (e.target === e.currentTarget && !isSubmittingPayment) {
                setShowPaymentModal(false);
              }
            }}
          >
            <div
              className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 border border-slate-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white shrink-0">
                <div>
                  <h3 id="record-payment-title" className="text-lg font-bold">
                    Record Payment
                  </h3>
                  <p className="text-xs text-slate-300">
                    {service.serviceName} • Job No: {service.jobNo || service.customer?.jobNo || "-"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  disabled={isSubmittingPayment}
                  aria-label="Close record payment dialog"
                  className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer disabled:opacity-50"
                >
                  <HiOutlineXMark className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleRecordPaymentSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
                {/* Balances Display */}
                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-center">
                  <div>
                    <p className="text-[11px] text-slate-500 uppercase font-semibold">Total</p>
                    <p className="text-sm font-bold text-slate-800">₹{totalAmount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-emerald-600 uppercase font-semibold">Paid</p>
                    <p className="text-sm font-bold text-emerald-700">₹{paidAmount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-rose-600 uppercase font-semibold">Balance</p>
                    <p className="text-sm font-bold text-rose-700">₹{balanceAmount.toLocaleString()}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Payment Amount Received (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={balanceAmount}
                    step="0.01"
                    required
                    value={paymentForm.amount}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, amount: e.target.value })
                    }
                    placeholder={`Max ₹${balanceAmount}`}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-lg"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Remaining balance after this payment: ₹
                    {Math.max(0, balanceAmount - Number(paymentForm.amount || 0)).toLocaleString()}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                      Payment Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={paymentForm.paymentDate}
                      onChange={(e) =>
                        setPaymentForm({ ...paymentForm, paymentDate: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                      Payment Mode <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={paymentForm.paymentMode}
                      onChange={(e) =>
                        setPaymentForm({ ...paymentForm, paymentMode: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white"
                    >
                      <option value="Cash">Cash</option>
                      <option value="GPay / UPI">GPay / UPI</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Bank Transfer">Bank Transfer / NEFT</option>
                      <option value="Card">Card</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Note / Reference Details (Optional)
                  </label>
                  <input
                    type="text"
                    value={paymentForm.note}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, note: e.target.value })
                    }
                    placeholder="e.g. UPI Ref #, Cheque #, or Payer Name"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    disabled={isSubmittingPayment}
                    className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-sm transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingPayment}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSubmittingPayment ? "Recording..." : "Record Payment"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Document Preview */}
      <DocumentPreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        title="One Time Job Service Paper Preview"
        icon={<HiOutlineDocumentText className="w-6 h-6 text-blue-600" />}
        iframeId="service-paper-preview-iframe"
        iframeSrc={getServicePdfUrl(service._id, token)}
        iframeTitle="One Time Job Service Paper Preview"
        extraActions={
          <>
            <a
              href={getServicePdfUrl(service._id, token)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-black transition cursor-pointer"
            >
              Download PDF
            </a>
            <a
              href={getServiceDocxUrl(service._id, token)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition cursor-pointer"
            >
              Download DOCX
            </a>
          </>
        }
      />

      {showEditModal && (
        <EditServiceModal
          service={service}
          onClose={() => setShowEditModal(false)}
        />
      )}

      {showInvoiceModal && (
        <CreateInvoiceModal
          isOpen={showInvoiceModal}
          onClose={() => setShowInvoiceModal(false)}
          initialCustomer={service.customer}
          initialService={service}
          onCreated={(createdInv) => {
            const invId = createdInv?._id || createdInv?.invoice?._id;
            if (invId) {
              navigate(`/invoices/${invId}`);
            } else {
              checkInvoiceStatus();
            }
          }}
        />
      )}
    </div>
  );
}

export default ServiceDetails;
