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

const router = express.Router();

router.post("/create", createInvoice);
router.get("/service/:serviceId", getInvoiceByServiceId);
router.get("/:id/docx", generateInvoiceDocxFile);
router.get("/:id/pdf", generateInvoicePdf);
router.get("/", getInvoices);
router.get("/:id", getInvoiceById);
router.put("/:id", updateInvoice);
router.delete("/:id", deleteInvoice);

export default router;
