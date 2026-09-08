import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  clearAttendanceMessage,
  fetchAttendanceByDate,
  markAttendance,
} from "../slices/attendanceSlice";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";

const statusOptions = [
  {
    value: "present",
    label: "Present",
    className: "bg-green-100 text-green-700 border-green-300",
    activeClassName:
      "bg-green-600 text-white border-green-600",
  },
  {
    value: "absent",
    label: "Absent",
    className: "bg-red-100 text-red-700 border-red-300",
    activeClassName: "bg-red-600 text-white border-red-600",
  },
  {
    value: "leave",
    label: "Leave",
    className:
      "bg-yellow-100 text-yellow-700 border-yellow-300",
    activeClassName:
      "bg-yellow-500 text-white border-yellow-500",
  },
  {
    value: "half-day",
    label: "Half Day",
    className:
      "bg-orange-100 text-orange-700 border-orange-300",
    activeClassName:
      "bg-orange-500 text-white border-orange-500",
  },
];

const getToday = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

function Attendance() {
  const dispatch = useDispatch();

  const {
    employees,
    attendance,
    exists,
    editable,
    loading,
    saving,
    error,
    success,
  } = useSelector((state) => state.attendance);

  const [selectedDate, setSelectedDate] = useState(getToday());
  const [rows, setRows] = useState([]);

  useEffect(() => {
    dispatch(clearAttendanceMessage());
    dispatch(fetchAttendanceByDate(selectedDate));
  }, [dispatch, selectedDate]);

  useEffect(() => {
    const attendanceMap = new Map(
      attendance.map((item) => [
        item.employee?._id,
        item,
      ])
    );

    const nextRows = employees.map((employee) => {
      const savedAttendance = attendanceMap.get(employee._id);

      return {
        employee: employee._id,
        fullName: employee.fullName,
        role: employee.role,
        status: savedAttendance?.status || "present",
        remarks: savedAttendance?.remarks || "",
      };
    });

    setRows(nextRows);
  }, [employees, attendance]);

  const pageSummary = useMemo(() => {
    return {
      totalEmployees: rows.length,
      present: rows.filter((row) => row.status === "present")
        .length,
      absent: rows.filter((row) => row.status === "absent")
        .length,
      leave: rows.filter((row) => row.status === "leave")
        .length,
      halfDay: rows.filter((row) => row.status === "half-day")
        .length,
    };
  }, [rows]);

  const updateRowStatus = (employeeId, status) => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.employee === employeeId
          ? { ...row, status }
          : row
      )
    );
  };

  const updateRowRemarks = (employeeId, remarks) => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.employee === employeeId
          ? { ...row, remarks }
          : row
      )
    );
  };

  const handleSave = async () => {
    const attendanceData = rows.map((row) => ({
      employee: row.employee,
      status: row.status,
      remarks: row.remarks,
    }));

    try {
      await dispatch(
        markAttendance({
          date: selectedDate,
          attendance: attendanceData,
        })
      ).unwrap();
      toast.success("Attendance saved successfully.");
    } catch (err) {
      toast.error(
        getErrorMessage(err, "Failed to save attendance. Please try again.")
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6 lg:p-8">
      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">
              Attendance
            </h1>
            <p className="text-gray-500 mt-1">
              Mark daily attendance for active employees.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div>
              <label className="block text-sm text-gray-500 mb-1">
                Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) =>
                  setSelectedDate(e.target.value)
                }
                className="border rounded-lg px-4 py-2"
              />
            </div>

            <button
              onClick={handleSave}
              disabled={!editable || saving || loading}
              className={`px-6 py-2 rounded-lg text-white font-medium self-end ${
                !editable || saving || loading
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-800/80 text-white hover:bg-blue-600"
              }`}
            >
              {saving
                ? "Saving..."
                : exists
                  ? "Update Attendance"
                  : "Save Attendance"}
            </button>
          </div>
        </div>

        {!editable && (
          <div className="mt-4 bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 rounded-lg">
            Older attendance records are view only.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        {[
          {
            key: "total",
            label: "Total Employees",
            count: pageSummary.totalEmployees || 0,
            color: "text-slate-900",
            background: "bg-slate-50 border-slate-100",
          },
          {
            key: "present",
            label: "Present",
            count: pageSummary.present || 0,
            color: "text-green-700",
            background: "bg-green-50 border-green-100",
          },
          {
            key: "absent",
            label: "Absent",
            count: pageSummary.absent || 0,
            color: "text-red-700",
            background: "bg-red-50 border-red-100",
          },
          {
            key: "leave",
            label: "Leave",
            count: pageSummary.leave || 0,
            color: "text-amber-700",
            background: "bg-amber-50 border-amber-100",
          },
          {
            key: "half",
            label: "Half Day",
            count: pageSummary.halfDay || 0,
            color: "text-orange-700",
            background: "bg-orange-50 border-orange-100",
          },
        ].map((card) => (
          <div
            key={card.key}
            className={`border rounded-2xl p-6 text-left shadow-sm transition hover:shadow-md ${card.background}`}
          >
            <p className="text-sm font-medium text-slate-600">{card.label}</p>
            <p className={`text-4xl font-bold mt-2 ${card.color}`}>{card.count}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl shadow mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-xl shadow mb-4">
          {success}
        </div>
      )}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        {loading ? (
          <div className="p-6">Loading attendance...</div>
        ) : rows.length === 0 ? (
          <div className="p-6">No active employees found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-100 text-sm text-gray-600">
                <tr>
                  <th className="p-4">Employee Name</th>
                  <th className="p-4">Employee Role</th>
                  <th className="p-4">Attendance Status</th>
                  <th className="p-4">Remarks</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.employee}
                    className="border-t border-slate-100"
                  >
                    <td className="p-4 font-medium">
                      {row.fullName}
                    </td>

                    <td className="p-4 capitalize text-gray-600">
                      {row.role}
                    </td>

                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        {statusOptions.map((option) => {
                          const isSelected =
                            row.status === option.value;

                          return (
                            <button
                              key={option.value}
                              type="button"
                              disabled={!editable}
                              onClick={() =>
                                updateRowStatus(
                                  row.employee,
                                  option.value
                                )
                              }
                              className={`px-3 py-1 rounded-full border text-sm font-medium ${
                                isSelected
                                  ? option.activeClassName
                                  : option.className
                              } ${
                                !editable
                                  ? "cursor-not-allowed opacity-80"
                                  : ""
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </td>

                    <td className="p-4">
                      <input
                        type="text"
                        value={row.remarks}
                        disabled={!editable}
                        onChange={(e) =>
                          updateRowRemarks(
                            row.employee,
                            e.target.value
                          )
                        }
                        placeholder="Optional"
                        className="w-full min-w-48 border rounded-lg px-3 py-2 disabled:bg-slate-100"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Attendance;
