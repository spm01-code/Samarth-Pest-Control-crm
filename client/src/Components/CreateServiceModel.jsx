import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { createService } from "../slices/serviceSlice";
import {
  calculateServiceDates,
  formatDateForInput,
  isMultiDateFrequency,
} from "../utils/serviceDateCalculator";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";

function CreateServiceModal({ onClose, initialCustomer = null, onCreated }) {
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
    employee: "",
    serviceName: "",
    desc: "",
    frequency: "monthly",
    serviceDate: "",
    nextServiceDate: "",
    upcomingServiceDates: [],
    address: initialCustomer?.address || "",
    amount: "",
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
      await dispatch(createService(formData)).unwrap();
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

  return (
    <div
      className={`fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-start overflow-y-auto z-50 p-4 sm:p-6 ${
        isClosing ? "crm-dialog-closing" : ""
      }`}
    >
      <div
        className={`bg-white w-full max-w-3xl rounded-3xl shadow-lg p-6 max-h-[90vh] overflow-y-auto ${
          isClosing ? "crm-dialog-panel-closing" : ""
        }`}
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
          {/* Customer Search */}
          <div className="relative">
            <label className="block mb-2 font-medium">Customer</label>
            <input
              type="text"
              placeholder="Search Customer..."
              value={customerSearch}
              onChange={(e) => {
                const value = e.target.value;
                setCustomerSearch(value);
                setShowCustomers(value.trim() !== "");
              }}
              className="w-full border rounded-xl p-3"
              disabled={Boolean(initialCustomer)}
              required
            />

            {showCustomers && customerSearch.trim() !== "" && (
              <div className="absolute z-50 w-full bg-white border rounded-xl mt-1 max-h-52 overflow-y-auto shadow-lg">
                {customers?.filter((customer) =>
                  customer.fullName
                    .toLowerCase()
                    .includes(customerSearch.toLowerCase()),
                ).length > 0 ? (
                  customers
                    .filter((customer) =>
                      customer.fullName
                        .toLowerCase()
                        .includes(customerSearch.toLowerCase()),
                    )
                    .map((customer) => (
                      <div
                        key={customer._id}
                        onClick={() => {
                          setFormData({
                            ...formData,
                            customer: customer._id,
                            address: customer.address || "",
                            contactPerson: customer.contactPerson || customer.fullName || "",
                            contactNumber: customer.phone || "",
                          });

                          setCustomerSearch(customer.fullName);
                          setShowCustomers(false);
                        }}
                        className="p-3 hover:bg-slate-100 cursor-pointer"
                      >
                        <div className="font-medium">{customer.fullName}</div>
                        <div className="text-sm text-gray-500">
                          {customer.phone}
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="p-3 text-gray-500">No customer found</div>
                )}
              </div>
            )}
          </div>

          {/* Employee Search */}
          <div className="relative">
            <label className="block mb-2 font-medium">Employee</label>
            <input
              type="text"
              placeholder="Search Employee..."
              value={employeeSearch}
              onChange={(e) => {
                const value = e.target.value;
                setEmployeeSearch(value);
                setShowEmployees(value.trim() !== "");
              }}
              className="w-full border rounded-xl p-3"
              required
            />

            {showEmployees && employeeSearch.trim() !== "" && (
              <div className="absolute z-40 w-full bg-white border rounded-xl mt-1 max-h-52 overflow-y-auto shadow-lg">
                {employees?.filter((employee) =>
                  employee.fullName
                    .toLowerCase()
                    .includes(employeeSearch.toLowerCase()),
                ).length > 0 ? (
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
                          });

                          setEmployeeSearch(employee.fullName);
                          setShowEmployees(false);
                        }}
                        className="p-3 hover:bg-slate-100 cursor-pointer"
                      >
                        <div className="font-medium">{employee.fullName}</div>
                        <div className="text-sm text-gray-500">
                          {employee.role}
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="p-3 text-gray-500">No employee found</div>
                )}
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

          {/* Description */}
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
              <option value="fourth night">Fourth Night</option>
              <option value="Quarterly">Quarterly</option>
              <option value="3 Services Yearly">3 Services Yearly</option>
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
            <div>
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

            {formData.frequency === "one-time" ? (
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
            ) : (
              <div>
                <label className="block mb-2 font-medium">
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
                <div>
                  <label className="block mb-2 font-medium text-sm">Payment Details</label>
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
                  <label className="block mb-2 font-medium text-sm">Remark</label>
                  <input
                    type="text"
                    name="remark"
                    placeholder="Service remarks / observations"
                    value={formData.remark}
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

          {/* Amount */}
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
    </div>
  );
}

export default CreateServiceModal;
