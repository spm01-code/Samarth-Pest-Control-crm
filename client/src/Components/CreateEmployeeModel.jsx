import { useState, useEffect } from "react";
import { useDispatch } from "react-redux";
import { createEmployee, updateEmployee } from "../slices/employeeSlice";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";

function CreateEmployeeModel({
  isOpen,
  onClose,
  employee = null,
  onUpdated,
}) {
  const dispatch = useDispatch();
  const isEdit = Boolean(employee);

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    role: "worker",
    salary: "",
    joiningDate: "",
    address: "",
    status: "active",
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (employee) {
      setFormData({
        fullName: employee.fullName || "",
        email: employee.email || "",
        phone: employee.phone || "",
        role: employee.role || "worker",
        salary: employee.salary ?? "",
        joiningDate: employee.joiningDate
          ? new Date(employee.joiningDate).toISOString().slice(0, 10)
          : "",
        address: employee.address || "",
        status: employee.status || "active",
      });
    } else {
      setFormData({
        fullName: "",
        email: "",
        phone: "",
        role: "worker",
        salary: "",
        joiningDate: "",
        address: "",
        status: "active",
      });
    }
  }, [employee, isOpen]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);

      const employeeData = {
        ...formData,
        salary: Number(formData.salary),
      };

      if (isEdit) {
        await dispatch(
          updateEmployee({
            id: employee._id,
            employeeData,
          })
        ).unwrap();

        onUpdated?.();
        onClose();
        toast.success("Employee updated successfully.");
      } else {
        await dispatch(createEmployee(employeeData)).unwrap();

        setFormData({
          fullName: "",
          email: "",
          phone: "",
          role: "worker",
          salary: "",
          joiningDate: "",
          address: "",
          status: "active",
        });

        onClose();
        toast.success("Employee created successfully.");
      }
    } catch (error) {
      const fallback = isEdit
        ? "Failed to update employee. Please try again."
        : "Failed to create employee. Please try again.";
      toast.error(getErrorMessage(error, fallback));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            {isEdit ? "Edit Employee" : "Add Employee"}
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close add employee dialog"
            className="text-2xl leading-none text-slate-500 hover:text-slate-800"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-2 font-medium">Full Name</label>
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                required
                className="w-full border rounded-lg p-3"
                placeholder="Enter full name"
              />
            </div>

            <div>
              <label className="block mb-2 font-medium">Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full border rounded-lg p-3"
                placeholder="Enter email"
              />
            </div>
          </div>

          {/* Contact */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-2 font-medium">Phone Number</label>
              <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                required
                className="w-full border rounded-lg p-3"
                placeholder="Enter phone number"
              />
            </div>

            <div>
              <label className="block mb-2 font-medium">Joining Date</label>
              <input
                type="date"
                name="joiningDate"
                value={formData.joiningDate}
                onChange={handleChange}
                required
                className="w-full border rounded-lg p-3"
              />
            </div>
          </div>

          {/* Role & Salary */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-2 font-medium">Role</label>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="w-full border rounded-lg p-3"
              >
                <option value="worker">Worker</option>
                <option value="sales">Sales</option>
                <option value="office-staff">Office Staff</option>
              </select>
            </div>

            <div>
              <label className="block mb-2 font-medium">Salary</label>
              <input
                type="number"
                name="salary"
                value={formData.salary}
                onChange={handleChange}
                required
                className="w-full border rounded-lg p-3"
                placeholder="Enter salary"
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block mb-3 font-medium">Status</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() =>
                  setFormData({
                    ...formData,
                    status: "active",
                  })
                }
                className={`px-4 py-2 rounded-lg ${
                  formData.status === "active"
                    ? "bg-green-600 text-white"
                    : "bg-slate-100"
                }`}
              >
                Active
              </button>

              <button
                type="button"
                onClick={() =>
                  setFormData({
                    ...formData,
                    status: "inactive",
                  })
                }
                className={`px-4 py-2 rounded-lg ${
                  formData.status === "inactive"
                    ? "bg-red-600 text-white"
                    : "bg-slate-100"
                }`}
              >
                Inactive
              </button>
            </div>
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
              className="w-full border rounded-lg p-3"
              placeholder="Enter employee address"
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="border px-5 py-2 rounded-lg"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className="bg-cyan-600 hover:bg-cyan-700 text-white px-5 py-2 rounded-lg"
            >
              {loading
                ? isEdit
                  ? "Saving..."
                  : "Creating..."
                : isEdit
                  ? "Save Changes"
                  : "Create Employee"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateEmployeeModel;
