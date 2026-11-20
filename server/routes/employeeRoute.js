import express from "express";
import {
  createEmployee,
  getAllEmployees,
  getEmployee,
  updateEmployee,
  deleteEmployee,
} from "../controller/employeeController.js";
import { requireAdmin } from "../middleware/rbacMiddleware.js";

const router = express.Router();

// HR Module: Strict Admin-Only Access
router.use(requireAdmin);

router.get("/", getAllEmployees);
router.get("/:id", getEmployee);
router.post("/create", createEmployee);
router.put("/:id", updateEmployee);
router.delete("/:id", deleteEmployee);

export default router;
