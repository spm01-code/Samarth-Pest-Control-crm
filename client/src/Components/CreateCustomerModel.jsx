import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import { addCustomer } from "../slices/customerSlice";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";
import { getNextAvailableJobNo, validateManualJobNo } from "../API/jobNumberAPI";
import { useScrollLock } from "../hooks/useScrollLock";

function CreateCustomerModal({
  isOpen,
  onClose,
}) {
  useScrollLock(isOpen);
  const dispatch = useDispatch();
  const token = useSelector((state) => state.auth.token);

  const [formData, setFormData] = useState({
    customerType: "residential",
    jobNo: "",
    fullName: "",
    companyName: "",
    phone: "",
    alternatePhone: "",
    email: "",
    address: "",
  });

  const [autoJobNoPreview, setAutoJobNoPreview] = useState("");
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [manualValidation, setManualValidation] = useState(null);
  const [validating, setValidating] = useState(false);

  // Real-time preview of smallest available Job Number based on name prefix
  useEffect(() => {
    if (!token || !isOpen) return;
    const trimmed = formData.fullName.trim();
    if (!trimmed) {
      setAutoJobNoPreview("");
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await getNextAvailableJobNo(trimmed, token);
        if (res.jobNo) {
          setAutoJobNoPreview(res.jobNo);
          if (!isManualOverride) {
            setFormData((prev) => ({ ...prev, jobNo: "" }));
          }
        }
      } catch (err) {
        // silent preview fallback
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [formData.fullName, token, isOpen, isManualOverride]);

  const handleValidateManual = async (jobNoToTest) => {
    if (!jobNoToTest || !jobNoToTest.trim()) {
      setManualValidation(null);
      return;
    }
    setValidating(true);
    try {
      const res = await validateManualJobNo(jobNoToTest.trim(), null, token);
      setManualValidation(res);
    } catch (err) {
      setManualValidation({ valid: false, message: err.message });
    } finally {
      setValidating(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isManualOverride && manualValidation && !manualValidation.valid) {
      toast.error(manualValidation.message || "Please enter a valid, available Job Number");
      return;
    }

    try {
      const payload = { ...formData };
      if (!isManualOverride) {
        delete payload.jobNo; // Backend auto-allocates smallest available
      }

      const result = await dispatch(
        addCustomer(payload)
      );

      if (addCustomer.fulfilled.match(result)) {
        onClose();

        setFormData({
          customerType: "residential",
          jobNo: "",
          fullName: "",
          companyName: "",
          phone: "",
          alternatePhone: "",
          email: "",
          address: "",
        });
        setAutoJobNoPreview("");
        setIsManualOverride(false);
        setManualValidation(null);

        const assignedNo = result.payload?.customer?.jobNo;
        toast.success(
          assignedNo
            ? `Customer created successfully with Job Number ${assignedNo}.`
            : "Customer created successfully."
        );
      } else {
        toast.error(
          getErrorMessage(
            result.payload || result.error,
            "Failed to create customer. Please try again."
          )
        );
      }
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          "Failed to create customer. Please try again."
        )
      );
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex justify-center items-start sm:items-center overflow-y-auto z-50 p-4 sm:p-6 md:p-10">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto my-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Add Customer</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close add customer dialog"
            className="text-xl leading-none text-slate-500 hover:text-slate-800"
          >
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Customer Type */}
          <div>
            <label className="block mb-2 font-medium">Customer Type</label>
            <select
              name="customerType"
              value={formData.customerType}
              onChange={handleChange}
              className="w-full border rounded-lg p-3"
            >
              <option value="residential">Residential</option>
              <option value="commercial">Commercial</option>
            </select>
          </div>

          {/* Full Name */}
          <div>
            <label className="block mb-2 font-medium">Full Name</label>
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              placeholder="e.g. Ashish Vora"
              required
              className="w-full border rounded-lg p-3"
            />
          </div>

          {/* Job Number Allocation Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Job Number Allocation
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isManualOverride}
                  onChange={(e) => {
                    setIsManualOverride(e.target.checked);
                    if (!e.target.checked) {
                      setFormData((prev) => ({ ...prev, jobNo: "" }));
                      setManualValidation(null);
                    }
                  }}
                  className="rounded text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                />
                Manual Override
              </label>
            </div>

            {!isManualOverride ? (
              <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Auto-allocated:</span>
                  <span className="font-mono font-bold text-sm text-cyan-700 bg-cyan-50 px-2.5 py-0.5 rounded border border-cyan-200">
                    {autoJobNoPreview || "Enter full name to preview"}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400">
                  Smallest available in prefix sequence
                </span>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <input
                    type="text"
                    name="jobNo"
                    value={formData.jobNo}
                    onChange={(e) => {
                      handleChange(e);
                      handleValidateManual(e.target.value);
                    }}
                    placeholder="e.g. A/03 or S/05-1"
                    className="w-full bg-white border rounded-lg px-3 py-2 text-sm font-mono font-bold uppercase focus:border-cyan-500 outline-none"
                  />
                  {validating && (
                    <span className="absolute right-3 top-2.5 text-xs text-slate-400">
                      Checking...
                    </span>
                  )}
                </div>
                {manualValidation && (
                  <p
                    className={`text-xs mt-1.5 font-medium ${
                      manualValidation.valid ? "text-emerald-600" : "text-amber-600"
                    }`}
                  >
                    {manualValidation.valid
                      ? `✓ ${manualValidation.jobNo} is available for assignment`
                      : `⚠ ${manualValidation.message || "Job Number is unavailable"}`}
                  </p>
                )}
              </div>
            )}
          </div>
          {/* Company */}
          {formData.customerType === "commercial" && (
            <div>
              <label className="block mb-2 font-medium">Company Name</label>
              <input
                type="text"
                name="companyName"
                value={formData.companyName}
                onChange={handleChange}
                className="w-full border rounded-lg p-3"
              />
            </div>
          )}
          {/* Phone */}
          <div>
            <label className="block mb-2 font-medium">Phone</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              required
              className="w-full border rounded-lg p-3"
            />
          </div>
          {/* Alternate Phone */}
          <div>
            <label className="block mb-2 font-medium">Alternate Phone</label>
            <input
              type="tel"
              name="alternatePhone"
              value={formData.alternatePhone}
              onChange={handleChange}
              className="w-full border rounded-lg p-3"
            />
          </div>
          {/* Email */}
          <div>
            <label className="block mb-2 font-medium">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full border rounded-lg p-3"
            />
          </div>
          {/* Address */}
          <div>
            <label className="block mb-2 font-medium">Address</label>
            <textarea
              rows="4"
              name="address"
              value={formData.address}
              onChange={handleChange}
              required
              className="w-full border rounded-lg p-3 resize-none"
            />
          </div>
          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 border rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700"
            >
              Create Customer
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export default CreateCustomerModal;
