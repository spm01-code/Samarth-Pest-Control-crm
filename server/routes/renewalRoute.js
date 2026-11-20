import express from "express";
import {
  createRenewal,
  deleteRenewal,
  getRenewal,
  getRenewals,
  updateRenewal,
  generateRenewalDocx,
  generateRenewalPdf,
} from "../controller/renewalController.js";
import { requireAdmin, blockEmployeeMutations } from "../middleware/rbacMiddleware.js";

const router = express.Router();

router.use(blockEmployeeMutations);

// Allowed for Employee and Admin
router.post("/create", createRenewal);
router.get("/", getRenewals);
router.get("/:id", getRenewal);
router.get("/:id/docx", generateRenewalDocx);
router.get("/:id/pdf", generateRenewalPdf);

// Admin Only
router.put("/:id", requireAdmin, updateRenewal);
router.delete("/:id", requireAdmin, deleteRenewal);

export default router;
