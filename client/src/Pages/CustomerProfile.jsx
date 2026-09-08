import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import EditCustomerModal from "../Components/EditCustomerModel";
import CreateServiceModal from "../Components/CreateServiceModel";
import CreateInvoiceModal from "../Components/CreateInvoiceModel";
import CreateQuotationModal from "../Components/CreateQuotationModel";

import {
  fetchCustomerById,
  removeCustomer,
} from "../slices/customerSlice";
import { fetchServices } from "../slices/serviceSlice";
import { fetchInvoices } from "../slices/invoiceSlice";
import { fetchEmployees } from "../slices/employeeSlice";
import { fetchCustomerQuotations } from "../slices/quotationSlice";
import { fetchRenewals } from "../slices/renewalSlice";
import { FaArrowLeft } from "react-icons/fa";
import {
  isMultiDateFrequency,
  calculateServiceDates,
} from "../utils/serviceDateCalculator";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";

function CustomerProfile() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get("tab") || "info";

  const [showEditModal, setShowEditModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showQuotationModal, setShowQuotationModal] = useState(false);
  const [quotationType, setQuotationType] = useState("PC");

  const { selectedCustomer, loading } = useSelector((state) => state.customer);
  const servicesState = useSelector((state) => state.services);
  const invoiceState = useSelector((state) => state.invoice);
  const quotationState = useSelector((state) => state.quotation);
  const renewalState = useSelector((state) => state.renewal || {});

  const services = servicesState.services || [];
  const invoices = invoiceState.invoices || [];
  const quotations = Array.isArray(quotationState.quotations)
    ? quotationState.quotations
    : [];
  const renewals = Array.isArray(renewalState.renewals) ? renewalState.renewals : [];

  useEffect(() => {
    dispatch(fetchCustomerById(id));
    dispatch(fetchServices());
    dispatch(fetchInvoices());
    dispatch(fetchEmployees());
    dispatch(fetchCustomerQuotations(id));
    dispatch(fetchRenewals());
  }, [dispatch, id]);

  const openTab = (tabName) => {
    setSearchParams({ tab: tabName });
  };

  const getCustomerId = (data) => {
    if (!data) return "";

    if (typeof data === "string") {
      return data;
    }

    return data._id;
  };

  const customerServices = services.filter((service) => {
    return String(getCustomerId(service.customer)) === String(id);
  });

  const customerInvoices = invoices.filter((invoice) => {
    return String(getCustomerId(invoice.customer)) === String(id);
  });

  const customerQuotations = quotations.filter((quotation) => {
    return String(getCustomerId(quotation.customer)) === String(id);
  });

  const customerRenewals = renewals.filter((renewal) => {
    return String(getCustomerId(renewal.customer)) === String(id);
  });

  const getQuotationTotal = (quotation) => {
    const quotationServices = Array.isArray(quotation.services)
      ? quotation.services
      : [];

    return quotationServices.reduce(
      (total, service) => total + Number(service.cost || 0),
      0,
    );
  };

  const formatDate = (date) => {
    if (!date) return "-";

    return new Date(date).toLocaleDateString();
  };

  const handleDelete = async () => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this customer?",
    );

    if (!confirmDelete) return;

    try {
      const result = await dispatch(removeCustomer(selectedCustomer._id));

      if (removeCustomer.fulfilled.match(result)) {
        navigate("/");
        toast.success("Customer deleted successfully.");
      } else {
        toast.error(
          getErrorMessage(
            result.payload || result.error,
            "Failed to delete customer. Please try again."
          )
        );
      }
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          "Failed to delete customer. Please try again."
        )
      );
    }
  };

  if (loading && !selectedCustomer) {
    return (
      <div className="bg-white rounded-2xl shadow p-6">
        Loading customer...
      </div>
    );
  }

  if (!selectedCustomer) {
    return (
      <div className="bg-white rounded-2xl shadow p-6">
        Customer not found
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6 lg:p-8">
      <button
        onClick={() => navigate("/")}
        className="mb-4 bg-white px-4 py-2 rounded-lg shadow hover:bg-slate-100 flex items-center gap-2"
      >
        <FaArrowLeft />Back
      </button>

      <div className="bg-white rounded-3xl shadow p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-blue-500 to-blue-800/80 text-white flex items-center justify-center text-5xl font-bold">
              {selectedCustomer.fullName?.charAt(0)?.toUpperCase()}
            </div>

            <div>
              <h1 className="text-3xl font-bold">
                {selectedCustomer.fullName}
              </h1>

              <p className="text-gray-500 mt-1">
                Customer ID: {selectedCustomer._id}
              </p>

              <p className="text-gray-700 mt-1">
                {selectedCustomer.phone}
              </p>

              <span
                className={`inline-block mt-3 px-3 py-1 rounded-full text-sm capitalize ${
                  selectedCustomer.status === "active"
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {selectedCustomer.status}
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowEditModal(true)}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              Edit
            </button>

            <button
              onClick={handleDelete}
              className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mt-8 border-b">
          <button
            onClick={() => openTab("info")}
            className={`px-5 py-3 ${
              activeTab === "info"
                ? "border-b-4 border-cyan-600 text-cyan-700 font-semibold"
                : "text-gray-500"
            }`}
          >
            Customer Info
          </button>

          <button
            onClick={() => openTab("services")}
            className={`px-5 py-3 ${
              activeTab === "services"
                ? "border-b-4 border-cyan-600 text-cyan-700 font-semibold"
                : "text-gray-500"
            }`}
          >
            Services ({customerServices.length})
          </button>

          <button
            onClick={() => openTab("renewals")}
            className={`px-5 py-3 ${
              activeTab === "renewals"
                ? "border-b-4 border-cyan-600 text-cyan-700 font-semibold"
                : "text-gray-500"
            }`}
          >
            Contract Renewals ({customerRenewals.length})
          </button>

          <button
            onClick={() => openTab("invoices")}
            className={`px-5 py-3 ${
              activeTab === "invoices"
                ? "border-b-4 border-cyan-600 text-cyan-700 font-semibold"
                : "text-gray-500"
            }`}
          >
            Invoices ({customerInvoices.length})
          </button>

          <button
            onClick={() => openTab("quotations")}
            className={`px-5 py-3 ${
              activeTab === "quotations"
                ? "border-b-4 border-cyan-600 text-cyan-700 font-semibold"
                : "text-gray-500"
            }`}
          >
            Quotations ({customerQuotations.length})
          </button>

          <button
            onClick={() => openTab("other")}
            className={`px-5 py-3 ${
              activeTab === "other"
                ? "border-b-4 border-cyan-600 text-cyan-700 font-semibold"
                : "text-gray-500"
            }`}
          >
            Other
          </button>
        </div>

        <div className="mt-6">
          {activeTab === "info" && (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="border rounded-2xl p-5">
                <h2 className="text-xl font-semibold mb-4">
                  Contact Information
                </h2>

                <p>
                  <strong>Phone:</strong> {selectedCustomer.phone}
                </p>
                <p className="mt-2">
                  <strong>Alternate Phone:</strong>{" "}
                  {selectedCustomer.alternatePhone || "-"}
                </p>
                <p className="mt-2">
                  <strong>Email:</strong> {selectedCustomer.email || "-"}
                </p>
              </div>

              <div className="border rounded-2xl p-5">
                <h2 className="text-xl font-semibold mb-4">
                  Customer Details
                </h2>

                <p className="capitalize">
                  <strong>Type:</strong> {selectedCustomer.customerType}
                </p>
                <p className="mt-2">
                  <strong>Company:</strong>{" "}
                  {selectedCustomer.companyName || "-"}
                </p>
                <p className="mt-2 capitalize">
                  <strong>Status:</strong> {selectedCustomer.status}
                </p>
              </div>

              <div className="border rounded-2xl p-5 md:col-span-2">
                <h2 className="text-xl font-semibold mb-4">Address</h2>
                <p>{selectedCustomer.address}</p>
              </div>
            </div>
          )}

          {activeTab === "services" && (
            <div>
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-semibold">Services</h2>

                <button
                  onClick={() => setShowServiceModal(true)}
                  className="bg-cyan-600 text-white px-4 py-2 rounded-lg"
                >
                  Add Service
                </button>
              </div>

              {servicesState.loading && <p>Loading services...</p>}

              {!servicesState.loading && customerServices.length === 0 && (
                <div className="bg-slate-100 rounded-2xl p-8 text-center text-gray-500">
                  No services found for this customer.
                </div>
              )}

              <div className="space-y-4">
                {customerServices.map((service) => (
                  <div
                    key={service._id}
                    onClick={() => navigate(`/services/${service._id}`)}
                    className="border rounded-2xl p-5 cursor-pointer hover:bg-slate-50"
                  >
                    <div className="flex justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-lg">
                          {service.serviceName}
                        </h3>
                        <p className="text-gray-500">
                          Frequency: {service.frequency}
                        </p>
                        {isMultiDateFrequency(service.frequency) ? (
                          <p className="text-gray-500">
                            Upcoming Dates:{" "}
                            {(Array.isArray(service.upcomingServiceDates) &&
                            service.upcomingServiceDates.length > 0
                              ? service.upcomingServiceDates
                              : calculateServiceDates(
                                  service.serviceDate,
                                  service.frequency
                                ).upcomingServiceDates
                            )
                              .map((d) => formatDate(d))
                              .join(", ")}
                          </p>
                        ) : (
                          <p className="text-gray-500">
                            Next Service: {formatDate(service.nextServiceDate)}
                          </p>
                        )}
                        <p className="text-gray-500">
                          Assigned To: {service.employee?.fullName || "-"}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="font-semibold">Rs. {service.amount}</p>
                        <p className="capitalize text-sm text-gray-500">
                          {service.status}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "renewals" && (
            <div>
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-semibold">Contract Renewals (AMC)</h2>
              </div>

              {renewalState.loading && <p>Loading contract renewals...</p>}

              {!renewalState.loading && customerRenewals.length === 0 && (
                <div className="bg-slate-100 rounded-2xl p-8 text-center text-gray-500">
                  No contract renewals found for this customer.
                </div>
              )}

              {customerRenewals.length > 0 && (
                <div className="overflow-x-auto border rounded-2xl">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b">
                      <tr>
                        <th className="p-3">Contract No</th>
                        <th className="p-3">Service Name</th>
                        <th className="p-3">Frequency</th>
                        <th className="p-3">Total Amount</th>
                        <th className="p-3">Contract End Date</th>
                        <th className="p-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {customerRenewals.map((renewal) => (
                        <tr key={renewal._id} className="hover:bg-slate-50">
                          <td className="p-3 font-semibold text-slate-800">
                            {renewal.renewalNumber}
                          </td>
                          <td className="p-3">
                            {renewal.services?.map((s) => s.serviceName).join(", ") || "Pest Control"}
                          </td>
                          <td className="p-3">{renewal.services?.[0]?.frequency || renewal.paymentTerm || "-"}</td>
                          <td className="p-3 font-medium">₹{Number(renewal.totalAmount || 0).toLocaleString("en-IN")}</td>
                          <td className="p-3">{formatDate(renewal.contractEndDate)}</td>
                          <td className="p-3">
                            <button
                              onClick={() => navigate(`/renewals/${renewal._id}`)}
                              className="bg-cyan-600 text-white px-3 py-1 rounded-lg text-sm"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "invoices" && (
            <div>
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-semibold">Invoices</h2>

                <button
                  onClick={() => setShowInvoiceModal(true)}
                  className="bg-cyan-600 text-white px-4 py-2 rounded-lg"
                >
                  Create Invoice
                </button>
              </div>

              {invoiceState.loading && <p>Loading invoices...</p>}

              {!invoiceState.loading && customerInvoices.length === 0 && (
                <div className="bg-slate-100 rounded-2xl p-8 text-center text-gray-500">
                  No invoices found for this customer.
                </div>
              )}

              {customerInvoices.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full border">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="text-left p-3">Invoice No</th>
                        <th className="text-left p-3">Amount</th>
                        <th className="text-left p-3">Status</th>
                        <th className="text-left p-3">Due Date</th>
                        <th className="text-left p-3">Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {customerInvoices.map((invoice) => (
                        <tr key={invoice._id} className="border-t">
                          <td className="p-3">{invoice.invoiceNumber}</td>
                          <td className="p-3">Rs. {invoice.totalAmount}</td>
                          <td className="p-3">{invoice.paymentStatus}</td>
                          <td className="p-3">{formatDate(invoice.dueDate)}</td>
                          <td className="p-3">
                            <button
                              onClick={() =>
                                navigate(`/invoices/${invoice._id}`)
                              }
                              className="bg-blue-600 text-white px-3 py-1 rounded-lg"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "quotations" && (
            <div>
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-semibold">Quotations</h2>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setQuotationType("PC");
                      setShowQuotationModal(true);
                    }}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white px-3.5 py-2 rounded-lg text-sm font-medium transition cursor-pointer"
                  >
                    + PC Quotation
                  </button>
                  <button
                    onClick={() => {
                      setQuotationType("ATT");
                      setShowQuotationModal(true);
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-lg text-sm font-medium transition cursor-pointer shadow-sm"
                  >
                    + ATT Quotation
                  </button>
                </div>
              </div>

              {quotationState.loading && (
                <p>Loading quotations...</p>
              )}

              {quotationState.error && (
                <div className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">
                  {quotationState.error}
                </div>
              )}

              {!quotationState.loading &&
                customerQuotations.length === 0 && (
                  <div className="bg-slate-100 rounded-2xl p-8 text-center text-gray-500">
                    No quotations found for this customer.
                  </div>
                )}

              {customerQuotations.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full border">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="text-left p-3">Quotation No</th>
                        <th className="text-left p-3">Date</th>
                        <th className="text-left p-3">Services / Treatments</th>
                        <th className="text-left p-3">Total</th>
                        <th className="text-left p-3">Status</th>
                        <th className="text-left p-3">Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {customerQuotations.map((quotation) => (
                        <tr key={quotation._id} className="border-t">
                          <td className="p-3 font-medium">
                            <div className="flex items-center gap-1.5">
                              <span>{quotation.quotationNumber}</span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                                  quotation.quotationType === "ATT"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-blue-100 text-blue-800"
                                }`}
                              >
                                {quotation.quotationType || "PC"}
                              </span>
                            </div>
                          </td>
                          <td className="p-3">
                            {formatDate(quotation.quotationDate)}
                          </td>
                          <td className="p-3">
                            {quotation.quotationType === "ATT"
                              ? `${quotation.treatments?.length || 0} treatments`
                              : `${quotation.services?.length || 0} services`}
                          </td>
                          <td className="p-3">
                            {quotation.quotationType === "ATT"
                              ? "-"
                              : `₹${getQuotationTotal(quotation).toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`}
                          </td>
                          <td className="p-3">
                            <span
                              className={`rounded-full px-3 py-1 text-sm ${
                                quotation.status === "Accepted"
                                  ? "bg-green-100 text-green-700"
                                  : quotation.status === "Rejected"
                                    ? "bg-red-100 text-red-700"
                                    : quotation.status === "Sent"
                                      ? "bg-blue-100 text-blue-700"
                                      : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {quotation.status}
                            </span>
                          </td>
                          <td className="p-3">
                            <button
                              onClick={() =>
                                navigate(
                                  `/quotations/${quotation._id}`,
                                )
                              }
                              className="bg-blue-600 text-white px-3 py-1 rounded-lg"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "other" && (
            <div className="bg-slate-100 rounded-2xl p-8 text-center text-gray-500">
              Other customer related information will show here.
            </div>
          )}
        </div>
      </div>

      <EditCustomerModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        customer={selectedCustomer}
      />

      {showServiceModal && (
        <CreateServiceModal
          onClose={() => setShowServiceModal(false)}
          initialCustomer={selectedCustomer}
          onCreated={() => dispatch(fetchServices())}
        />
      )}

      <CreateInvoiceModal
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        initialCustomer={selectedCustomer}
        onCreated={() => dispatch(fetchInvoices())}
      />

      <CreateQuotationModal
        isOpen={showQuotationModal}
        initialType={quotationType}
        onClose={() => setShowQuotationModal(false)}
        initialCustomer={selectedCustomer}
        onCreated={() => dispatch(fetchCustomerQuotations(id))}
      />
    </div>
  );
}

export default CustomerProfile;
