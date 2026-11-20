import express from "express";
import {
  createCustomer,
  getAllCustomers,
  getCustomer,
  updateCustomer,
  deleteCustomer,
  restoreCustomer,
} from "../controller/customerController.js";
import { requireAdmin, blockEmployeeMutations } from "../middleware/rbacMiddleware.js";

const router = express.Router();

// Guard against PUT/PATCH/DELETE mutations for employees
router.use(blockEmployeeMutations);

// Allowed for Employee and Admin
router.get("/", getAllCustomers);
router.get("/:id", getCustomer);
router.post("/create", createCustomer);

// Admin Only
router.post("/:id/restore", requireAdmin, restoreCustomer);
router.put("/:id", requireAdmin, updateCustomer);
router.delete("/:id", requireAdmin, deleteCustomer);

export default router;
