import { BASE_URL } from "./apiConfig";

// GET ATTENDANCE BY DATE
export const fetchAttendanceByDateAPI = async (
  date,
  token
) => {
  if (!token) {
    throw new Error("Please login to view attendance");
  }

  const res = await fetch(
    `${BASE_URL}/attendance/date/${date}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const result = await res.json();

  if (!res.ok) {
    throw new Error(
      result.message || "Failed to fetch attendance"
    );
  }

  return result;
};

// MARK OR UPDATE ATTENDANCE
export const markAttendanceAPI = async (
  attendanceData,
  token
) => {
  if (!token) {
    throw new Error("Please login to mark attendance");
  }

  const res = await fetch(
    `${BASE_URL}/attendance/mark`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(attendanceData),
    }
  );

  const result = await res.json();

  if (!res.ok) {
    throw new Error(
      result.message || "Failed to save attendance"
    );
  }

  return result;
};

// GET EMPLOYEE ATTENDANCE HISTORY
export const fetchEmployeeAttendanceAPI = async (
  employeeId,
  token
) => {
  if (!token) {
    throw new Error("Please login to view attendance");
  }

  const res = await fetch(
    `${BASE_URL}/attendance/employee/${employeeId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const result = await res.json();

  if (!res.ok) {
    throw new Error(
      result.message || "Failed to fetch employee attendance"
    );
  }

  return result;
};

// GET MONTHLY ATTENDANCE
export const fetchMonthlyAttendanceAPI = async (
  month,
  year,
  token
) => {
  if (!token) {
    throw new Error("Please login to view attendance");
  }

  const res = await fetch(
    `${BASE_URL}/attendance/month?month=${month}&year=${year}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const result = await res.json();

  if (!res.ok) {
    throw new Error(
      result.message || "Failed to fetch monthly attendance"
    );
  }

  return result;
};
