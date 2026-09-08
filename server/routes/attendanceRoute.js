import express from "express";
import {
  markAttendance,
  getAttendanceByDate,
  getEmployeeAttendance,
  getMonthlyAttendance,
} from "../controller/attendanceController.js";

const router = express.Router();

router.post("/mark", markAttendance);
router.get("/date/:date", getAttendanceByDate);
router.get("/employee/:employeeId", getEmployeeAttendance);
router.get("/month", getMonthlyAttendance);

export default router;
