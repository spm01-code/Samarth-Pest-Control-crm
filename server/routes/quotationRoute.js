import express from "express";
import {
  createQuotation,
  getQuotations,
  getQuotation,
  updateQuotation,
  deleteQuotation,
  getCustomerQuotations,
  generateQuotationDocx,
  generateQuotationPdf,
} from "../controller/quotationController.js";
import { requireAdmin, blockEmployeeMutations } from "../middleware/rbacMiddleware.js";

const router = express.Router();

router.use(blockEmployeeMutations);

// Allowed for Employee and Admin
router.post("/create", createQuotation);
router.get("/", getQuotations);
router.get("/customer/:customerId", getCustomerQuotations);
router.get("/:id", getQuotation);
router.get("/:id/docx", generateQuotationDocx);
router.get("/:id/pdf", generateQuotationPdf);

// Admin Only
router.put("/:id", requireAdmin, updateQuotation);
router.delete("/:id", requireAdmin, deleteQuotation);

export default router;
