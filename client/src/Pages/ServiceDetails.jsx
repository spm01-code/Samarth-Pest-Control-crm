import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchService } from "../slices/serviceSlice";
import EditServiceModal from "../Components/EditServiceModel";
import CreateInvoiceModal from "../Components/CreateInvoiceModel";
import DocumentPreviewModal from "../Components/DocumentPreviewModal";
import { deleteService } from "../slices/serviceSlice";
import { useNavigate } from "react-router-dom";
import { FaArrowLeft } from "react-icons/fa";
import {
  isMultiDateFrequency,
  calculateServiceDates,
  isOneTimeJobService,
} from "../utils/serviceDateCalculator";
import { getServiceDocxUrl, getServicePdfUrl } from "../API/serviceAPI";
import { fetchInvoiceByServiceIdAPI } from "../API/invoiceAPI";
import { HiOutlineDocumentText } from "react-icons/hi2";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";

function ServiceDetails() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [showEditModal, setShowEditModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

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

  const handleDelete = async () => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this service?",
    );

    if (!confirmDelete) return;

    try {
      await dispatch(deleteService(service._id)).unwrap();
      navigate("/services");
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
            <h1 className="text-3xl font-bold">{service.serviceName}</h1>

            <p className="text-gray-500 mt-2">
              Created on {new Date(service.createdAt).toLocaleDateString()}
            </p>
          </div>

          <span
            className={`self-start px-4 py-2 rounded-full text-sm font-medium capitalize ${
              statusStyles[service.status]
            }`}
          >
            {service.status}
          </span>
        </div>
      </div>

      {/* Summary Cards */}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-gray-500 text-sm">Contract Value</p>

          <h3 className="text-2xl font-bold mt-2">₹{service.amount}</h3>
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
            {new Date(service.serviceDate).toLocaleDateString()}
          </h3>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-gray-500 text-sm">Next Service</p>

          <h3 className="text-lg font-semibold mt-2">
            {service.nextServiceDate
              ? new Date(service.nextServiceDate).toLocaleDateString()
              : "N/A"}
          </h3>
        </div>
      </div>

      {/* Customer + Employee */}

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Customer */}

        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-5">Customer Information</h2>

          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Name</p>

              <p className="font-medium">{service.customer?.fullName}</p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Phone</p>

              <p className="font-medium">{service.customer?.phone}</p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Email</p>

              <p className="font-medium">
                {service.customer?.email || "Not Available"}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Address</p>

              <p className="font-medium">{service.address}</p>
            </div>
          </div>
        </div>

        {/* Employee */}

        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-5">Assigned Employee</h2>

          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Name</p>

              <p className="font-medium">{service.employee?.fullName}</p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Role</p>

              <p className="font-medium">{service.employee?.role}</p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Phone</p>

              <p className="font-medium">{service.employee?.phone}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Service Details */}

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
                  <p className="mt-1 text-sm">{dateObj.toLocaleDateString("en-IN")}</p>
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

      <div className="bg-white rounded-3xl p-6 shadow-sm mb-6">
        <h2 className="text-xl font-semibold mb-4">Description</h2>

        <p className="text-gray-700 leading-relaxed">
          {service.desc || "No description available"}
        </p>
      </div>

      {/* Actions */}

      <div className="flex flex-wrap gap-4">
        {/* Invoice Action (Only for eligible non-one-time job services) */}
        {!isOneTimeJobService(service) && (
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

        {isOneTimeJobService(service) && (
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="bg-slate-900 hover:bg-black text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition cursor-pointer"
          >
            <HiOutlineDocumentText className="w-5 h-5" />
            Generate Service Paper
          </button>
        )}

        <button
          className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-3 rounded-xl font-medium cursor-pointer"
          onClick={() => setShowEditModal(true)}
        >
          Edit Service
        </button>

        <button className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl font-medium cursor-pointer"
        onClick={handleDelete}
        >
          Delete Service
        </button>
      </div>

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