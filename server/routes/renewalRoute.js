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

const router = express.Router();

router.post("/create", createRenewal);
router.get("/", getRenewals);
router.get("/:id", getRenewal);
router.get("/:id/docx", generateRenewalDocx);
router.get("/:id/pdf", generateRenewalPdf);
router.put("/:id", updateRenewal);
router.delete("/:id", deleteRenewal);

export default router;
