import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams, useNavigate } from "react-router-dom";
import { fetchEmployee, deleteEmployee } from "../slices/employeeSlice";
import { fetchEmployeeAttendance } from "../slices/attendanceSlice";
import CreateEmployeeModel from "../Components/CreateEmployeeModel";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";
import { FaArrowLeft, FaEdit, FaTrash } from "react-icons/fa";

function EmployeeDetails() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { employee, loading, error } =
    useSelector((state) => state.employee);
  const { employeeAttendance } = useSelector(
    (state) => state.attendance
  );

  useEffect(() => {
    dispatch(fetchEmployee(id));
    dispatch(fetchEmployeeAttendance(id));
  }, [dispatch, id]);

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this employee?")) {
      return;
    }

    try {
      setDeleting(true);
      await dispatch(deleteEmployee(employee._id)).unwrap();
      toast.success("Employee deleted successfully.");
      navigate("/employees");
    } catch (err) {
      toast.error(
        getErrorMessage(err, "Failed to delete employee. Please try again.")
      );
    } finally {
      setDeleting(false);
    }
  };

  const attendanceStats = useMemo(() => {
    const totalMarkedDays = employeeAttendance.length;

    if (totalMarkedDays === 0) {
      return {
        percentage: 0,
        totalMarkedDays: 0,
        presentDays: 0,
      };
    }

    const presentDays = employeeAttendance.reduce(
      (total, record) => {
        if (record.status === "present") {
          return total + 1;
        }

        if (record.status === "half-day") {
          return total + 0.5;
        }

        return total;
      },
      0
    );

    return {
      percentage: Math.round(
        (presentDays / totalMarkedDays) * 100
      ),
      totalMarkedDays,
      presentDays,
    };
  }, [employeeAttendance]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6 lg:p-8">
        Loading employee...
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6 lg:p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl">
          {error}
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6 lg:p-8">
        Employee not found
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6 lg:p-8">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 bg-white px-4 py-2 rounded-lg shadow cursor-pointer hover:bg-slate-200 flex items-center gap-2"
      >
        <FaArrowLeft /> Back
      </button>

      <div className="bg-white rounded-2xl shadow p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-cyan-600 text-white flex items-center justify-center text-2xl font-bold">
              {employee.fullName?.charAt(0)?.toUpperCase()}
            </div>

            <div>
              <h1 className="text-3xl font-bold">
                {employee.fullName}
              </h1>

              <p className="text-gray-500 capitalize">
                {employee.role}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition cursor-pointer"
            >
              <FaEdit /> Edit Employee
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition cursor-pointer disabled:opacity-50"
            >
              <FaTrash /> {deleting ? "Deleting..." : "Delete Employee"}
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <p className="text-gray-500 text-sm">
              Email
            </p>
            <p className="font-medium">
              {employee.email || "-"}
            </p>
          </div>

          <div>
            <p className="text-gray-500 text-sm">
              Phone
            </p>
            <p className="font-medium">
              {employee.phone}
            </p>
          </div>

          <div>
            <p className="text-gray-500 text-sm">
              Role
            </p>
            <p className="font-medium capitalize">
              {employee.role}
            </p>
          </div>

          <div>
            <p className="text-gray-500 text-sm">
              Salary
            </p>
            <p className="font-medium">
              ₹{employee.salary?.toLocaleString()}
            </p>
          </div>

          <div>
            <p className="text-gray-500 text-sm">
              Status
            </p>
            <p
              className={`font-medium ${
                employee.status === "active"
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {employee.status}
            </p>
          </div>

          <div>
            <p className="text-gray-500 text-sm">
              Attendance Percentage
            </p>
            <p className="font-medium text-cyan-700">
              {attendanceStats.percentage}%
            </p>
            <p className="text-xs text-gray-500">
              {attendanceStats.presentDays} present days out of{" "}
              {attendanceStats.totalMarkedDays} marked days
            </p>
          </div>

          <div>
            <p className="text-gray-500 text-sm">
              Joining Date
            </p>
            <p className="font-medium">
              {new Date(
                employee.joiningDate
              ).toLocaleDateString()}
            </p>
          </div>

          <div className="md:col-span-2">
            <p className="text-gray-500 text-sm">
              Address
            </p>
            <p className="font-medium">
              {employee.address}
            </p>
          </div>

          <div>
            <p className="text-gray-500 text-sm">
              Created At
            </p>
            <p className="font-medium">
              {new Date(
                employee.createdAt
              ).toLocaleString()}
            </p>
          </div>

          <div>
            <p className="text-gray-500 text-sm">
              Updated At
            </p>
            <p className="font-medium">
              {new Date(
                employee.updatedAt
              ).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <CreateEmployeeModel
        isOpen={showEditModal}
        employee={employee}
        onClose={() => setShowEditModal(false)}
        onUpdated={() => dispatch(fetchEmployee(id))}
      />
    </div>
  );
}

export default EmployeeDetails;
