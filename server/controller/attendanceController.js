import Attendance from "../model/attendanceModel.js";
import Employee from "../model/employeeModel.js";

const allowedStatuses = [
  "present",
  "absent",
  "leave",
  "half-day",
];

const getDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getNormalizedDate = (date) => {
  if (!date) {
    return null;
  }

  const selectedDate = new Date(`${date}T00:00:00.000Z`);

  if (Number.isNaN(selectedDate.getTime())) {
    return null;
  }

  return selectedDate;
};

const getDateRange = (date) => {
  const startDate = getNormalizedDate(date);

  if (!startDate) {
    return null;
  }

  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 1);

  return { startDate, endDate };
};

const canEditDate = (date) => {
  const today = getDateKey();

  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = getDateKey(yesterdayDate);

  return date === today || date === yesterday;
};

const buildSummary = (records, totalEmployees) => ({
  totalEmployees,
  present: records.filter(
    (record) => record.status === "present"
  ).length,
  absent: records.filter(
    (record) => record.status === "absent"
  ).length,
  leave: records.filter(
    (record) => record.status === "leave"
  ).length,
  halfDay: records.filter(
    (record) => record.status === "half-day"
  ).length,
});

// Mark or Update Attendance
export const markAttendance = async (req, res) => {
  try {
    const { date, attendance } = req.body;
    const selectedDate = getNormalizedDate(date);

    if (!selectedDate) {
      return res.status(400).json({
        message: "Please select a valid date",
      });
    }

    if (!canEditDate(date)) {
      return res.status(403).json({
        message:
          "Attendance can only be edited for today or yesterday",
      });
    }

    if (!Array.isArray(attendance) || attendance.length === 0) {
      return res.status(400).json({
        message: "Please add employee attendance",
      });
    }

    const activeEmployees = await Employee.find({
      status: "active",
    }).select("_id");

    const activeEmployeeIds = activeEmployees.map((employee) =>
      employee._id.toString()
    );

    const receivedEmployeeIds = attendance.map((item) =>
      item.employee?.toString()
    );

    const hasDuplicateEmployee =
      new Set(receivedEmployeeIds).size !==
      receivedEmployeeIds.length;

    if (hasDuplicateEmployee) {
      return res.status(400).json({
        message:
          "Duplicate employee attendance is not allowed",
      });
    }

    const hasInvalidEmployee = receivedEmployeeIds.some(
      (employeeId) => !activeEmployeeIds.includes(employeeId)
    );

    if (hasInvalidEmployee) {
      return res.status(400).json({
        message:
          "Attendance can be marked only for active employees",
      });
    }

    const hasMissingEmployee = activeEmployeeIds.some(
      (employeeId) => !receivedEmployeeIds.includes(employeeId)
    );

    if (hasMissingEmployee) {
      return res.status(400).json({
        message:
          "Please select attendance for every active employee",
      });
    }

    const hasInvalidStatus = attendance.some(
      (item) => !allowedStatuses.includes(item.status)
    );

    if (hasInvalidStatus) {
      return res.status(400).json({
        message: "Please select a valid status for every employee",
      });
    }

    const operations = attendance.map((item) => ({
      updateOne: {
        filter: {
          employee: item.employee,
          date: selectedDate,
        },
        update: {
          $set: {
            status: item.status,
            remarks: item.remarks || "",
            markedBy: req.admin._id,
          },
        },
        upsert: true,
      },
    }));

    await Attendance.bulkWrite(operations);

    const savedAttendance = await Attendance.find({
      date: selectedDate,
      employee: { $in: activeEmployeeIds },
    })
      .populate("employee", "fullName role status")
      .populate("markedBy", "name email")
      .sort({ createdAt: 1 });

    res.status(200).json({
      message: "Attendance Saved",
      attendance: savedAttendance,
      summary: buildSummary(
        savedAttendance,
        activeEmployees.length
      ),
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Get Attendance By Date
export const getAttendanceByDate = async (req, res) => {
  try {
    const range = getDateRange(req.params.date);

    if (!range) {
      return res.status(400).json({
        message: "Please select a valid date",
      });
    }

    const activeEmployees = await Employee.find({
      status: "active",
    }).sort({ fullName: 1 });

    const attendance = await Attendance.find({
      date: {
        $gte: range.startDate,
        $lt: range.endDate,
      },
      employee: {
        $in: activeEmployees.map((employee) => employee._id),
      },
    })
      .populate("employee", "fullName role status")
      .populate("markedBy", "name email")
      .sort({ createdAt: 1 });

    res.status(200).json({
      date: req.params.date,
      employees: activeEmployees,
      attendance,
      exists: attendance.length > 0,
      editable: canEditDate(req.params.date),
      summary: buildSummary(
        attendance,
        activeEmployees.length
      ),
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Employee Attendance History
export const getEmployeeAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.find({
      employee: req.params.employeeId,
    })
      .populate("employee", "fullName role status")
      .populate("markedBy", "name email")
      .sort({ date: -1 });

    res.status(200).json(attendance);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Monthly Attendance
export const getMonthlyAttendance = async (req, res) => {
  try {
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        message: "Month and year are required",
      });
    }

    const selectedMonth = Number(month);
    const selectedYear = Number(year);

    if (
      !Number.isInteger(selectedMonth) ||
      !Number.isInteger(selectedYear) ||
      selectedMonth < 1 ||
      selectedMonth > 12
    ) {
      return res.status(400).json({
        message: "Please select a valid month and year",
      });
    }

    const startDate = new Date(
      Date.UTC(selectedYear, selectedMonth - 1, 1)
    );
    const endDate = new Date(
      Date.UTC(selectedYear, selectedMonth, 1)
    );

    const attendance = await Attendance.find({
      date: {
        $gte: startDate,
        $lt: endDate,
      },
    })
      .populate("employee", "fullName role status")
      .populate("markedBy", "name email")
      .sort({ date: 1 });

    res.status(200).json(attendance);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};
