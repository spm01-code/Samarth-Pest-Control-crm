import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import { updateService, fetchService } from "../slices/serviceSlice";
import { fetchEmployees } from "../slices/employeeSlice";
import {
  calculateServiceDates,
  formatDateForInput,
  isMultiDateFrequency,
} from "../utils/serviceDateCalculator";
import { useBodyScrollLock } from "../utils/useBodyScrollLock";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";

function EditServiceModal({ service, onClose }) {
  const dispatch = useDispatch();
  const [isClosing, setIsClosing] = useState(false);

  // Lock background body scroll while modal is open, clean up on unmount or close
  useBodyScrollLock(true);

  const { employees } = useSelector((state) => state.employee);

  const getInitialEmployeeId = () => {
    if (!service?.employee) return "";
    if (typeof service.employee === "object") return service.employee._id || "";
    return String(service.employee);
  };

  const getInitialEmployeeName = () => {
    if (!service?.employee) return "";
    if (typeof service.employee === "object") return service.employee.fullName || "";
    return "";
  };

  const initialUpcoming = () => {
    if (Array.isArray(service.upcomingServiceDates) && service.upcomingServiceDates.length > 0) {
      return service.upcomingServiceDates;
    }
    if (isMultiDateFrequency(service.frequency) && service.serviceDate) {
      return calculateServiceDates(service.serviceDate, service.frequency).upcomingServiceDates;
    }
    return [];
  };

  const [formData, setFormData] = useState({
    employee: getInitialEmployeeId(),
    jobNo: service.jobNo || service.jobNumber || "",
    serviceName: service.serviceName || "",
    desc: service.desc || "",
    frequency: service.frequency || "",
    serviceDate: formatDateForInput(service.serviceDate),
    nextServiceDate: formatDateForInput(service.nextServiceDate),
    upcomingServiceDates: initialUpcoming(),
    amount: service.amount || "",
    address: service.address || "",
    status: service.status || "",
    area: service.area || "",
    locationOfPest: service.locationOfPest || "",
    serviceTime: service.serviceTime || "",
    contactPerson: service.contactPerson || "",
    contactNumber: service.contactNumber || "",
    paymentDetails: service.paymentDetails || "",
    remark: service.remark || "",
    clientSignature: service.clientSignature || "",
    serviceOccurrences: Array.isArray(service.serviceOccurrences)
      ? service.serviceOccurrences
      : [],
  });

  const [employeeSearch, setEmployeeSearch] = useState(getInitialEmployeeName());
  const [showEmployees, setShowEmployees] = useState(false);
  const employeeDropdownRef = useRef(null);

  useEffect(() => {
    if (!employees || employees.length === 0) {
      dispatch(fetchEmployees());
    }
  }, [dispatch, employees]);

  useEffect(() => {
    if (formData.employee && employees?.length > 0) {
      const found = employees.find(
        (emp) => String(emp._id) === String(formData.employee)
      );
      if (found && (!employeeSearch || employeeSearch !== found.fullName)) {
        setEmployeeSearch(found.fullName);
      }
    }
  }, [formData.employee, employees]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        employeeDropdownRef.current &&
        !employeeDropdownRef.current.contains(event.target)
      ) {
        setShowEmployees(false);
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await dispatch(
        updateService({
          id: service._id,
          serviceData: formData,
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
        className={`bg-white rounded-2xl sm:rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden overscroll-contain ${
          isClosing ? "crm-dialog-panel-closing" : ""
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0 bg-white">
          <h2 className="text-2xl font-bold text-slate-800">Edit Service</h2>
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
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Assign Employee */}
            <div className="relative" ref={employeeDropdownRef}>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  Assigned Employee
                </label>
                {formData.employee ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({ ...prev, employee: "" }));
                      setEmployeeSearch("");
                    }}
                    className="text-xs text-red-600 hover:text-red-800 underline cursor-pointer"
                  >
                    Clear / Unassign
                  </button>
                ) : null}
              </div>

              <input
                type="text"
                placeholder="Search and assign employee..."
                value={employeeSearch}
                onFocus={() => setShowEmployees(true)}
                onChange={(e) => {
                  const value = e.target.value;
                  setEmployeeSearch(value);
                  setShowEmployees(true);
                  if (!value.trim()) {
                    setFormData((prev) => ({ ...prev, employee: "" }));
                  }
                }}
                className="w-full border rounded-xl p-3 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />

              {showEmployees && (
                <div className="absolute z-40 w-full bg-white border rounded-xl mt-1 max-h-52 overflow-y-auto shadow-xl">
                  {employees && employees.length > 0 ? (
                    employees.filter(
                      (emp) =>
                        emp.fullName
                          ?.toLowerCase()
                          .includes(employeeSearch.toLowerCase()) ||
                        emp.role
                          ?.toLowerCase()
                          .includes(employeeSearch.toLowerCase())
                    ).length > 0 ? (
                      employees
                        .filter(
                          (emp) =>
                            emp.fullName
                              ?.toLowerCase()
                              .includes(employeeSearch.toLowerCase()) ||
                            emp.role
                              ?.toLowerCase()
                              .includes(employeeSearch.toLowerCase())
                        )
                        .map((emp) => {
                          const isSelected =
                            String(formData.employee) === String(emp._id);
                          return (
                            <div
                              key={emp._id}
                              onClick={() => {
                                setFormData((prev) => ({
                                  ...prev,
                                  employee: emp._id,
                                }));
                                setEmployeeSearch(emp.fullName);
                                setShowEmployees(false);
                              }}
                              className={`p-3 hover:bg-slate-100 cursor-pointer flex items-center justify-between transition ${
                                isSelected
                                  ? "bg-blue-50 text-blue-800 font-medium"
                                  : ""
                              }`}
                            >
                              <div>
                                <div className="font-medium text-slate-800">
                                  {emp.fullName}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {emp.role || "Operator / Technician"}
                                  {emp.phone ? ` • ${emp.phone}` : ""}
                                </div>
                              </div>
                              {isSelected && (
                                <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
                                  Assigned
                                </span>
                              )}
                            </div>
                          );
                        })
                    ) : (
                      <div className="p-3 text-gray-500 text-sm">
                        No matching employee found
                      </div>
                    )
                  ) : (
                    <div className="p-3 text-gray-500 text-sm">
                      No employees available
                    </div>
                  )}
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
                <option value="fourth night">Fourth Night</option>
                <option value="Quarterly">Quarterly</option>
                <option value="3 Services Yearly">3 Services Yearly</option>
              </select>
            </div>

            {formData.frequency === "one-time" && (
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
                <p className="text-[11px] text-amber-700">
                  Customizable (e.g. A/08). If left empty, an official number is generated on save.
                </p>
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

              {formData.frequency === "one-time" ? (
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

              {isMultiDateFrequency(formData.frequency) &&
                formData.upcomingServiceDates?.length > 0 && (
                  <div className="md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">
                      Calculated Upcoming Service Dates (
                      {formData.upcomingServiceDates.length})
                    </p>
                    <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
                      {formData.upcomingServiceDates.map((d, i) => (
                        <span
                          key={i}
                          className="bg-white border border-slate-300 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-700 shadow-xs"
                        >
                          {new Date(d).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
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
                  <div>
                    <label className="block mb-1 text-sm font-medium text-gray-700">Payment Details</label>
                    <input
                      type="text"
                      name="paymentDetails"
                      placeholder="e.g. GPay / Cash / Cheque"
                      value={formData.paymentDetails}
                      onChange={handleChange}
                      className="w-full border rounded-xl p-3 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-sm font-medium text-gray-700">Remark</label>
                    <input
                      type="text"
                      name="remark"
                      placeholder="Service remarks / observations"
                      value={formData.remark}
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
              Update Service
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export default EditServiceModal;
