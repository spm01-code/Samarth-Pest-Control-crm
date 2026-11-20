import express from "express";
import {
  createInvoice,
  getInvoiceById,
  getInvoiceByServiceId,
  getInvoices,
  updateInvoice,
  deleteInvoice,
  generateInvoiceDocxFile,
  generateInvoicePdf,
} from "../controller/invoiceController.js";
import { requireAdmin, blockEmployeeMutations } from "../middleware/rbacMiddleware.js";

const router = express.Router();

router.use(blockEmployeeMutations);

// Allowed for Employee and Admin
router.post("/create", createInvoice);
router.get("/service/:serviceId", getInvoiceByServiceId);
router.get("/:id/docx", generateInvoiceDocxFile);
router.get("/:id/pdf", generateInvoicePdf);
router.get("/", getInvoices);
router.get("/:id", getInvoiceById);

// Admin Only: Editing and deleting invoices
router.put("/:id", requireAdmin, updateInvoice);
router.delete("/:id", requireAdmin, deleteInvoice);

export default router;
