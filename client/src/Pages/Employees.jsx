import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchEmployees } from "../slices/employeeSlice";
import { useNavigate } from "react-router-dom";
import CreateEmployeeModel from "../Components/CreateEmployeeModel";
import { FaPlus } from "react-icons/fa";

function Employees() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { employees, loading, error } = useSelector((state) => state.employee);

  const [search, setSearch] = useState("");

  useEffect(() => {
    dispatch(fetchEmployees());
  }, [dispatch]);

  const employeeList = Array.isArray(employees) ? employees : [];

  const filteredEmployees = employeeList.filter((employee) =>
    employee.fullName?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6 lg:p-8">
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Employees</h1>
        <p className="text-slate-500 mt-1">Manage employee records and roles</p>
        </div>
        <button
        className="right-6 bg-blue-800/80 text-white hover:bg-blue-600 px-6 py-3 rounded-xl shadow-lg flex items-center gap-2"
        onClick={() => setIsCreateOpen(true)}
      >
        <FaPlus />Add Employee
      </button>
      </div>
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[
          {
            key: "total",
            label: "Total Employees",
            count: employeeList.length,
            color: "text-slate-900",
            background: "bg-slate-50 border-slate-100",
          },
          {
            key: "workers",
            label: "Workers",
            count: employeeList.filter((e) => e.role === "technician").length,
            color: "text-green-700",
            background: "bg-green-50 border-green-100",
          },
          {
            key: "sales",
            label: "Sales Team",
            count: employeeList.filter((e) => e.role === "sales").length,
            color: "text-amber-700",
            background: "bg-amber-50 border-amber-100",
          },
          {
            key: "office",
            label: "Office Staff",
            count: employeeList.filter((e) => e.role === "office-staff").length,
            color: "text-blue-700",
            background: "bg-blue-50 border-blue-100",
          },
        ].map((card) => (
          <button
            key={card.key}
            type="button"
            className={`border rounded-2xl p-6 text-left shadow-sm transition hover:shadow-md ${card.background}`}
          >
            <p className="text-sm font-medium text-slate-600">{card.label}</p>
            <p className={`text-5xl font-bold mt-2 ${card.color}`}>{card.count}</p>
            <p className="text-xs text-slate-500 mt-2">Click to view</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search Employee..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-white rounded-xl p-3 mb-4 shadow-md shadow-blue-600/55 border border-blue-600/55"
      />

      {/* Loading */}
      {loading && (
        <div className="bg-white p-4 rounded-xl shadow">
          Loading employees...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl shadow mb-4">
          {error}
        </div>
      )}

      {/* Employee List */}
      {!loading && !error && (
        <div className="space-y-3">
          {filteredEmployees.length === 0 && (
            <div className="bg-white p-4 rounded-xl shadow">
              No employees found.
            </div>
          )}

          {filteredEmployees.map((employee) => (
            <div
              key={employee._id}
              className="bg-white rounded-xl shadow p-4 flex items-center justify-between cursor-pointer hover:bg-slate-100"
              onClick={() => navigate(`/employees/${employee._id}`)}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-800/80 text-white flex items-center justify-center font-semibold">
                  {employee.fullName?.charAt(0)?.toUpperCase()}
                </div>

                <div>
                  <p className="font-semibold">{employee.fullName}</p>

                  <p className="text-sm text-gray-500">{employee.email}</p>
                </div>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  employee.status === "active"
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {employee.status || "Active"}
              </span>
            </div>
          ))}
        </div>
      )}

      <CreateEmployeeModel
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </div>
  );
}

export default Employees;
