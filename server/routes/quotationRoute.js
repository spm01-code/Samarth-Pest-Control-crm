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


const router = express.Router();

router.post("/create", createQuotation);

router.get("/", getQuotations);

router.get("/customer/:customerId", getCustomerQuotations);

router.get("/:id", getQuotation);

router.get("/:id/docx", generateQuotationDocx);
router.get("/:id/pdf", generateQuotationPdf);

router.put("/:id", updateQuotation);

router.delete("/:id", deleteQuotation);

export default router;
