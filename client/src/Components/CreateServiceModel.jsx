import { useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import { createService } from "../slices/serviceSlice";
import {
  calculateServiceDates,
  isMultiDateFrequency,
} from "../utils/serviceDateCalculator";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";
import { formatDateOnly as formatDate } from "../utils/dateUtils";
import { useScrollLock } from "../hooks/useScrollLock";
import { PAYMENT_BASIS_OPTIONS } from "../utils/paymentBasis";

function CreateServiceModal({
  onClose,
  initialCustomer = null,
  initialFrequency = "monthly",
  onCreated,
}) {
  useScrollLock(true);
  const dispatch = useDispatch();
  const [isClosing, setIsClosing] = useState(false);

  const { customers } = useSelector((state) => state.customer);
  const { employees } = useSelector((state) => state.employee);

  const [customerSearch, setCustomerSearch] = useState(
    initialCustomer?.fullName || "",
  );
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [showCustomers, setShowCustomers] = useState(false);
  const [showEmployees, setShowEmployees] = useState(false);

  const [formData, setFormData] = useState({
    customer: initialCustomer?._id || "",
    customerName: initialCustomer?.fullName || "",
    employee: "",
    operatorName: "",
    serviceName: "",
    desc: "",
    frequency: initialFrequency || "monthly",
    serviceDate: "",
    upcomingServiceDates: [],
    address: initialCustomer?.address || "",
    amount: "",
    paymentBasis: "",
    status: "pending",
    area: "",
    locationOfPest: "",
    serviceTime: "",
    contactPerson: initialCustomer?.contactPerson || initialCustomer?.fullName || "",
    contactNumber: initialCustomer?.phone || "",
    paymentDetails: "",
    remark: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    const updated = {
      ...formData,
      [name]: value,
    };

    if (name === "frequency" && value === "one-time") {
      if (!updated.customerName && customerSearch) {
        updated.customerName = customerSearch;
      }
    }

    if (name === "serviceDate" || name === "frequency") {
      if (updated.serviceDate && updated.frequency) {
        const { upcomingServiceDates } = calculateServiceDates(
          updated.serviceDate,
          updated.frequency
        );
        updated.upcomingServiceDates = upcomingServiceDates;
      }
    }

    setFormData(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = { ...formData };
    if (!payload.paymentBasis) {
      delete payload.paymentBasis;
    }

    if (payload.frequency === "one-time") {
      const finalCustomerName = (formData.customerName || customerSearch || "").trim();
      if (!finalCustomerName) {
        toast.error("Customer name is required for One Time services");
        return;
      }
      payload.customerName = finalCustomerName;
      if (!payload.customer) {
        delete payload.customer;
      }
      // Requirement 2: Remove Description, Remark and Payment Details from One Time Job creation
      delete payload.desc;
      delete payload.remark;
      delete payload.paymentDetails;
    } else {
      if (!payload.customer) {
        toast.error("Please select a registered customer for this service");
        return;
      }
    }

    // Requirement 3: Support both existing employee selection and manual operator entry
    const finalOperator = (formData.operatorName || employeeSearch || "").trim();
    if (finalOperator) {
      payload.operatorName = finalOperator;
    }
    if (!payload.employee) {
      delete payload.employee;
    }

    try {
      await dispatch(createService(payload)).unwrap();
      onCreated?.();
      handleClose();
      toast.success("Service created successfully.");
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          "Failed to create service. Please try again."
        )
      );
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    window.setTimeout(onClose, 200);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className={`fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-start overflow-y-auto overscroll-contain z-50 p-4 sm:p-6 ${
        isClosing ? "crm-dialog-closing" : ""
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        className={`bg-white w-full max-w-3xl rounded-3xl shadow-lg p-6 max-h-[90vh] overflow-y-auto my-auto ${
          isClosing ? "crm-dialog-panel-closing" : ""
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 mb-6">
          <h2 className="text-2xl font-bold">Create New Service</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close create service dialog"
            className="text-2xl leading-none text-slate-500 hover:text-slate-800"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Customer Selection: Option A Existing Customer, Option B Manual Customer (for One Time Jobs) */}
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <label className="font-medium text-slate-800">
                Customer Name <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                {formData.customer ? (
                  <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
                    Registered Customer
                  </span>
                ) : (formData.customerName || customerSearch.trim()) ? (
                  formData.frequency === "one-time" ? (
                    <span className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                      Manual Customer
                    </span>
                  ) : null
                ) : null}
                {(formData.customer || customerSearch) && !initialCustomer && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({
                        ...prev,
                        customer: "",
                        customerName: "",
                      }));
                      setCustomerSearch("");
                    }}
                    className="text-xs text-red-600 hover:text-red-800 underline cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <input
              type="text"
              placeholder={
                formData.frequency === "one-time"
                  ? "Search registered customer or enter manual customer name..."
                  : "Search and select customer..."
              }
              value={customerSearch}
              onChange={(e) => {
                const value = e.target.value;
                setCustomerSearch(value);
                setShowCustomers(value.trim() !== "");
                setFormData((prev) => ({
                  ...prev,
                  customer: "",
                  customerName: value,
                }));
              }}
              onFocus={() => {
                if (customerSearch.trim() && !initialCustomer) setShowCustomers(true);
              }}
              className="w-full border rounded-xl p-3 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              disabled={Boolean(initialCustomer)}
              required
            />

            {showCustomers && customerSearch.trim() !== "" && !initialCustomer && (
              <div className="absolute z-50 w-full bg-white border border-slate-200 rounded-xl mt-1 max-h-56 overflow-y-auto shadow-xl">
                {customers?.filter((customer) => {
                  const q = customerSearch.toLowerCase().trim();
                  return (
                    (customer.fullName?.toLowerCase() || "").includes(q) ||
                    (customer.jobNo?.toLowerCase() || "").includes(q) ||
                    (customer.phone?.toLowerCase() || "").includes(q) ||
                    (customer.companyName?.toLowerCase() || "").includes(q)
                  );
                }).length > 0 ? (
                  customers
                    .filter((customer) => {
                      const q = customerSearch.toLowerCase().trim();
                      return (
                        (customer.fullName?.toLowerCase() || "").includes(q) ||
                        (customer.jobNo?.toLowerCase() || "").includes(q) ||
                        (customer.phone?.toLowerCase() || "").includes(q) ||
                        (customer.companyName?.toLowerCase() || "").includes(q)
                      );
                    })
                    .map((customer) => (
                      <div
                        key={customer._id}
                        onClick={() => {
                          setFormData((prev) => ({
                            ...prev,
                            customer: customer._id,
                            customerName: customer.fullName || "",
                            address: customer.address || prev.address,
                            contactPerson:
                              customer.contactPerson || customer.fullName || prev.contactPerson,
                            contactNumber: customer.phone || prev.contactNumber,
                          }));
                          setCustomerSearch(customer.fullName);
                          setShowCustomers(false);
                        }}
                        className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 flex items-center justify-between transition"
                      >
                        <div>
                          <div className="font-medium text-slate-800">
                            {customer.fullName}
                          </div>
                          <div className="text-xs text-slate-500">
                            {customer.companyName ? `${customer.companyName} • ` : ""}
                            {customer.phone || "No phone"}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {customer.jobNo && (
                            <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                              Job: {customer.jobNo}
                            </span>
                          )}
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-medium">
                            CRM
                          </span>
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="p-3 text-sm text-slate-500 border-b border-slate-100">
                    No registered customer matching "{customerSearch.trim()}"
                  </div>
                )}

                {/* Option to use entered name as manual customer for One Time Jobs */}
                {formData.frequency === "one-time" && (
                  <div
                    onClick={() => {
                      setFormData((prev) => ({
                        ...prev,
                        customer: "",
                        customerName: customerSearch.trim(),
                      }));
                      setShowCustomers(false);
                    }}
                    className="p-3 bg-amber-50/80 hover:bg-amber-100/80 cursor-pointer text-amber-900 flex items-center justify-between transition"
                  >
                    <div className="text-sm">
                      Use <strong className="font-semibold">"{customerSearch.trim()}"</strong> as manual customer
                    </div>
                    <span className="text-[10px] bg-amber-200/80 text-amber-800 px-2 py-0.5 rounded font-bold">
                      Manual
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Employee / Operator Selection (Registered or Manual) */}
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <label className="font-medium text-slate-800">
                Employee / Operator
              </label>
              {formData.employee ? (
                <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
                  Registered Employee
                </span>
              ) : formData.operatorName || employeeSearch.trim() ? (
                <span className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                  Manual Operator
                </span>
              ) : null}
            </div>
            <input
              type="text"
              placeholder="Search employee or type manual operator name..."
              value={employeeSearch}
              onChange={(e) => {
                const value = e.target.value;
                setEmployeeSearch(value);
                setShowEmployees(value.trim() !== "");
                setFormData((prev) => ({
                  ...prev,
                  employee: "",
                  operatorName: value,
                }));
              }}
              onFocus={() => {
                if (employeeSearch.trim()) setShowEmployees(true);
              }}
              className="w-full border rounded-xl p-3 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />

            {showEmployees && employeeSearch.trim() !== "" && (
              <div className="absolute z-40 w-full bg-white border border-slate-200 rounded-xl mt-1 max-h-56 overflow-y-auto shadow-xl">
                {employees?.filter((employee) =>
                  employee.fullName
                    .toLowerCase()
                    .includes(employeeSearch.toLowerCase()),
                ).length > 0 && (
                  employees
                    .filter((employee) =>
                      employee.fullName
                        .toLowerCase()
                        .includes(employeeSearch.toLowerCase()),
                    )
                    .map((employee) => (
                      <div
                        key={employee._id}
                        onClick={() => {
                          setFormData({
                            ...formData,
                            employee: employee._id,
                            operatorName: employee.fullName,
                          });
                          setEmployeeSearch(employee.fullName);
                          setShowEmployees(false);
                        }}
                        className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-medium text-slate-800">{employee.fullName}</div>
                          <div className="text-xs text-slate-500">
                            {employee.role || "Operator"} {employee.phone ? `• ${employee.phone}` : ""}
                          </div>
                        </div>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                          Employee DB
                        </span>
                      </div>
                    ))
                )}

                {/* Option to use typed name as manual operator */}
                <div
                  onClick={() => {
                    setFormData({
                      ...formData,
                      employee: "",
                      operatorName: employeeSearch.trim(),
                    });
                    setShowEmployees(false);
                  }}
                  className="p-3 bg-amber-50/70 hover:bg-amber-100/70 cursor-pointer text-amber-900 flex items-center justify-between"
                >
                  <div className="text-sm">
                    Use <strong className="font-semibold">"{employeeSearch.trim()}"</strong> as manual operator
                  </div>
                  <span className="text-[10px] bg-amber-200/80 text-amber-800 px-2 py-0.5 rounded font-bold">
                    Manual
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Service Name */}
          <div>
            <label className="block mb-2 font-medium">Service Name</label>
            <input
              type="text"
              name="serviceName"
              value={formData.serviceName}
              onChange={handleChange}
              className="w-full border rounded-xl p-3"
              required
            />
          </div>

          {/* Description (Only for regular services - Requirement 2) */}
          {formData.frequency !== "one-time" && (
            <div>
              <label className="block mb-2 font-medium">Description</label>
              <textarea
                name="desc"
                value={formData.desc}
                onChange={handleChange}
                rows="4"
                className="w-full border rounded-xl p-3"
              />
            </div>
          )}

          {/* Frequency */}
          <div>
            <label className="block mb-2 font-medium">Frequency</label>
            <select
              name="frequency"
              value={formData.frequency}
              onChange={handleChange}
              className="w-full border rounded-xl p-3"
            >
              <option value="one-time">One Time</option>
              <option value="weekly">Weekly</option>
              <option value="twice a week">Twice a Week</option>
              <option value="monthly">Monthly</option>
              <option value="Fourth nightly">Fourth nightly</option>
              <option value="Quarterly">Quarterly</option>
              <option value="Half-Yearly">Half-Yearly</option>
              <option value="Yearly 3 services">Yearly 3 services</option>
              <option value="Yearly">Yearly</option>
            </select>
          </div>

          {/* One Time Job Number indicator */}
          {formData.frequency === "one-time" && (
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 flex items-center justify-between text-xs">
              <span className="font-semibold text-amber-900">
                Job Number (One Time Job):
              </span>
              <span className="font-mono font-bold text-amber-700 bg-white px-2.5 py-1 rounded-md border border-amber-200">
                Auto-generated on creation (Job No/...)
              </span>
            </div>
          )}

          {/* Dates & Time */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className={formData.frequency === "one-time" ? "" : "md:col-span-2"}>
              <label className="block mb-2 font-medium">Service Date</label>
              <input
                type="date"
                name="serviceDate"
                value={formData.serviceDate}
                onChange={handleChange}
                className="w-full border rounded-xl p-3"
                required
              />
            </div>

            {formData.frequency === "one-time" && (
              <div>
                <label className="block mb-2 font-medium">Service Time</label>
                <input
                  type="text"
                  name="serviceTime"
                  placeholder="e.g. 1:00 PM or 11:30 AM"
                  value={formData.serviceTime}
                  onChange={handleChange}
                  className="w-full border rounded-xl p-3"
                />
              </div>
            )}

            {isMultiDateFrequency(formData.frequency) &&
              formData.upcomingServiceDates?.length > 0 && (
                <div className="md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">
                    Calculated Upcoming Service Dates (
                    {formData.upcomingServiceDates.length}) — Service 1 (Initial):{" "}
                    {formatDate(formData.serviceDate)}
                  </p>
                  <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
                    {formData.upcomingServiceDates.map((d, i) => (
                      <span
                        key={i}
                        className="bg-white border border-slate-300 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-700 shadow-xs"
                      >
                        Service {i + 2}: {formatDate(d)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
          </div>

          {/* One Time Job Specific Details */}
          {formData.frequency === "one-time" && (
            <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-200/70 space-y-4">
              <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                One Time Job (Service Paper) Details
              </h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block mb-2 font-medium text-sm">Premises Area</label>
                  <input
                    type="text"
                    name="area"
                    placeholder="e.g. Labour Camp - 80 Rooms"
                    value={formData.area}
                    onChange={handleChange}
                    className="w-full border rounded-xl p-3 bg-white"
                  />
                </div>
                <div>
                  <label className="block mb-2 font-medium text-sm">Location of Pest</label>
                  <input
                    type="text"
                    name="locationOfPest"
                    placeholder="e.g. Labour Camp Internal Area"
                    value={formData.locationOfPest}
                    onChange={handleChange}
                    className="w-full border rounded-xl p-3 bg-white"
                  />
                </div>
                <div>
                  <label className="block mb-2 font-medium text-sm">Contact Person</label>
                  <input
                    type="text"
                    name="contactPerson"
                    placeholder="Contact person name"
                    value={formData.contactPerson}
                    onChange={handleChange}
                    className="w-full border rounded-xl p-3 bg-white"
                  />
                </div>
                <div>
                  <label className="block mb-2 font-medium text-sm">Contact Number</label>
                  <input
                    type="text"
                    name="contactNumber"
                    placeholder="Contact phone number"
                    value={formData.contactNumber}
                    onChange={handleChange}
                    className="w-full border rounded-xl p-3 bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Address */}
          <div>
            <label className="block mb-2 font-medium">Address</label>
            <textarea
              name="address"
              value={formData.address}
              onChange={handleChange}
              rows="3"
              className="w-full border rounded-xl p-3"
              required
            />
          </div>

          {/* Amount & Payment Basis */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-2 font-medium">Amount</label>
              <input
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                className="w-full border rounded-xl p-3"
                required
              />
            </div>

            <div>
              <label className="block mb-2 font-medium">Payment Basis</label>
              <select
                name="paymentBasis"
                value={formData.paymentBasis}
                onChange={handleChange}
                className="w-full border rounded-xl p-3 bg-white"
              >
                <option value="">Select Payment Basis</option>
                {PAYMENT_BASIS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block mb-2 font-medium">Status</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full border rounded-xl p-3"
            >
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="due">Due</option>
              <option value="expired">Expired</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2.5 border rounded-xl hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 cursor-pointer"
            >
              Create Service
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export default CreateServiceModal;
