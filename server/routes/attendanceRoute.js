import express from "express";
import {
  markAttendance,
  getAttendanceByDate,
  getEmployeeAttendance,
  getMonthlyAttendance,
} from "../controller/attendanceController.js";
import { requireAdmin } from "../middleware/rbacMiddleware.js";

const router = express.Router();

// HR Module: Strict Admin-Only Access
router.use(requireAdmin);

router.post("/mark", markAttendance);
router.get("/date/:date", getAttendanceByDate);
router.get("/employee/:employeeId", getEmployeeAttendance);
router.get("/month", getMonthlyAttendance);

export default router;
