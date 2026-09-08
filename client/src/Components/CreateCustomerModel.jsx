import { useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch } from "react-redux";
import { addCustomer } from "../slices/customerSlice";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";

function CreateCustomerModal({
  isOpen,
  onClose,
}) {
  const dispatch = useDispatch();

  const [formData, setFormData] = useState({
    customerType: "residential",
    fullName: "",
    companyName: "",
    phone: "",
    alternatePhone: "",
    email: "",
    address: "",
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const result = await dispatch(
        addCustomer(formData)
      );

      if (addCustomer.fulfilled.match(result)) {
        onClose();

        setFormData({
          customerType: "residential",
          fullName: "",
          companyName: "",
          phone: "",
          alternatePhone: "",
          email: "",
          address: "",
        });

        toast.success("Customer created successfully.");
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
              required
              className="w-full border rounded-lg p-3"
            />
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
