import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import { updateService, fetchService } from "../slices/serviceSlice";
import { fetchEmployees } from "../slices/employeeSlice";
import { fetchCustomers } from "../slices/customerSlice";
import {
  calculateServiceDates,
  formatDateForInput,
  isMultiDateFrequency,
} from "../utils/serviceDateCalculator";
import { useBodyScrollLock } from "../utils/useBodyScrollLock";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";
import { formatDateOnly as formatDate } from "../utils/dateUtils";
import { FaPlus, FaTrash, FaEdit, FaCheck } from "react-icons/fa";

function EditServiceModal({ service, onClose }) {
  const dispatch = useDispatch();
  const [isClosing, setIsClosing] = useState(false);

  // Lock background body scroll while modal is open, clean up on unmount or close
  useBodyScrollLock(true);

  const { employees } = useSelector((state) => state.employee);
  const { customers } = useSelector((state) => state.customer);

  const getInitialCustomerId = () => {
    if (!service?.customer) return "";
    if (typeof service.customer === "object") return service.customer._id || "";
    return String(service.customer);
  };

  const getInitialCustomerName = () => {
    if (service?.customerName) return service.customerName;
    if (service?.customer && typeof service.customer === "object") {
      return service.customer.fullName || service.customer.companyName || "";
    }
    if (service?.customerSnapshot?.fullName || service?.customerSnapshot?.customerName) {
      return service.customerSnapshot.fullName || service.customerSnapshot.customerName;
    }
    return "";
  };

  const getInitialCustomerSearch = () => {
    if (service?.customer && typeof service.customer === "object") {
      return service.customer.fullName || service.customer.companyName || "";
    }
    if (service?.customerName) {
      return service.customerName;
    }
    if (service?.customerSnapshot?.fullName || service?.customerSnapshot?.customerName) {
      return service.customerSnapshot.fullName || service.customerSnapshot.customerName;
    }
    return "";
  };

  const getInitialEmployeeId = () => {
    if (!service?.employee) return "";
    if (typeof service.employee === "object") return service.employee._id || "";
    return String(service.employee);
  };

  const getInitialEmployeeSearch = () => {
    if (service?.employee && typeof service.employee === "object") {
      return service.employee.fullName || "";
    }
    if (service?.operatorName) {
      return service.operatorName;
    }
    return "";
  };

  const initialUpcoming = () => {
    if (Array.isArray(service?.upcomingServiceDates) && service.upcomingServiceDates.length > 0) {
      return service.upcomingServiceDates;
    }
    if (isMultiDateFrequency(service?.frequency) && service?.serviceDate) {
      return calculateServiceDates(service.serviceDate, service.frequency).upcomingServiceDates;
    }
    return [];
  };

  const getInitialOccurrences = () => {
    if (
      Array.isArray(service?.serviceOccurrences) &&
      service.serviceOccurrences.length > 0
    ) {
      return service.serviceOccurrences.map((occ, idx) => ({
        _id: occ._id || `occ-${idx + 1}`,
        serviceNo:
          occ.serviceNo ||
          (idx === 0
            ? "1st Service / One Time"
            : idx === 1
            ? "2nd Service / Complaint"
            : idx === 2
            ? "3rd Service / Complaint"
            : `${idx + 1}th Service / Complaint`),
        occurrenceType: occ.occurrenceType || (idx === 0 ? "1st-service" : "complaint"),
        serviceDate: formatDateForInput(occ.serviceDate || service?.serviceDate),
        serviceTime: occ.serviceTime || service?.serviceTime || "",
        operatorName:
          occ.operatorName ||
          (typeof occ.employee === "object" ? occ.employee?.fullName : "") ||
          service?.operatorName ||
          (typeof service?.employee === "object" ? service?.employee?.fullName : "") ||
          "",
        employee:
          typeof occ.employee === "object"
            ? occ.employee?._id || ""
            : occ.employee || "",
        amount:
          occ.amount !== undefined && occ.amount !== null
            ? Number(occ.amount)
            : idx === 0
            ? Number(service?.amount || 0)
            : 0,
        paymentStatus: occ.paymentStatus || "Unpaid",
        clientSignature: occ.clientSignature || "",
        remark: occ.remark || "",
      }));
    }

    return [
      {
        _id: "occ-1",
        serviceNo: "1st Service / One Time",
        occurrenceType: "1st-service",
        serviceDate: formatDateForInput(service?.serviceDate),
        serviceTime: service?.serviceTime || "",
        operatorName:
          service?.operatorName ||
          (typeof service?.employee === "object"
            ? service?.employee?.fullName
            : "") ||
          "",
        employee:
          typeof service?.employee === "object"
            ? service?.employee?._id || ""
            : service?.employee || "",
        amount: Number(service?.amount || 0),
        paymentStatus: service?.paymentStatus || "Unpaid",
        clientSignature: service?.clientSignature || "",
        remark: service?.remark || "",
      },
    ];
  };

  const initialTotal = Number(service?.totalAmount ?? service?.amount ?? 0);
  const initialPaid = Number(service?.paidAmount ?? 0);
  const initialBalance = Number(
    service?.balanceAmount !== undefined
      ? service.balanceAmount
      : Math.max(0, initialTotal - initialPaid)
  );
  const initialStatus =
    service?.paymentStatus ||
    (initialBalance === 0 && initialTotal > 0
      ? "Paid"
      : initialPaid > 0
      ? "Partially Paid"
      : "Unpaid");

  const [formData, setFormData] = useState({
    customer: getInitialCustomerId(),
    customerName: getInitialCustomerName(),
    employee: getInitialEmployeeId(),
    operatorName:
      service?.operatorName ||
      (typeof service?.employee === "object" ? service?.employee?.fullName : "") ||
      "",
    jobNo: service?.jobNo || service?.jobNumber || "",
    serviceName: service?.serviceName || "",
    desc: service?.desc || "",
    frequency: service?.frequency || "",
    serviceDate: formatDateForInput(service?.serviceDate),
    nextServiceDate: formatDateForInput(service?.nextServiceDate),
    upcomingServiceDates: initialUpcoming(),
    amount: service?.amount || "",
    totalAmount: initialTotal,
    paidAmount: initialPaid,
    balanceAmount: initialBalance,
    paymentStatus: initialStatus,
    address: service?.address || "",
    status: service?.status || "",
    area: service?.area || "",
    locationOfPest: service?.locationOfPest || "",
    serviceTime: service?.serviceTime || "",
    contactPerson: service?.contactPerson || "",
    contactNumber: service?.contactNumber || "",
    paymentDetails: service?.paymentDetails || "",
    remark: service?.remark || "",
    clientSignature: service?.clientSignature || "",
    serviceOccurrences: getInitialOccurrences(),
  });

  const [customerSearch, setCustomerSearch] = useState(getInitialCustomerSearch());
  const [showCustomers, setShowCustomers] = useState(false);
  const customerDropdownRef = useRef(null);

  const [employeeSearch, setEmployeeSearch] = useState(getInitialEmployeeSearch());
  const [showEmployees, setShowEmployees] = useState(false);
  const employeeDropdownRef = useRef(null);

  // State for editing service occurrence details
  const [editingOccIndex, setEditingOccIndex] = useState(null);
  const [occForm, setOccForm] = useState(null);

  useEffect(() => {
    if (!employees || employees.length === 0) {
      dispatch(fetchEmployees());
    }
  }, [dispatch, employees]);

  useEffect(() => {
    if (!customers || customers.length === 0) {
      dispatch(fetchCustomers());
    }
  }, [dispatch, customers]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        employeeDropdownRef.current &&
        !employeeDropdownRef.current.contains(event.target)
      ) {
        setShowEmployees(false);
      }
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(event.target)
      ) {
        setShowCustomers(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

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
        const { nextServiceDate, upcomingServiceDates } = calculateServiceDates(
          updated.serviceDate,
          updated.frequency
        );
        updated.nextServiceDate = formatDateForInput(nextServiceDate);
        updated.upcomingServiceDates = upcomingServiceDates;
      }
    }

    setFormData(updated);
  };

  const handleTotalAmountChange = (newTotal) => {
    const total = Number(newTotal || 0);
    const paid = Number(formData.paidAmount || 0);
    const balance = Math.max(0, total - paid);
    const status = balance === 0 && total > 0 ? "Paid" : paid > 0 ? "Partially Paid" : "Unpaid";
    setFormData((prev) => ({
      ...prev,
      totalAmount: total,
      amount: total,
      balanceAmount: balance,
      paymentStatus: status,
    }));
  };

  const handlePaidAmountChange = (newPaid) => {
    const total = Number(formData.totalAmount || formData.amount || 0);
    const paid = Math.min(total, Math.max(0, Number(newPaid || 0)));
    const balance = Math.max(0, total - paid);
    const status = balance === 0 && total > 0 ? "Paid" : paid > 0 ? "Partially Paid" : "Unpaid";
    setFormData((prev) => ({
      ...prev,
      paidAmount: paid,
      balanceAmount: balance,
      paymentStatus: status,
    }));
  };

  // Add a subsequent service record (Requirement 4B)
  const handleAddServiceOccurrence = () => {
    const nextIdx = formData.serviceOccurrences.length;
    const ordinal =
      nextIdx === 1
        ? "2nd Service / Complaint"
        : nextIdx === 2
        ? "3rd Service / Complaint"
        : `${nextIdx + 1}th Service / Complaint`;

    const newRecord = {
      _id: `occ-${Date.now()}`,
      serviceNo: ordinal,
      occurrenceType: "complaint",
      serviceDate: formatDateForInput(new Date()),
      serviceTime: "",
      operatorName: "",
      employee: "",
      amount: 0,
      paymentStatus: "Unpaid",
      clientSignature: "",
      remark: "",
    };

    setFormData((prev) => ({
      ...prev,
      serviceOccurrences: [...prev.serviceOccurrences, newRecord],
    }));

    setEditingOccIndex(nextIdx);
    setOccForm({ ...newRecord });
  };

  const handleStartEditOccurrence = (index) => {
    setEditingOccIndex(index);
    setOccForm({ ...formData.serviceOccurrences[index] });
  };

  const handleSaveOccurrence = () => {
    if (editingOccIndex === null || !occForm) return;

    setFormData((prev) => {
      const updated = [...prev.serviceOccurrences];
      updated[editingOccIndex] = { ...occForm };

      // If editing 1st occurrence, sync root serviceDate & serviceTime
      if (editingOccIndex === 0) {
        return {
          ...prev,
          serviceDate: occForm.serviceDate || prev.serviceDate,
          serviceTime: occForm.serviceTime || prev.serviceTime,
          operatorName: occForm.operatorName || prev.operatorName,
          employee: occForm.employee || prev.employee,
          serviceOccurrences: updated,
        };
      }

      return {
        ...prev,
        serviceOccurrences: updated,
      };
    });

    setEditingOccIndex(null);
    setOccForm(null);
  };

  const handleCancelOccurrence = () => {
    setEditingOccIndex(null);
    setOccForm(null);
  };

  const handleRemoveOccurrence = (index) => {
    if (index === 0) {
      toast.error("The 1st service entry cannot be removed.");
      return;
    }
    setFormData((prev) => ({
      ...prev,
      serviceOccurrences: prev.serviceOccurrences.filter((_, idx) => idx !== index),
    }));
    if (editingOccIndex === index) {
      setEditingOccIndex(null);
      setOccForm(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = { ...formData };

    if (payload.frequency === "one-time") {
      if (!payload.customerName || !payload.customerName.trim()) {
        toast.error("Customer name is required for One Time services");
        return;
      }
      payload.customerName = payload.customerName.trim();
      if (!payload.customer) {
        payload.customer = null;
      }

      const total = Number(payload.totalAmount ?? payload.amount ?? 0);
      const paid = Number(payload.paidAmount ?? 0);
      payload.totalAmount = total;
      payload.amount = total;
      payload.paidAmount = paid;
      payload.balanceAmount = Math.max(0, total - paid);
      payload.paymentStatus =
        payload.balanceAmount === 0 && total > 0
          ? "Paid"
          : paid > 0
          ? "Partially Paid"
          : "Unpaid";

      // Ensure 1st occurrence is kept in sync with root fields
      if (Array.isArray(payload.serviceOccurrences) && payload.serviceOccurrences.length > 0) {
        payload.serviceOccurrences[0].serviceDate = payload.serviceDate;
        payload.serviceOccurrences[0].serviceTime = payload.serviceTime;
        payload.serviceOccurrences[0].operatorName = payload.operatorName;
        payload.serviceOccurrences[0].employee = payload.employee || null;
      }
    } else {
      if (!payload.customer) {
        toast.error("Please select a registered customer for this service");
        return;
      }
    }

    const finalOperator = (formData.operatorName || employeeSearch || "").trim();
    if (finalOperator) {
      payload.operatorName = finalOperator;
    }
    if (!payload.employee) {
      payload.employee = null;
    }

    // Strip client-side temporary occurrence IDs (e.g. "occ-1", "occ-...") while preserving valid MongoDB ObjectIds
    if (Array.isArray(payload.serviceOccurrences)) {
      payload.serviceOccurrences = payload.serviceOccurrences.map((occ) => {
        const cleanOcc = { ...occ };
        if (typeof cleanOcc._id === "string" && cleanOcc._id.startsWith("occ-")) {
          delete cleanOcc._id;
        }
        return cleanOcc;
      });
    }

    try {
      await dispatch(
        updateService({
          id: service._id,
          serviceData: payload,
        })
      ).unwrap();

      if (service._id) {
        await dispatch(fetchService(service._id)).unwrap();
      }

      handleClose();
      toast.success("Service updated successfully.");
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          "Failed to update service. Please try again."
        )
      );
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    window.setTimeout(onClose, 200);
  };

  const isOneTime = formData.frequency === "one-time";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit Service"
      className={`fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4 overscroll-contain ${
        isClosing ? "crm-dialog-closing" : ""
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        className={`bg-white rounded-2xl sm:rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden overscroll-contain ${
          isClosing ? "crm-dialog-panel-closing" : ""
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-800">
              {isOneTime ? "Edit One Time Job" : "Edit Service"}
            </h2>
            {isOneTime && (
              <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 font-bold px-2.5 py-1 rounded-full font-mono">
                Job No: {formData.jobNo || service.jobNo || "-"}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close edit service dialog"
            className="text-2xl leading-none text-slate-400 hover:text-slate-700 transition cursor-pointer p-1"
          >
            &times;
          </button>
        </div>

        {/* Form with Scrollable Body and Fixed Footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Customer Section: Option A CRM Customer, Option B Manual Customer (for One Time Jobs) */}
            <div className="relative" ref={customerDropdownRef}>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  Customer <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  {formData.customer ? (
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
                      Registered Customer
                    </span>
                  ) : (formData.customerName || customerSearch.trim()) ? (
                    isOneTime ? (
                      <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                        Manual Customer
                      </span>
                    ) : null
                  ) : null}
                  {(formData.customer || customerSearch) && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormData((prev) => ({ ...prev, customer: "", customerName: "" }));
                        setCustomerSearch("");
                      }}
                      className="text-xs text-red-600 hover:text-red-800 underline cursor-pointer"
                    >
                      {formData.customer && isOneTime ? "Use Manual / Change" : "Clear"}
                    </button>
                  )}
                </div>
              </div>

              <input
                type="text"
                placeholder={
                  isOneTime
                    ? "Search registered customer or enter manual customer name..."
                    : "Search and select customer..."
                }
                value={
                  customerSearch ||
                  (formData.customer &&
                    customers?.find(
                      (c) => String(c._id) === String(formData.customer)
                    )?.fullName) ||
                  formData.customerName ||
                  ""
                }
                onFocus={() => setShowCustomers(true)}
                onChange={(e) => {
                  const value = e.target.value;
                  setCustomerSearch(value);
                  setShowCustomers(true);
                  setFormData((prev) => ({
                    ...prev,
                    customer: "",
                    customerName: value,
                  }));
                }}
                className="w-full border rounded-xl p-3 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              />

              {showCustomers && (
                <div className="absolute z-50 w-full bg-white border rounded-xl mt-1 max-h-52 overflow-y-auto shadow-xl">
                  {customers && customers.length > 0 ? (
                    customers.filter(
                      (customer) =>
                        customer.fullName
                          ?.toLowerCase()
                          .includes(customerSearch.toLowerCase()) ||
                        customer.jobNo
                          ?.toLowerCase()
                          .includes(customerSearch.toLowerCase()) ||
                        customer.phone
                          ?.toLowerCase()
                          .includes(customerSearch.toLowerCase()) ||
                        customer.companyName
                          ?.toLowerCase()
                          .includes(customerSearch.toLowerCase())
                    ).length > 0 ? (
                      customers
                        .filter(
                          (customer) =>
                            customer.fullName
                              ?.toLowerCase()
                              .includes(customerSearch.toLowerCase()) ||
                            customer.jobNo
                              ?.toLowerCase()
                              .includes(customerSearch.toLowerCase()) ||
                            customer.phone
                              ?.toLowerCase()
                              .includes(customerSearch.toLowerCase()) ||
                            customer.companyName
                              ?.toLowerCase()
                              .includes(customerSearch.toLowerCase())
                        )
                        .map((customer) => {
                          const isSelected =
                            String(formData.customer) === String(customer._id);
                          return (
                            <div
                              key={customer._id}
                              onClick={() => {
                                setFormData((prev) => ({
                                  ...prev,
                                  customer: customer._id,
                                  customerName: customer.fullName || "",
                                  address: customer.address || prev.address,
                                  contactPerson: customer.contactPerson || customer.fullName || prev.contactPerson,
                                  contactNumber: customer.phone || prev.contactNumber,
                                }));
                                setCustomerSearch(customer.fullName);
                                setShowCustomers(false);
                              }}
                              className={`p-3 hover:bg-slate-100 cursor-pointer flex items-center justify-between transition ${
                                isSelected
                                  ? "bg-blue-50 text-blue-800 font-medium"
                                  : ""
                              }`}
                            >
                              <div>
                                <div className="font-medium text-slate-800">
                                  {customer.fullName}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {customer.companyName
                                    ? `${customer.companyName} • `
                                    : ""}
                                  {customer.phone || "No phone"}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {customer.jobNo ? (
                                  <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                                    {customer.jobNo}
                                  </span>
                                ) : null}
                                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-medium">
                                  CRM
                                </span>
                              </div>
                            </div>
                          );
                        })
                    ) : (
                      <div className="p-3 text-gray-500 text-sm">
                        No registered customer matching "{customerSearch}"
                      </div>
                    )
                  ) : (
                    <div className="p-3 text-gray-500 text-sm">
                      No customers available
                    </div>
                  )}

                  {/* Option to use entered name as manual customer for One Time Jobs */}
                  {isOneTime && customerSearch.trim() !== "" && (
                    <div
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          customer: "",
                          customerName: customerSearch.trim(),
                        }));
                        setShowCustomers(false);
                      }}
                      className="p-3 bg-amber-50/80 hover:bg-amber-100/80 cursor-pointer text-amber-900 flex items-center justify-between border-t border-amber-100 transition"
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

            {/* Operator / Employee Selection (Requirement 3: Option A registered, Option B manual) */}
            <div className="relative" ref={employeeDropdownRef}>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  Assigned Employee / Operator
                </label>
                <div className="flex items-center gap-2">
                  {formData.employee ? (
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
                      Registered Employee
                    </span>
                  ) : formData.operatorName || employeeSearch.trim() ? (
                    <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                      Manual Operator
                    </span>
                  ) : null}
                  {(formData.employee || employeeSearch) && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormData((prev) => ({ ...prev, employee: "", operatorName: "" }));
                        setEmployeeSearch("");
                      }}
                      className="text-xs text-red-600 hover:text-red-800 underline cursor-pointer ml-1"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <input
                type="text"
                placeholder="Search registered employee or type manual operator..."
                value={employeeSearch}
                onFocus={() => setShowEmployees(true)}
                onChange={(e) => {
                  const value = e.target.value;
                  setEmployeeSearch(value);
                  setShowEmployees(true);
                  setFormData((prev) => ({
                    ...prev,
                    employee: "",
                    operatorName: value,
                  }));
                }}
                className="w-full border rounded-xl p-3 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />

              {showEmployees && employeeSearch.trim() !== "" && (
                <div className="absolute z-40 w-full bg-white border rounded-xl mt-1 max-h-56 overflow-y-auto shadow-xl">
                  {employees && employees.length > 0 && (
                    employees.filter(
                      (emp) =>
                        emp.fullName
                          ?.toLowerCase()
                          .includes(employeeSearch.toLowerCase()) ||
                        emp.role
                          ?.toLowerCase()
                          .includes(employeeSearch.toLowerCase())
                    ).map((emp) => {
                      const isSelected = String(formData.employee) === String(emp._id);
                      return (
                        <div
                          key={emp._id}
                          onClick={() => {
                            setFormData((prev) => ({
                              ...prev,
                              employee: emp._id,
                              operatorName: emp.fullName,
                            }));
                            setEmployeeSearch(emp.fullName);
                            setShowEmployees(false);
                          }}
                          className={`p-3 hover:bg-slate-100 cursor-pointer flex items-center justify-between border-b border-slate-100 transition ${
                            isSelected ? "bg-blue-50 text-blue-800 font-medium" : ""
                          }`}
                        >
                          <div>
                            <div className="font-medium text-slate-800">{emp.fullName}</div>
                            <div className="text-xs text-gray-500">
                              {emp.role || "Operator"} {emp.phone ? ` • ${emp.phone}` : ""}
                            </div>
                          </div>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                            Employee DB
                          </span>
                        </div>
                      );
                    })
                  )}

                  <div
                    onClick={() => {
                      setFormData((prev) => ({
                        ...prev,
                        employee: "",
                        operatorName: employeeSearch.trim(),
                      }));
                      setShowEmployees(false);
                    }}
                    className="p-3 bg-amber-50/80 hover:bg-amber-100 cursor-pointer text-amber-900 flex items-center justify-between"
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

            <div>
              <label className="block mb-1 text-sm font-medium text-gray-700">
                Service Name
              </label>
              <input
                type="text"
                name="serviceName"
                value={formData.serviceName}
                onChange={handleChange}
                placeholder="Service Name"
                className="w-full border rounded-xl p-3"
                required
              />
            </div>

            {/* Description (Only for regular services) */}
            {!isOneTime && (
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  name="desc"
                  value={formData.desc}
                  onChange={handleChange}
                  placeholder="Description"
                  rows={3}
                  className="w-full border rounded-xl p-3"
                />
              </div>
            )}

            <div>
              <label className="block mb-1 text-sm font-medium text-gray-700">
                Frequency
              </label>
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
                <option value="Yearly 3 services">Yearly 3 services</option>
              </select>
            </div>

            {isOneTime && (
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 space-y-1.5">
                <label className="block text-xs font-semibold text-amber-900 uppercase tracking-wide">
                  Job Number (One Time Job):
                </label>
                <input
                  type="text"
                  name="jobNo"
                  placeholder="e.g. A/08 or SPM/OTJ/..."
                  value={formData.jobNo}
                  onChange={handleChange}
                  className="w-full border border-amber-300 rounded-lg p-2.5 bg-white font-mono font-bold text-amber-800 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">
                  Service Date
                </label>
                <input
                  type="date"
                  name="serviceDate"
                  value={formData.serviceDate}
                  onChange={handleChange}
                  className="w-full border rounded-xl p-3"
                  required
                />
              </div>

              {isOneTime ? (
                <div>
                  <label className="block mb-1 text-sm font-medium text-gray-700">
                    Service Time
                  </label>
                  <input
                    type="text"
                    name="serviceTime"
                    placeholder="e.g. 1:00 PM or 11:30 AM"
                    value={formData.serviceTime}
                    onChange={handleChange}
                    className="w-full border rounded-xl p-3"
                  />
                </div>
              ) : (
                <div>
                  <label className="block mb-1 text-sm font-medium text-gray-700">
                    Next Service Date
                  </label>
                  <input
                    type="date"
                    name="nextServiceDate"
                    value={formData.nextServiceDate}
                    onChange={handleChange}
                    className="w-full border rounded-xl p-3"
                  />
                </div>
              )}
            </div>

            {/* One Time Job Specific Details */}
            {isOneTime && (
              <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-200/70 space-y-4">
                <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                  One Time Job (Service Paper) Details
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1 text-sm font-medium text-gray-700">Premises Area</label>
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
                    <label className="block mb-1 text-sm font-medium text-gray-700">Location of Pest</label>
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
                    <label className="block mb-1 text-sm font-medium text-gray-700">Contact Person</label>
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
                    <label className="block mb-1 text-sm font-medium text-gray-700">Contact Number</label>
                    <input
                      type="text"
                      name="contactNumber"
                      placeholder="Contact phone number"
                      value={formData.contactNumber}
                      onChange={handleChange}
                      className="w-full border rounded-xl p-3 bg-white"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block mb-1 text-sm font-medium text-gray-700">Client Signature / Name</label>
                    <input
                      type="text"
                      name="clientSignature"
                      placeholder="e.g. Signed by Client or Client Representative"
                      value={formData.clientSignature}
                      onChange={handleChange}
                      className="w-full border rounded-xl p-3 bg-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* REQUIREMENT 4D: Payment Tracking for One Time Jobs */}
            {isOneTime ? (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Payment Tracking
                  </h3>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                      formData.paymentStatus === "Paid"
                        ? "bg-emerald-100 text-emerald-800"
                        : formData.paymentStatus === "Partially Paid"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    Status: {formData.paymentStatus}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block mb-1 text-xs font-semibold text-slate-600">
                      Total Amount (₹) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.totalAmount}
                      onChange={(e) => handleTotalAmountChange(e.target.value)}
                      className="w-full border rounded-xl p-2.5 bg-white font-bold text-slate-900"
                      required
                    />
                  </div>

                  <div>
                    <label className="block mb-1 text-xs font-semibold text-slate-600">
                      Paid Amount (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={formData.totalAmount}
                      value={formData.paidAmount}
                      onChange={(e) => handlePaidAmountChange(e.target.value)}
                      className="w-full border rounded-xl p-2.5 bg-white font-bold text-emerald-700"
                    />
                  </div>

                  <div>
                    <label className="block mb-1 text-xs font-semibold text-slate-600">
                      Balance Amount (₹)
                    </label>
                    <div className="w-full border rounded-xl p-2.5 bg-slate-100 font-bold text-red-600">
                      ₹{formData.balanceAmount?.toLocaleString() || "0"}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">
                  Amount
                </label>
                <input
                  type="number"
                  name="amount"
                  value={formData.amount}
                  onChange={handleChange}
                  placeholder="Amount"
                  className="w-full border rounded-xl p-3"
                  required
                />
              </div>
            )}

            {/* REQUIREMENT 4B & 4C: Visual Service History Table for One Time Jobs */}
            {isOneTime && (
              <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                      Service Records History ({formData.serviceOccurrences.length})
                    </h3>
                    <p className="text-xs text-slate-500">
                      Maintain multiple service visits for this One Time Job
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddServiceOccurrence}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs transition"
                  >
                    <FaPlus /> Add Service Record
                  </button>
                </div>

                {/* Sub-form when editing/adding an occurrence */}
                {editingOccIndex !== null && occForm && (
                  <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-blue-900 uppercase">
                        Editing: {occForm.serviceNo}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSaveOccurrence}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5 py-1 rounded-md flex items-center gap-1 font-semibold cursor-pointer"
                        >
                          <FaCheck /> Apply
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelOccurrence}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs px-2.5 py-1 rounded-md cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="block mb-1 font-semibold text-slate-700">
                          Service Sequence / Label
                        </label>
                        <input
                          type="text"
                          value={occForm.serviceNo || ""}
                          onChange={(e) => setOccForm({ ...occForm, serviceNo: e.target.value })}
                          className="w-full border rounded-lg p-2 bg-white"
                          placeholder="e.g. 2nd Service / Complaint"
                        />
                      </div>

                      <div>
                        <label className="block mb-1 font-semibold text-slate-700">
                          Service Date
                        </label>
                        <input
                          type="date"
                          value={occForm.serviceDate || ""}
                          onChange={(e) => setOccForm({ ...occForm, serviceDate: e.target.value })}
                          className="w-full border rounded-lg p-2 bg-white"
                        />
                      </div>

                      <div>
                        <label className="block mb-1 font-semibold text-slate-700">
                          Service Time
                        </label>
                        <input
                          type="text"
                          value={occForm.serviceTime || ""}
                          onChange={(e) => setOccForm({ ...occForm, serviceTime: e.target.value })}
                          className="w-full border rounded-lg p-2 bg-white"
                          placeholder="e.g. 10:30 AM"
                        />
                      </div>

                      <div>
                        <label className="block mb-1 font-semibold text-slate-700">
                          Operator Name (Manual or Employee)
                        </label>
                        <input
                          type="text"
                          value={occForm.operatorName || ""}
                          onChange={(e) => setOccForm({ ...occForm, operatorName: e.target.value })}
                          className="w-full border rounded-lg p-2 bg-white"
                          placeholder="Operator name"
                        />
                      </div>

                      <div>
                        <label className="block mb-1 font-semibold text-slate-700">
                          Amount (₹)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={occForm.amount || 0}
                          onChange={(e) => setOccForm({ ...occForm, amount: Number(e.target.value || 0) })}
                          className="w-full border rounded-lg p-2 bg-white"
                        />
                      </div>

                      <div>
                        <label className="block mb-1 font-semibold text-slate-700">
                          Payment Status
                        </label>
                        <select
                          value={occForm.paymentStatus || "Unpaid"}
                          onChange={(e) => setOccForm({ ...occForm, paymentStatus: e.target.value })}
                          className="w-full border rounded-lg p-2 bg-white"
                        >
                          <option value="Unpaid">Unpaid</option>
                          <option value="Partially Paid">Partially Paid</option>
                          <option value="Paid">Paid</option>
                        </select>
                      </div>

                      <div className="sm:col-span-2 md:col-span-3">
                        <label className="block mb-1 font-semibold text-slate-700">
                          Observations / Remark
                        </label>
                        <input
                          type="text"
                          value={occForm.remark || ""}
                          onChange={(e) => setOccForm({ ...occForm, remark: e.target.value })}
                          className="w-full border rounded-lg p-2 bg-white"
                          placeholder="Service observations / complaints details"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Table of Occurrences */}
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <th className="p-2.5 font-bold">Service No.</th>
                        <th className="p-2.5 font-bold">Service Date</th>
                        <th className="p-2.5 font-bold">Service Time</th>
                        <th className="p-2.5 font-bold">Operator Name</th>
                        <th className="p-2.5 font-bold">Amount</th>
                        <th className="p-2.5 font-bold">Payment Status</th>
                        <th className="p-2.5 font-bold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {formData.serviceOccurrences.map((occ, idx) => (
                        <tr
                          key={occ._id || idx}
                          className={`hover:bg-slate-50/80 transition ${
                            editingOccIndex === idx ? "bg-blue-50/40" : ""
                          }`}
                        >
                          <td className="p-2.5 font-semibold text-slate-800">
                            {occ.serviceNo || `${idx + 1}st Service`}
                          </td>
                          <td className="p-2.5 text-slate-700">
                            {occ.serviceDate ? formatDate(occ.serviceDate) : "-"}
                          </td>
                          <td className="p-2.5 text-slate-600">
                            {occ.serviceTime || "-"}
                          </td>
                          <td className="p-2.5 text-slate-700 font-medium">
                            {occ.operatorName || "-"}
                          </td>
                          <td className="p-2.5 font-semibold text-slate-800">
                            ₹{(Number(occ.amount) || 0).toLocaleString()}
                          </td>
                          <td className="p-2.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                occ.paymentStatus === "Paid"
                                  ? "bg-green-100 text-green-800"
                                  : occ.paymentStatus === "Partially Paid"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {occ.paymentStatus || "Unpaid"}
                            </span>
                          </td>
                          <td className="p-2.5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleStartEditOccurrence(idx)}
                              className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50 cursor-pointer mr-1"
                              title="Edit service record"
                            >
                              <FaEdit className="size-3.5 inline" />
                            </button>
                            {idx > 0 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveOccurrence(idx)}
                                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 cursor-pointer"
                                title="Remove service record"
                              >
                                <FaTrash className="size-3 inline" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <label className="block mb-1 text-sm font-medium text-gray-700">
                Address
              </label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Address"
                className="w-full border rounded-xl p-3"
                required
              />
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-gray-700">
                Status
              </label>
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
          </div>

          {/* Fixed Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50/50 shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2.5 border rounded-xl hover:bg-slate-100 transition cursor-pointer text-slate-700 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition cursor-pointer font-medium shadow-sm"
            >
              {isOneTime ? "Update One Time Job" : "Update Service"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export default EditServiceModal;
