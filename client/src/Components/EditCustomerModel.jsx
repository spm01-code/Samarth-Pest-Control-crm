import { useState, useEffect } from "react";
import { useDispatch } from "react-redux";
import { editCustomer } from "../slices/customerSlice";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";

function EditCustomerModal({
  isOpen,
  onClose,
  customer,
}) {
  const dispatch = useDispatch();

  const [formData, setFormData] = useState({
    customerType: "",
    fullName: "",
    companyName: "",
    phone: "",
    alternatePhone: "",
    email: "",
    address: "",
    status: "",
  });

  useEffect(() => {
    if (customer) {
      setFormData({
        customerType: customer.customerType || "",
        fullName: customer.fullName || "",
        companyName: customer.companyName || "",
        phone: customer.phone || "",
        alternatePhone:
          customer.alternatePhone || "",
        email: customer.email || "",
        address: customer.address || "",
        status: customer.status || "",
      });
    }
  }, [customer]);

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
        editCustomer({
          id: customer._id,
          data: formData,
        })
      );

      if (editCustomer.fulfilled.match(result)) {
        onClose();
        toast.success("Customer updated successfully.");
      } else {
        toast.error(
          getErrorMessage(
            result.payload || result.error,
            "Failed to update customer. Please try again."
          )
        );
      }
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          "Failed to update customer. Please try again."
        )
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto">

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            Edit Customer
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close edit customer dialog"
            className="text-2xl leading-none text-slate-500 hover:text-slate-800"
          >
            &times;
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid md:grid-cols-2 gap-4"
        >

          <input
            name="fullName"
            value={formData.fullName}
            onChange={handleChange}
            placeholder="Full Name"
            className="border rounded-lg p-3"
          />

          <input
            name="companyName"
            value={formData.companyName}
            onChange={handleChange}
            placeholder="Company Name"
            className="border rounded-lg p-3"
          />

          <input
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            placeholder="Phone"
            className="border rounded-lg p-3"
          />

          <input
            name="alternatePhone"
            value={formData.alternatePhone}
            onChange={handleChange}
            placeholder="Alternate Phone"
            className="border rounded-lg p-3"
          />

          <input
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="Email"
            className="border rounded-lg p-3"
          />

          <select
            name="customerType"
            value={formData.customerType}
            onChange={handleChange}
            className="border rounded-lg p-3"
          >
            <option value="residential">
              Residential
            </option>
            <option value="commercial">
              Commercial
            </option>
          </select>

          <select
            name="status"
            value={formData.status}
            onChange={handleChange}
            className="border rounded-lg p-3"
          >
            <option value="active">
              Active
            </option>
            <option value="inactive">
              Inactive
            </option>
          </select>

          <textarea
            name="address"
            value={formData.address}
            onChange={handleChange}
            rows={4}
            className="border rounded-lg p-3 md:col-span-2"
          />

          <div className="md:col-span-2 flex justify-end gap-3 pt-4">

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 border rounded-lg"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="px-5 py-2 bg-cyan-600 text-white rounded-lg"
            >
              Save Changes
            </button>

          </div>

        </form>

      </div>
    </div>
  );
}

export default EditCustomerModal;
